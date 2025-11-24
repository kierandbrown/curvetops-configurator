import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@auth/AuthContext';
import { routes } from './routes';
import './index.css';

const router = createBrowserRouter(routes, {
  // Cast needed while @types lag behind the runtime feature flags exposed in v6.28.
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  } as any
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);
