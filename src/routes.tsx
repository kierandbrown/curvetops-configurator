import { RouteObject } from 'react-router-dom';
import Layout from './layout/Layout';
import LandingPage from './pages/LandingPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import ConfiguratorPage from './features/configurator/ConfiguratorPage';
import OrdersPage from './features/orders/OrdersPage';
import AdminPage from './features/admin/AdminPage';
import MaterialsPage from './features/materials/MaterialsPage';
import AccountPage from './pages/AccountPage';
import { ProtectedRoute } from '@auth/ProtectedRoute';
import CartPage from './features/cart/CartPage';
import CheckoutPage from './features/cart/CheckoutPage';
import SpecificationsPage from './features/specifications/SpecificationsPage';

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'configurator', element: <ConfiguratorPage /> },
      {
        path: 'materials',
        element: (
          <ProtectedRoute requiredRole="admin">
            <MaterialsPage />
          </ProtectedRoute>
        )
      },
      {
        path: 'orders',
        element: (
          <ProtectedRoute>
            <OrdersPage />
          </ProtectedRoute>
        )
      },
      {
        path: 'specifications',
        element: (
          <ProtectedRoute>
            <SpecificationsPage />
          </ProtectedRoute>
        )
      },
      {
        path: 'cart',
        element: (
          <ProtectedRoute>
            <CartPage />
          </ProtectedRoute>
        )
      },
      {
        path: 'checkout',
        element: (
          <ProtectedRoute>
            <CheckoutPage />
          </ProtectedRoute>
        )
      },
      {
        path: 'account',
        element: (
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        )
      },
      {
        path: 'admin',
        element: (
          <ProtectedRoute requiredRole="admin">
            <AdminPage />
          </ProtectedRoute>
        )
      }
    ]
  },
  { path: '/signin', element: <SignInPage /> },
  { path: '/signup', element: <SignUpPage /> }
];
