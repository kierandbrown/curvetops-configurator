import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@auth/AuthContext';
import Header from './Header';

const Layout: React.FC = () => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
      {/*
        Keep the brand bar and primary navigation pinned to the top of the viewport so
        customers always have access to the menu while scrolling long configurator pages.
      */}
      <div className="sticky top-0 z-40 backdrop-blur">
        <Header />
        {/*
          The primary navigation now lives directly under the header so it is always visible,
          even on smaller screens. Using a horizontal layout keeps the menu accessible without
          consuming horizontal real-estate that was previously reserved for a sidebar.
        */}
        <nav className="border-b border-slate-800 bg-slate-900/80">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-2 overflow-x-auto px-4 py-3 text-sm">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `rounded px-3 py-1.5 transition hover:bg-slate-800 ${
                  isActive ? 'bg-slate-800 font-medium' : 'bg-slate-900/40'
                }`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/configurator"
              className={({ isActive }) =>
                `rounded px-3 py-1.5 transition hover:bg-slate-800 ${
                  isActive ? 'bg-slate-800 font-medium' : 'bg-slate-900/40'
                }`
              }
            >
              Configurator
            </NavLink>
            {isAdmin && (
              <NavLink
                to="/materials"
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 transition hover:bg-slate-800 ${
                    isActive ? 'bg-slate-800 font-medium' : 'bg-slate-900/40'
                  }`
                }
              >
                Materials
              </NavLink>
            )}
            {user && (
              <NavLink
                to="/orders"
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 transition hover:bg-slate-800 ${
                    isActive ? 'bg-slate-800 font-medium' : 'bg-slate-900/40'
                  }`
                }
              >
                My Orders
              </NavLink>
            )}
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 transition hover:bg-slate-800 ${
                    isActive ? 'bg-slate-800 font-medium' : 'bg-slate-900/40'
                  }`
                }
              >
                Admin
              </NavLink>
            )}
            {user && (
              <NavLink
                to="/account"
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 transition hover:bg-slate-800 ${
                    isActive ? 'bg-slate-800 font-medium' : 'bg-slate-900/40'
                  }`
                }
              >
                Account
              </NavLink>
            )}
          </div>
        </nav>
      </div>
      <div className="flex flex-1 flex-col">
        <main className="flex-1 p-4 md:p-6">
          {/* Main routed content renders here. */}
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
