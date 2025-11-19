import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@auth/AuthContext';
import Header from './Header';

const Layout: React.FC = () => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
      <Header />
      <div className="flex flex-1">
        <aside className="hidden md:flex w-80 flex-col border-r border-slate-800 bg-slate-900/60">
          <nav className="p-4 space-y-2 border-b border-slate-800 text-sm">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `block rounded px-3 py-2 hover:bg-slate-800 ${
                  isActive ? 'bg-slate-800 font-medium' : ''
                }`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/configurator"
              className={({ isActive }) =>
                `block rounded px-3 py-2 hover:bg-slate-800 ${
                  isActive ? 'bg-slate-800 font-medium' : ''
                }`
              }
            >
              Configurator
            </NavLink>
            {isAdmin && (
              <NavLink
                to="/materials"
                className={({ isActive }) =>
                  `block rounded px-3 py-2 hover:bg-slate-800 ${
                    isActive ? 'bg-slate-800 font-medium' : ''
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
                  `block rounded px-3 py-2 hover:bg-slate-800 ${
                    isActive ? 'bg-slate-800 font-medium' : ''
                  }`
                }
              >
                My Orders
              </NavLink>
            )}
            {user && (
              <NavLink
                to="/account"
                className={({ isActive }) =>
                  `block rounded px-3 py-2 hover:bg-slate-800 ${
                    isActive ? 'bg-slate-800 font-medium' : ''
                  }`
                }
              >
                Account
              </NavLink>
            )}
          </nav>
          {/* Give feature pages (such as the configurator) a place to portal sidebar tools. */}
          <div id="configurator-sidebar" className="flex-1 overflow-y-auto p-4 space-y-4" />
        </aside>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
