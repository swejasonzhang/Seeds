import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert, Button, Select, Spinner } from '../components/kit';
import { ArrowRightRegular, BuildingRegular, HeartRegular, PeopleRegular, ShieldCheckmarkRegular } from '@fluentui/react-icons';
import { usePersonas, usePublicConfig } from '../api';
import { HOME_FOR, setPersona, usePersona } from '../session';
import { signOutEverywhere } from '../components/Layout';

export function SignInPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const highlight = params.get('as');
  const personas = usePersonas();
  const config = usePublicConfig();
  const [family, setFamily] = useState('');
  const [therapist, setTherapist] = useState('');

  const persona = usePersona();
  const go = (kind: 'admin' | 'therapist' | 'parent', key: string, name: string) => {
    setPersona({ kind, key, name });
    nav(HOME_FOR[kind]);
  };

  // Back from Microsoft sign-in: go straight to the right portal.
  useEffect(() => {
    if (persona?.key === 'microsoft') nav(HOME_FOR[persona.kind], { replace: true });
  }, [persona, nav]);

  const microsoft = Boolean(config.data?.entra);
  const demo = config.data?.authMode === 'demo';
  const unlinked = persona?.key === 'microsoft-unlinked';

  const microsoftCard = microsoft && (
    <div className="card mt-10 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-7">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-seed-950 text-2xl text-cream-50"><ShieldCheckmarkRegular /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-extrabold text-seed-950">Sign in with your Microsoft account</h2>
        <p className="mt-1 text-sm text-ink-500">
          Staff and therapists use their SEEDS Microsoft 365 account. Families can use the Microsoft account matching the email they gave at intake.
        </p>
      </div>
      <MicrosoftButton onClick={() => void import('../msal').then((m) => m.signInWithMicrosoft())} />
    </div>
  );

  const fam = personas.data?.families ?? [];
  const thr = personas.data?.therapists ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-3">Portals</p>
      <h1 className="text-4xl font-black tracking-tight text-seed-950 sm:text-5xl">Who’s signing in?</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-500">
        Each portal shows what that person needs, and everyone works from the same checklist, so nothing falls through the cracks.
      </p>
      {unlinked && (
        <Alert
          tone="warning"
          className="mt-6"
          title={`Signed in as ${persona?.name}, but this account isn’t linked to SEEDS yet`}
          action={<Button size="sm" variant="secondary" onClick={() => void signOutEverywhere(nav)}>Sign out</Button>}
        >
          Ask the front desk to add your Microsoft account email to your family or staff record.
        </Alert>
      )}

      {microsoftCard}

      {demo && (
        <>
          <div className="mt-12 flex items-center gap-4">
            <span className="h-px flex-1 bg-cream-300" />
            <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-ink-500">{microsoft ? 'Or explore with a demo account' : 'Demo accounts'}</span>
            <span className="h-px flex-1 bg-cream-300" />
          </div>
          <p className="mt-3 text-center text-sm text-ink-500">Fictional families, therapists and front desk, so you can try every portal.</p>
          {personas.isLoading && <Spinner label="Loading accounts…" />}
        </>
      )}

      {demo && (
      <div className="stagger mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
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
      )}
    </div>
  );
}

function MicrosoftButton({ onClick }: { onClick: () => void }) {
  // Microsoft's sign-in button guidelines: white, 1px #8C8C8C border, four-square logo, "Sign in with Microsoft".
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-12 shrink-0 items-center justify-center gap-3 rounded-md border border-[#8C8C8C] bg-white px-5 text-[15px] font-semibold text-[#5E5E5E] shadow-sm transition hover:bg-[#F3F3F3] active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-seed-500/25 focus-visible:outline-none"
    >
      <svg width="21" height="21" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>
      Sign in with Microsoft
    </button>
  );
}

function PortalCard({ icon, title, points, children, tone, active, footer }: { icon: ReactNode; title: string; points: string[]; children: ReactNode; tone: 'clay' | 'olive' | 'seed'; active: boolean; footer?: ReactNode }) {
  const iconTone = { clay: 'bg-clay-100 text-clay-700', olive: 'bg-olive-200 text-seed-950', seed: 'bg-seed-950 text-cream-50' }[tone];
  return (
    <div className={`card lift flex flex-col p-6 sm:p-7 ${active ? 'ring-2 ring-seed-500' : ''}`}>
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
