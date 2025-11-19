import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  browserLocalPersistence,
  setPersistence
} from 'firebase/auth';
import {
  getFirestore
} from 'firebase/firestore';
import {
  getStorage
} from 'firebase/storage';
import {
  getFunctions
} from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

if (!firebaseConfig.apiKey) {
  console.warn('Missing Firebase configuration. Check your .env.local.');
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
// Our Cloud Functions are deployed in australia-southeast1 so we need to tell
// the client SDK to call that region. Otherwise it defaults to us-central1 and
// the callable function fails CORS preflight when accessed from the browser.
export const functions = getFunctions(app, 'australia-southeast1');

setPersistence(auth, browserLocalPersistence).catch(console.error);
