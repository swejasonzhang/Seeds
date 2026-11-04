import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, Toaster } from '@fluentui/react-components';
import './index.css';
import { queryClient } from './api';
import { theme } from './theme';
import { Layout } from './components/Layout';
import { IntakePage } from './pages/IntakePage';
import { QueuePage } from './pages/QueuePage';
import { CasePage } from './pages/CasePage';
import { AutoMatchPage } from './pages/AutoMatchPage';
import { TherapistsPage, TherapistPage } from './pages/TherapistsPage';
import { TOASTER_ID } from './toast';

const router = createBrowserRouter([
  { path: '/intake', element: <IntakePage /> }, // public, family-facing
  {
    element: <Layout />, // staff console
    children: [
      { index: true, element: <Navigate to="/queue" replace /> },
      { path: '/queue', element: <QueuePage /> },
      { path: '/cases/:id', element: <CasePage /> },
      { path: '/auto-match', element: <AutoMatchPage /> },
      { path: '/therapists', element: <TherapistsPage /> },
      { path: '/therapists/:id', element: <TherapistPage /> },
      { path: '*', element: <Navigate to="/queue" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster toasterId={TOASTER_ID} position="bottom-end" />
      </QueryClientProvider>
    </FluentProvider>
  </StrictMode>,
);
