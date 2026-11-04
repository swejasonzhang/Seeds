import { useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router';
import {
  CalendarClockRegular,
  CalendarLtrRegular,
  DismissRegular,
  FlashRegular,
  FormNewRegular,
  GlobeRegular,
  NavigationRegular,
  PeopleListRegular,
  PeopleQueueRegular,
  PersonHeartRegular,
  SignOutRegular,
} from '@fluentui/react-icons';
import { useQueueCounts } from '../api';
import { setPersona, usePersona, type Persona } from '../session';
import { ConceptNotice, Wordmark } from './ui';
import { Avatar, Button, Sheet } from './kit';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  end?: boolean;
}

function NavItems({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-seed-200 hover:bg-white/5 hover:text-white'}`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-clay-300" />}
              <span className="text-lg">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {n.badge ? <span className="rounded-full bg-clay-300 px-2 py-0.5 text-[11px] font-bold text-seed-950">{n.badge}</span> : null}
            </>
          )}
        </NavLink>
      ))}
      <div className="mx-3 my-3 h-px bg-white/10" />
      <Link to="/" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-seed-200 hover:bg-white/5 hover:text-white">
        <GlobeRegular className="text-lg" /> Public website
      </Link>
    </nav>
  );
}

function UserCard({ persona, role }: { persona: Persona; role: string }) {
  const nav = useNavigate();
  return (
    <div className="m-3 rounded-xl bg-white/5 p-3">
      <div className="flex items-center gap-3">
        <Avatar name={persona.name} size="sm" tone="olive" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold text-white">{persona.name}</p>
          <p className="text-xs text-seed-300">{role} · demo</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => nav('/sign-in')} className="flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-xs font-bold text-seed-100 hover:bg-white/15">Switch</button>
        <button type="button" onClick={() => { setPersona(null); nav('/'); }} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-seed-200 hover:bg-white/10" aria-label="Sign out">
          <SignOutRegular /> Sign out
        </button>
      </div>
    </div>
  );
}

function PortalShell({ label, home, items, persona, role }: { label: string; home: string; items: NavItem[]; persona: Persona; role: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <ConceptNotice tone="dark" />
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-seed-950 lg:flex">
          <Link to={home} className="px-6 pb-2 pt-6"><Wordmark light /></Link>
          <p className="eyebrow px-6 pb-4 text-seed-300">{label}</p>
          <NavItems items={items} />
          <div className="mt-auto"><UserCard persona={persona} role={role} /></div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between bg-seed-950 px-4 py-3 lg:hidden">
            <Wordmark light compact />
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="Open menu" onClick={() => setOpen(true)}>
              <NavigationRegular />
            </Button>
          </div>
          <Sheet open={open} onOpenChange={setOpen} title={`${label} menu`}>
            <div className="flex items-center justify-between px-5 pb-4">
              <Wordmark light compact />
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="Close menu" onClick={() => setOpen(false)}>
                <DismissRegular />
              </Button>
            </div>
            <NavItems items={items} onNavigate={() => setOpen(false)} />
            <div className="mt-auto"><UserCard persona={persona} role={role} /></div>
          </Sheet>
          <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export function StaffLayout() {
  const persona = usePersona();
  const counts = useQueueCounts();
  if (persona?.kind !== 'admin') return <Navigate to="/sign-in?as=staff" replace />;
  const items: NavItem[] = [
    { to: '/staff/queue', label: 'Intake queue', icon: <PeopleQueueRegular />, badge: counts.data?.counts.ready },
    { to: '/staff/auto-match', label: 'Auto-match', icon: <FlashRegular /> },
    { to: '/staff/therapists', label: 'Therapists', icon: <PersonHeartRegular /> },
    { to: '/intake', label: 'Family intake form', icon: <FormNewRegular /> },
  ];
  return <PortalShell label="Staff portal" home="/staff/queue" items={items} persona={persona} role="Front desk" />;
}

export function TherapistLayout() {
  const persona = usePersona();
  if (persona?.kind !== 'therapist') return <Navigate to="/sign-in?as=therapist" replace />;
  const items: NavItem[] = [
    { to: '/therapist', label: 'My week', icon: <CalendarLtrRegular />, end: true },
    { to: '/therapist/caseload', label: 'Caseload', icon: <PeopleListRegular /> },
    { to: '/therapist/availability', label: 'Availability', icon: <CalendarClockRegular /> },
  ];
  return <PortalShell label="Therapist portal" home="/therapist" items={items} persona={persona} role="Therapist" />;
}
