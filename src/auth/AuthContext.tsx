import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
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

export interface UserProfile {
  id: string;
  role: UserRole;
  companyName?: string;
  displayName?: string;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fbUser => {
      setUser(fbUser);
      if (!fbUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const ref = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setProfile({ id: snap.id, ...(snap.data() as any) });
      } else {
        const initialProfile: UserProfile = {
          id: fbUser.uid,
          role: 'customer',
          displayName: fbUser.email || ''
        };
        await setDoc(ref, {
          ...initialProfile,
          createdAt: serverTimestamp()
        });
        setProfile(initialProfile);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const ref = doc(db, 'users', cred.user.uid);
    await setDoc(ref, {
      role: 'customer',
      displayName: email,
      createdAt: serverTimestamp()
    });
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
