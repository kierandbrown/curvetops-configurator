import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@auth/AuthContext';
import Header from './Header';

const Layout: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
      <Header />
      <div className="flex flex-1">
        <aside className="hidden md:block w-64 border-r border-slate-800 bg-slate-900/60">
          <nav className="p-4 space-y-2 text-sm">
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
          </nav>
        </aside>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
