import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '@auth/AuthContext';
import { db } from '@auth/firebase';

const Header: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    // Keep the cart badge in sync with Firestore for the signed in user.
    if (!profile?.id) {
      setCartCount(0);
      return;
    }

    const cartRef = collection(db, 'cartItems');
    const cartQuery = query(cartRef, where('userId', '==', profile.id));
    const unsubscribe = onSnapshot(cartQuery, snapshot => {
      setCartCount(snapshot.size);
    });

    return () => unsubscribe();
  }, [profile?.id]);

  return (
    <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300">
            BETA
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Top Store
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                {/* Make the signed-in email the single entry point to account management. */}
                <Link to="/account" className="text-slate-300 hover:text-emerald-300">
                  {user.email}
                </Link>
                <button
                  onClick={signOut}
                  className="rounded bg-slate-800 px-3 py-1.5 hover:bg-slate-700"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/signin" className="hover:text-emerald-300">
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="rounded bg-emerald-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-emerald-400"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
          <Link
            to="/cart"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-800 bg-slate-900/70 text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
            aria-label="Open cart"
            title={user ? 'View cart' : 'Sign in to save tops'}
          >
            {/* Simple shopping cart glyph keeps us dependency-free. */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden
            >
              <circle cx="9" cy="20" r="1.4" />
              <circle cx="17" cy="20" r="1.4" />
              <path d="M5 5h2l1.5 9h9l1.5-7h-14" />
            </svg>
            <span className="absolute -top-1.5 -right-1.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-950">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;
