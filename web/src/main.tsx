import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { queryClient } from './api';
import { StaffLayout, TherapistLayout } from './components/Layout';
import { SiteLayout } from './components/SiteLayout';
import { PageSkeleton, installScrollReveal } from './components/motion';
import { Toaster, TooltipProvider } from './components/kit';
import type { PublicConfigDto } from '@seeds/shared';

// Every page is its own chunk: the first visit downloads only what that page needs.
const loaders = {
  home: () => import('./pages/site/HomePage'),
  newPatients: () => import('./pages/site/NewPatientsPage'),
  signIn: () => import('./pages/SignInPage'),
  intake: () => import('./pages/IntakePage'),
  family: () => import('./pages/FamilyPortal'),
  queue: () => import('./pages/QueuePage'),
  case: () => import('./pages/CasePage'),
  autoMatch: () => import('./pages/AutoMatchPage'),
  therapists: () => import('./pages/TherapistsPage'),
  therapistPortal: () => import('./pages/TherapistPortal'),
};

const HomePage = lazy(() => loaders.home().then((m) => ({ default: m.HomePage })));
const NewPatientsPage = lazy(() => loaders.newPatients().then((m) => ({ default: m.NewPatientsPage })));
const SignInPage = lazy(() => loaders.signIn().then((m) => ({ default: m.SignInPage })));
const IntakePage = lazy(() => loaders.intake().then((m) => ({ default: m.IntakePage })));
const FamilyPortal = lazy(() => loaders.family().then((m) => ({ default: m.FamilyPortal })));
const QueuePage = lazy(() => loaders.queue().then((m) => ({ default: m.QueuePage })));
const CasePage = lazy(() => loaders.case().then((m) => ({ default: m.CasePage })));
const AutoMatchPage = lazy(() => loaders.autoMatch().then((m) => ({ default: m.AutoMatchPage })));
const TherapistsPage = lazy(() => loaders.therapists().then((m) => ({ default: m.TherapistsPage })));
const TherapistPage = lazy(() => loaders.therapists().then((m) => ({ default: m.TherapistPage })));
const TherapistWeekPage = lazy(() => loaders.therapistPortal().then((m) => ({ default: m.TherapistWeekPage })));
const CaseloadPage = lazy(() => loaders.therapistPortal().then((m) => ({ default: m.CaseloadPage })));
const AvailabilityPage = lazy(() => loaders.therapistPortal().then((m) => ({ default: m.AvailabilityPage })));

const standalone = (el: ReactNode) => <Suspense fallback={<PageSkeleton variant="site" />}>{el}</Suspense>;

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
  { path: '/intake', element: standalone(<IntakePage />) },

  // Family portal (parents & guardians)
  { path: '/family', element: standalone(<FamilyPortal />) },

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

  // Staff portal
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
  { path: '/queue', element: <Navigate to="/staff/queue" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

async function boot() {
  try {
    const config = (await (await fetch('/api/config')).json()) as PublicConfigDto;
    queryClient.setQueryData(['config'], config);
    if (config.entra) {
      const { initMicrosoftSignIn } = await import('./msal');
      await initMicrosoftSignIn(config.entra);
    }
  } catch {
    /* API unreachable: render anyway; pages show their own errors */
  }
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
}
void boot();

installScrollReveal();

// After the first page has painted, warm the other chunks while the browser is idle,
// so navigation feels instant without making the first load any heavier.
const idle = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 2500));
window.addEventListener('load', () => idle(() => Object.values(loaders).forEach((load) => void load().catch(() => undefined))));
