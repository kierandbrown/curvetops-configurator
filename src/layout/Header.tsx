import { Link } from 'react-router-dom';
import { useAuth } from '@auth/AuthContext';

const Header: React.FC = () => {
  const { user, signOut } = useAuth();

  return (
    <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300">
            BETA
          </span>
          <span className="text-lg font-semibold tracking-tight">
            CurveTops
          </span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link to="/configurator" className="hover:text-emerald-300">
            Configure
          </Link>
          {user ? (
            <>
              <span className="hidden sm:inline text-slate-300">
                {user.email}
              </span>
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
      </div>
    </header>
  );
};

export default Header;
