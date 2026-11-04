import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Avatar, Button, Menu, MenuItem, Select, Tabs, TabsList, TabsTrigger } from '../components/kit';
import {
  ArrowUploadRegular,
  CalendarCheckmarkRegular,
  CallRegular,
  CheckmarkCircleRegular,
  ChevronDownRegular,
  DocumentRegular,
  HourglassHalfRegular,
  MailRegular,
  PauseCircleRegular,
  SearchInfoRegular,
  SignOutRegular,
  TaskListLtrRegular,
} from '@fluentui/react-icons';
import { DISCIPLINE_LABEL, DOCUMENT_KINDS, DOCUMENT_LABEL, FUNDING_LABEL, SETTING_LABEL, type DocumentKind, type FamilyCaseDto, type JourneyStepDto } from '@seeds/shared';
import { errorMessage, openDocument, useFamilyActions, useFamilyPortal } from '../api';
import { setPersona, usePersona } from '../session';
import { useNotify } from '../toast';
import { ConceptNotice, Wordmark } from '../components/ui';
import { JourneyProgress, JourneyView } from '../components/Journey';
import { ErrorBar, Loading, formatAge, formatDate, slotLabel } from '../components/bits';
import { PRACTICE } from '../site/practice';

export function FamilyPortal() {
  const persona = usePersona();
  const nav = useNavigate();
  const portal = useFamilyPortal();
  if (persona?.kind !== 'parent') return <Navigate to="/sign-in?as=parent" replace />;

  return (
    <div className="min-h-screen bg-cream-100">
      <ConceptNotice />
      <header className="border-b border-cream-200 bg-cream-50">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/"><Wordmark /></Link>
          <span className="hidden rounded-full bg-clay-50 px-3 py-1 text-xs font-bold text-clay-700 ring-1 ring-clay-200 sm:inline">Family portal</span>
          <div className="ml-auto">
            <Menu
              trigger={
                <Button variant="ghost" className="pl-1.5">
                  <Avatar name={persona.name} size="sm" tone="olive" />
                  <span className="hidden sm:inline">{persona.name}</span>
                  <ChevronDownRegular />
                </Button>
              }
            >
              <MenuItem onSelect={() => nav('/sign-in')}>Switch account</MenuItem>
              <MenuItem icon={<SignOutRegular />} onSelect={() => { setPersona(null); nav('/'); }}>Sign out</MenuItem>
            </Menu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {portal.isLoading && <Loading />}
        {portal.isError && <ErrorBar error={portal.error} />}
        {portal.data && (
          <>
            <p className="eyebrow mb-2">Welcome back</p>
            <h1 className="text-3xl font-black tracking-tight text-seed-950 sm:text-4xl">Hi {portal.data.guardianName.split(' ')[0]}.</h1>
            <p className="mt-2 max-w-2xl text-ink-500">Here’s where things stand. Items marked <strong className="text-clay-700">Needed to schedule</strong> are what stand between your child and their first session.</p>
            <div className="mt-8 space-y-10">
              {portal.data.children.map((child) => (
                <ChildSection key={child.id} child={child} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ChildSection({ child }: { child: { id: string; firstName: string; lastName: string; ageMonths: number; cases: FamilyCaseDto[] } }) {
  const [selected, setSelected] = useState(child.cases[0]?.id);
  const current = child.cases.find((c) => c.id === selected) ?? child.cases[0];
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Avatar name={`${child.firstName} ${child.lastName}`} size="lg" tone="dark" />
        <div>
          <h2 className="text-2xl font-extrabold text-seed-950">{child.firstName} {child.lastName}</h2>
          <p className="text-sm text-ink-500">{formatAge(child.ageMonths)}</p>
        </div>
        {child.cases.length > 1 && (
          <Tabs className="ml-auto" value={current?.id} onValueChange={setSelected}>
            <TabsList>
              {child.cases.map((c) => <TabsTrigger key={c.id} value={c.id}>{DISCIPLINE_LABEL[c.discipline]}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        )}
      </div>
      {current ? <CaseView c={current} /> : <div className="card card-pad text-ink-500">No open requests.</div>}
    </section>
  );
}

const STAGES = ['Request received', 'Checklist', 'Matching', 'Therapy'] as const;

function stageOf(c: FamilyCaseDto) {
  if (c.status === 'scheduled') return 3;
  if (c.status === 'ready') return 2;
  return 1;
}

function StatusHero({ c }: { c: FamilyCaseDto }) {
  const next = c.journey.nextForFamily;
  const map: Record<string, { icon: ReactNode; title: string; body: string; tone: string }> = {
    'pending-documents': {
      icon: <TaskListLtrRegular />,
      title: next ? `Next up: ${next.title}` : 'A few items are still open',
      body: 'Finish the items below and we’ll start matching your child with a therapist.',
      tone: 'bg-clay-50 text-clay-700 ring-clay-200',
    },
    'needs-review': { icon: <SearchInfoRegular />, title: 'Our front desk is reviewing your request', body: 'We may call to confirm a detail. You can keep working on the checklist meanwhile.', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
    ready: { icon: <HourglassHalfRegular />, title: 'You’re all set. We’re finding your therapist', body: 'We match on your schedule, location and language. Most families hear from us within a few days.', tone: 'bg-seed-50 text-seed-800 ring-seed-200' },
    scheduled: {
      icon: <CalendarCheckmarkRegular />,
      title: `Therapy is scheduled${c.therapist ? ` with ${c.therapist.name.split(',')[0]}` : ''}`,
      body: c.sessions[0] ? `First session ${formatDate(c.sessions[0].startsOn)}; it starts with an evaluation.` : 'See your sessions below.',
      tone: 'bg-seed-500 text-white ring-seed-500',
    },
    'on-hold': { icon: <PauseCircleRegular />, title: 'This request is paused', body: 'Call us whenever you’re ready to pick it back up.', tone: 'bg-cream-200 text-ink-700 ring-cream-300' },
  };
  const m = map[c.status] ?? map['on-hold']!;
  return (
    <div className={`flex items-start gap-4 rounded-2xl p-5 ring-1 ${m.tone}`}>
      <span className="text-3xl">{m.icon}</span>
      <div>
        <p className="text-lg font-extrabold">{m.title}</p>
        <p className="text-sm opacity-90">{m.body}</p>
      </div>
    </div>
  );
}

function CaseView({ c }: { c: FamilyCaseDto }) {
  const notify = useNotify();
  const actions = useFamilyActions();
  const stage = stageOf(c);
  const run = (p: Promise<unknown>, success: string) =>
    p.then(() => notify(success)).catch((e) => notify('That didn’t go through', 'error', errorMessage(e)));

  const handlers = {
    busy: actions.upload.isPending || actions.step.isPending,
    onSign: (s: JourneyStepDto, name: string) => run(actions.step.mutateAsync({ caseId: c.id, step: s.id, signatureName: name }), `${s.title} signed`),
    onConfirm: (s: JourneyStepDto, note?: string) => run(actions.step.mutateAsync({ caseId: c.id, step: s.id, note }), `${s.title}: marked done`),
    onUpload: (s: JourneyStepDto, file: File) => run(actions.upload.mutateAsync({ caseId: c.id, kind: s.documentKind ?? 'other', file }), `${file.name} uploaded`),
  };

  return (
    <div className="space-y-5">
      {/* stage tracker */}
      <ol className="grid grid-cols-4 gap-2">
        {STAGES.map((label, i) => (
          <li key={label} className="flex flex-col gap-2">
            <span className={`h-1.5 rounded-full ${i < stage ? 'bg-seed-500' : i === stage ? 'bg-clay-300' : 'bg-cream-300'}`} />
            <span className={`text-xs font-bold ${i <= stage ? 'text-ink-900' : 'text-ink-500'}`}>
              {i < stage && <CheckmarkCircleRegular className="mr-1 text-seed-500" />}
              {label}
            </span>
          </li>
        ))}
      </ol>
      <StatusHero c={c} />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="card card-pad">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold text-seed-950">Your checklist</h3>
              <p className="text-xs text-ink-500">{DISCIPLINE_LABEL[c.discipline]} · {FUNDING_LABEL[c.fundingSource]} · Ref {c.referenceCode}</p>
            </div>
          </div>
          <JourneyProgress journey={c.journey} />
          <div className="mt-6">
            <JourneyView journey={c.journey} mode="family" handlers={handlers} />
          </div>
        </div>

        <div className="space-y-5">
          <div className="card card-pad">
            <h3 className="mb-3 text-lg font-extrabold text-seed-950">Sessions</h3>
            {c.sessions.length === 0 ? (
              <p className="text-sm text-ink-500">Once your child is matched, their therapist and weekly time will appear here.</p>
            ) : (
              <>
                {c.therapist && (
                  <div className="mb-4 flex items-center gap-3">
                    <Avatar name={c.therapist.name} tone="olive" />
                    <div>
                      <p className="font-bold text-ink-900">{c.therapist.name}</p>
                      <p className="text-xs text-ink-500">Speaks {c.therapist.languages.join(', ')}</p>
                    </div>
                  </div>
                )}
                <ul className="space-y-2">
                  {c.sessions.map((s, i) => (
                    <li key={i} className="rounded-xl bg-seed-50 p-3">
                      <p className="font-bold text-seed-900">Every {slotLabel(s)}</p>
                      <p className="text-xs text-ink-500">{SETTING_LABEL[s.setting]} · {s.locationLabel} · starts {formatDate(s.startsOn)}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-ink-500">Need to cancel? Please give 24 hours’ notice.</p>
              </>
            )}
          </div>

          <DocumentsCard c={c} onUpload={(kind, file) => run(actions.upload.mutateAsync({ caseId: c.id, kind, file }), `${file.name} uploaded`)} busy={actions.upload.isPending} />

          <div className="card card-pad bg-seed-950! text-cream-50">
            <h3 className="font-extrabold">Questions?</h3>
            <p className="mt-1 text-sm text-seed-200">Our front desk is here Mon–Thu 8:30–7, Fri 8:30–3:30.</p>
            <div className="mt-3 flex flex-col gap-1.5 text-sm">
              <a href={PRACTICE.phoneHref} className="flex items-center gap-2 font-bold"><CallRegular /> {PRACTICE.phone}</a>
              <a href={`mailto:${PRACTICE.email}`} className="flex items-center gap-2 break-all text-seed-100"><MailRegular /> {PRACTICE.email}</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentsCard({ c, onUpload, busy }: { c: FamilyCaseDto; onUpload: (kind: DocumentKind, file: File) => void; busy: boolean }) {
  const [kind, setKind] = useState<DocumentKind>('other');
  return (
    <div className="card card-pad">
      <h3 className="mb-3 text-lg font-extrabold text-seed-950">Documents</h3>
      {c.documents.length === 0 ? (
        <p className="mb-3 text-sm text-ink-500">Nothing uploaded yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-cream-200">
          {c.documents.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => void openDocument(d.id)} className="flex w-full items-center gap-3 py-2 text-left hover:text-seed-700">
                <DocumentRegular className="shrink-0 text-xl text-seed-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{d.filename}</span>
                  <span className="text-xs text-ink-500">{DOCUMENT_LABEL[d.kind]} · {formatDate(d.uploadedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Select aria-label="Document type" value={kind} onValueChange={setKind} options={DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_LABEL[k] }))} />
        </div>
        <label className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-cream-300 bg-white px-4 text-sm font-bold text-seed-900 shadow-sm hover:border-seed-300 hover:bg-seed-50 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          <ArrowUploadRegular /> Upload
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(kind, f); e.target.value = ''; }} />
        </label>
      </div>
      <p className="mt-2 text-xs text-ink-500">PDF or photo, up to 5 MB. Only you, our staff and your child’s therapist can see these.</p>
    </div>
  );
}
