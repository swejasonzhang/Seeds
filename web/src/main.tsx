import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { queryClient } from './api';
import { StaffLayout, TherapistLayout } from './components/Layout';
import { SiteLayout } from './components/SiteLayout';
import { HomePage } from './pages/site/HomePage';
import { NewPatientsPage } from './pages/site/NewPatientsPage';
import { IntakePage } from './pages/IntakePage';
import { QueuePage } from './pages/QueuePage';
import { CasePage } from './pages/CasePage';
import { AutoMatchPage } from './pages/AutoMatchPage';
import { TherapistsPage, TherapistPage } from './pages/TherapistsPage';
import { SignInPage } from './pages/SignInPage';
import { FamilyPortal } from './pages/FamilyPortal';
import { AvailabilityPage, CaseloadPage, TherapistWeekPage } from './pages/TherapistPortal';
import { Toaster, TooltipProvider } from './components/kit';

const router = createBrowserRouter([
  // Public website (unofficial concept redesign)
  {
    element: <SiteLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'new-patients', element: <NewPatientsPage /> },
      { path: 'sign-in', element: <SignInPage /> },
    ],
  },
  { path: '/intake', element: <IntakePage /> },

  // Family portal (parents & guardians)
  { path: '/family', element: <FamilyPortal /> },

  // Therapist portal
  {
    path: '/therapist',
    element: <TherapistLayout />,
    children: [
      { index: true, element: <TherapistWeekPage /> },
      { path: 'caseload', element: <CaseloadPage /> },
      { path: 'availability', element: <AvailabilityPage /> },
    ],
  },

  // Staff console
  {
    path: '/staff',
    element: <StaffLayout />,
    children: [
      { index: true, element: <Navigate to="queue" replace /> },
      { path: 'queue', element: <QueuePage /> },
      { path: 'cases/:id', element: <CasePage /> },
      { path: 'auto-match', element: <AutoMatchPage /> },
      { path: 'therapists', element: <TherapistsPage /> },
      { path: 'therapists/:id', element: <TherapistPage /> },
    ],
  },
  // Old MVP links
  { path: '/queue', element: <Navigate to="/staff/queue" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
