import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
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

export type UserRole = 'admin' | 'customer';

export const DEFAULT_COUNTRY = 'Australia';

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

  // Prefer the contact's name while falling back to their email for the display label.
  const buildDisplayName = (
    firstName: string,
    lastName: string,
    fallback: string
  ) => {
    const name = `${firstName} ${lastName}`.trim();
    return name || fallback;
  };

  // Build lower-case keywords so the user can be located via the global search bar.
  const buildSearchKeywords = (
    email: string,
    fields: ContactProfileFields,
    additionalTerms: string[] = []
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
          fields.stateProvince,
          ...additionalTerms
        ]
          .filter(Boolean)
          .map(value => value.trim().toLowerCase())
      )
    );
  };

  // Determine whether this is the very first profile so we can automatically elevate it.
  const resolveInitialRole = useCallback(async (): Promise<UserRole> => {
    try {
      const snapshot = await getDocs(query(collection(db, 'users'), limit(1)));
      return snapshot.empty ? 'admin' : 'customer';
    } catch (error) {
      console.error('Failed to determine initial role', error);
      return 'customer';
    }
  }, []);

  // Provide the default structure that will be written to Firestore when a user
  // authenticates for the first time.
  const buildDefaultProfile = useCallback(
    async (fbUser: User) => {
      const initialRole = await resolveInitialRole();
      const baseFields: ContactProfileFields = {
        firstName: '',
        lastName: '',
        companyName: '',
        jobTitle: '',
        phoneNumber: '',
        streetAddress: '',
        city: '',
        stateProvince: '',
        postalCode: '',
        country: DEFAULT_COUNTRY
      };

      return {
        role: initialRole,
        email: fbUser.email || '',
        ...baseFields,
        displayName: fbUser.email || '',
        searchKeywords: buildSearchKeywords(
          fbUser.email || '',
          baseFields,
          [initialRole]
        ),
        createdAt: serverTimestamp()
      };
    },
    [resolveInitialRole]
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
              void (async () => {
                try {
                  const defaultProfile = await buildDefaultProfile(fbUser);
                  await setDoc(ref, defaultProfile);
                } catch (seedError) {
                  console.error('Failed to seed user profile', seedError);
                  setLoading(false);
                }
              })();
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

  const signUp = useCallback(
    async ({ email, password, ...profileFields }: SignUpPayload) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const ref = doc(db, 'users', cred.user.uid);
      const initialRole = await resolveInitialRole();
      const displayName = buildDisplayName(
        profileFields.firstName,
        profileFields.lastName,
        email
      );
      await setDoc(ref, {
        role: initialRole,
        email,
        ...profileFields,
        country: DEFAULT_COUNTRY,
        displayName,
        searchKeywords: buildSearchKeywords(email, profileFields, [initialRole]),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    },
    [resolveInitialRole]
  );

  // Allow the UI to push profile updates back to Firestore.
  const updateProfile = useCallback(
    async (payload: ContactProfileFields) => {
      if (!auth.currentUser) throw new Error('Not authenticated');
      const email = auth.currentUser.email || profile?.email || '';
      const ref = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(ref, {
        ...payload,
        country: DEFAULT_COUNTRY,
        displayName: buildDisplayName(payload.firstName, payload.lastName, email),
        searchKeywords: buildSearchKeywords(email, payload, [profile?.role ?? 'customer']),
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
