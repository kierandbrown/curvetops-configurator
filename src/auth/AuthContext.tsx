import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut
} from 'firebase/auth';
import {
  doc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  updateDoc
} from 'firebase/firestore';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from 'react';
import { auth, db } from './firebase';

type UserRole = 'admin' | 'customer';

export interface ContactProfileFields {
  firstName: string;
  lastName: string;
  companyName: string;
  jobTitle: string;
  phoneNumber: string;
  streetAddress: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
}

export interface UserProfile extends ContactProfileFields {
  id: string;
  role: UserRole;
  email: string;
  displayName?: string;
  searchKeywords?: string[];
}

export interface SignUpPayload extends ContactProfileFields {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: SignUpPayload) => Promise<void>;
  updateProfile: (payload: ContactProfileFields) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Provide the default structure that will be written to Firestore when a user
  // authenticates for the first time.
  const buildDefaultProfile = useCallback(
    (fbUser: User) => ({
      role: 'customer' as UserRole,
      email: fbUser.email || '',
      firstName: '',
      lastName: '',
      companyName: '',
      jobTitle: '',
      phoneNumber: '',
      streetAddress: '',
      city: '',
      stateProvince: '',
      postalCode: '',
      country: '',
      displayName: fbUser.email || '',
      searchKeywords: [(fbUser.email || '').toLowerCase()].filter(Boolean),
      createdAt: serverTimestamp()
    }),
    []
  );

  // Listen for Firebase auth changes and keep a real-time snapshot of the profile document.
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsub = onAuthStateChanged(auth, async fbUser => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      setUser(fbUser);
      if (!fbUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const ref = doc(db, 'users', fbUser.uid);

      unsubProfile = onSnapshot(
        ref,
        snapshot => {
          if (!snapshot.exists()) {
            // When online and the document truly does not exist, seed it with
            // the default profile structure. If we're offline we cannot write
            // immediately, so simply stop loading for now.
            if (!snapshot.metadata.fromCache) {
              void setDoc(ref, buildDefaultProfile(fbUser));
            } else {
              setLoading(false);
            }
            return;
          }

          const { id: _ignored, ...data } = snapshot.data() as UserProfile;
          setProfile({ id: snapshot.id, ...data });
          setLoading(false);
        },
        error => {
          console.error('Failed to load user profile', error);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubProfile) unsubProfile();
      unsub();
    };
  }, [buildDefaultProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  // Helper to prefer the contact's name while falling back to their email.
  const buildDisplayName = (firstName: string, lastName: string, fallback: string) => {
    const name = `${firstName} ${lastName}`.trim();
    return name || fallback;
  };

  // Build lower-case keywords so the user can be located via the global search bar.
  const buildSearchKeywords = (
    email: string,
    fields: ContactProfileFields
  ): string[] => {
    return Array.from(
      new Set(
        [
          email,
          fields.firstName,
          fields.lastName,
          fields.companyName,
          fields.phoneNumber,
          fields.city,
          fields.stateProvince
        ]
          .filter(Boolean)
          .map(value => value.trim().toLowerCase())
      )
    );
  };

  const signUp = useCallback(
    async ({ email, password, ...profileFields }: SignUpPayload) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const ref = doc(db, 'users', cred.user.uid);
      const displayName = buildDisplayName(
        profileFields.firstName,
        profileFields.lastName,
        email
      );
      await setDoc(ref, {
        role: 'customer',
        email,
        ...profileFields,
        displayName,
        searchKeywords: buildSearchKeywords(email, profileFields),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    },
    []
  );

  // Allow the UI to push profile updates back to Firestore.
  const updateProfile = useCallback(
    async (payload: ContactProfileFields) => {
      if (!auth.currentUser) throw new Error('Not authenticated');
      const email = auth.currentUser.email || profile?.email || '';
      const ref = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(ref, {
        ...payload,
        displayName: buildDisplayName(payload.firstName, payload.lastName, email),
        searchKeywords: buildSearchKeywords(email, payload),
        updatedAt: serverTimestamp()
      });
    },
    [profile]
  );

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    signIn,
    signUp,
    updateProfile,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
