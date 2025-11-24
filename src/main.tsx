import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@auth/AuthContext';
import { routes } from './routes';
import './index.css';

const router = createBrowserRouter(routes, {
  future: {
    // Cast needed while @types lag behind the runtime feature flags exposed in v6.28.
    v7_relativeSplatPath: true
  } as any
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider
        router={router}
        future={{
          // Opt in early to v7's transition-wrapped state updates to silence upgrade warnings.
          v7_startTransition: true
        }}
      />
    </AuthProvider>
  </React.StrictMode>
);
