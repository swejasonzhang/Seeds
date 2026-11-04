import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Select, Spinner } from '../components/kit';
import { ArrowRightRegular, BuildingRegular, HeartRegular, PeopleRegular, ShieldKeyholeRegular } from '@fluentui/react-icons';
import { usePersonas, usePublicConfig } from '../api';
import { HOME_FOR, setPersona } from '../session';

export function SignInPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const highlight = params.get('as');
  const personas = usePersonas();
  const config = usePublicConfig();
  const [family, setFamily] = useState('');
  const [therapist, setTherapist] = useState('');

  const go = (kind: 'admin' | 'therapist' | 'parent', key: string, name: string) => {
    setPersona({ kind, key, name });
    nav(HOME_FOR[kind]);
  };

  if (config.data?.authMode === 'entra') {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <ShieldKeyholeRegular className="text-4xl text-seed-500" />
        <h1 className="mt-4 text-3xl font-black text-seed-950">Sign in with Microsoft</h1>
        <p className="mt-2 text-ink-500">Staff and therapists sign in with their SEEDS Microsoft 365 account.</p>
      </div>
    );
  }

  const fam = personas.data?.families ?? [];
  const thr = personas.data?.therapists ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-3">Portals</p>
      <h1 className="text-4xl font-black tracking-tight text-seed-950 sm:text-5xl">Who’s signing in?</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-500">
        Each portal shows what that person needs, and everyone works from the same checklist, so nothing falls through the cracks.
      </p>
      <p className="mt-2 text-sm text-ink-500">
        Demo sign-in with fictional accounts. In production, families sign in with Microsoft Entra External ID and staff with Microsoft Entra ID.
      </p>

      {personas.isLoading && <Spinner label="Loading accounts…" />}

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <PortalCard
          active={highlight === 'parent'}
          icon={<HeartRegular />}
          tone="clay"
          footer={<Link to="/intake" className="font-bold text-seed-700 underline underline-offset-4">New family? Start the intake form</Link>}
          title="Parents & guardians"
          points={['Your child’s checklist: paperwork, insurance & school district steps', 'Sign forms and upload documents', 'See your therapist and session times']}
        >
          <Select aria-label="Sample family" placeholder="Choose a sample family" size="lg" value={family} onValueChange={setFamily} options={fam.map((f) => ({ value: f.key, label: f.name, hint: f.subtitle }))} />
          <Button size="lg" disabled={!family} onClick={() => go('parent', family, fam.find((f) => f.key === family)?.name ?? 'Parent')}>
            Open family portal <ArrowRightRegular />
          </Button>
        </PortalCard>

        <PortalCard
          active={highlight === 'therapist'}
          icon={<PeopleRegular />}
          tone="olive"
          title="Therapists"
          points={['Your week and today’s route with drive times', 'Caseload with everything families shared', 'Set your own availability']}
        >
          <Select aria-label="Therapist" placeholder="Choose a therapist" size="lg" value={therapist} onValueChange={setTherapist} options={thr.map((t) => ({ value: t.key, label: t.name, hint: t.subtitle }))} />
          <Button size="lg" disabled={!therapist} onClick={() => go('therapist', therapist, thr.find((t) => t.key === therapist)?.name ?? 'Therapist')}>
            Open therapist portal <ArrowRightRegular />
          </Button>
        </PortalCard>

        <PortalCard
          active={highlight === 'staff'}
          icon={<BuildingRegular />}
          tone="seed"
          title="Front desk & admin"
          points={['Every family’s intake, documents and checklist', 'All therapist availability and caseloads', 'Priority queue, matching & scheduling']}
        >
          <Button size="lg" onClick={() => go('admin', 'admin', 'Front desk')}>
            Open staff portal <ArrowRightRegular />
          </Button>
        </PortalCard>
      </div>
    </div>
  );
}

function PortalCard({ icon, title, points, children, tone, active, footer }: { icon: ReactNode; title: string; points: string[]; children: ReactNode; tone: 'clay' | 'olive' | 'seed'; active: boolean; footer?: ReactNode }) {
  const iconTone = { clay: 'bg-clay-100 text-clay-700', olive: 'bg-olive-200 text-seed-950', seed: 'bg-seed-950 text-cream-50' }[tone];
  return (
    <div className={`card flex flex-col p-6 sm:p-7 ${active ? 'ring-2 ring-seed-500' : ''}`}>
      <span className={`grid h-12 w-12 place-items-center rounded-2xl text-2xl ${iconTone}`}>{icon}</span>
      <h2 className="mt-5 text-xl font-extrabold text-seed-950">{title}</h2>
      <ul className="mt-3 flex-1 space-y-2">
        {points.map((p) => (
          <li key={p} className="flex gap-2 text-sm text-ink-700">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-clay-500" /> {p}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-col gap-3">{children}</div>
      <div className="mt-3 h-5 text-center text-sm">{footer}</div>
    </div>
  );
}
