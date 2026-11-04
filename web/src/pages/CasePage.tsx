import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeftRegular,
  CalendarCheckmarkRegular,
  CallRegular,
  DocumentRegular,
  MailRegular,
  MoreHorizontalRegular,
  PeopleRegular,
  VehicleCarRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import { DOCUMENT_LABEL, FUNDING_LABEL, REFERRAL_LABEL, SETTING_LABEL, isTravelSetting, type CaseDetail, type MatchSuggestionDto, type SessionSetting } from '@seeds/shared';
import { errorMessage, openDocument, useCase, useCaseActions, useMatches } from '../api';
import { useNotify } from '../toast';
import { DisciplineBadge, ErrorBar, Loading, PriorityChips, SlaBadge, StatusBadge, disciplineName, formatAge, formatDate, formatDateTime, slotLabel, windowsSummary } from '../components/bits';
import { Alert, Avatar, Button, Checkbox, Field, Menu, MenuItem, Select, Spinner, Textarea, cn } from '../components/kit';
import { JourneyProgress, JourneyView } from '../components/Journey';
import { EmptyState, SectionTitle } from '../components/ui';

export function CasePage() {
  const { id = '' } = useParams();
  const c = useCase(id);
  if (c.isLoading) return <Loading />;
  if (c.isError || !c.data) return <ErrorBar error={c.error ?? new Error('Case not found')} />;
  const d = c.data;

  return (
    <>
      <Link to="/staff/queue" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-seed-700 hover:underline">
        <ArrowLeftRegular /> Back to queue
      </Link>

      <div className="card mb-6 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
          <Avatar name={d.childName} size="lg" tone="dark" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-seed-950">{d.childName}</h1>
              <StatusBadge status={d.status} />
              <DisciplineBadge discipline={d.discipline} />
            </div>
            <p className="mt-1 text-sm text-ink-500">{d.referenceCode} · received {formatDateTime(d.receivedAt)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <PriorityChips factors={d.priorityFactors} />
              <SlaBadge sla={d.sla} target={d.targetStartBy} />
            </div>
          </div>
          <CaseMenu c={d} />
        </div>
        <dl className="grid grid-cols-2 border-t border-cream-200 bg-cream-50 sm:grid-cols-3 lg:grid-cols-6">
          <Fact label="Age" value={formatAge(d.ageMonths)} />
          <Fact label="Waiting" value={`${d.waitDays} days`} sub={d.effectiveWaitDays !== d.waitDays ? `ranked as ${d.effectiveWaitDays}` : undefined} />
          <Fact label="Target start" value={formatDate(d.targetStartBy)} />
          <Fact label="Funding" value={FUNDING_LABEL[d.fundingSource].split(' (')[0]!} />
          <Fact label="Setting" value={SETTING_LABEL[d.preferredSetting]} sub={d.sessionLocationLabel} />
          <Fact label="Checklist" value={`${d.journey.done}/${d.journey.total}`} sub={d.journey.blocking.length ? `${d.journey.blocking.length} blocking` : 'complete'} />
        </dl>
      </div>

      {d.status === 'needs-review' && <ReviewBar c={d} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {d.status === 'scheduled' ? <SessionsCard c={d} /> : d.status !== 'closed' && <MatchesCard c={d} />}
          <ChecklistCard c={d} />
        </div>
        <div className="space-y-6">
          <FamilyCard c={d} />
          <PlanCard c={d} />
          <DocumentsCard c={d} />
          <ActivityCard c={d} />
        </div>
      </div>
    </>
  );
}

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="border-cream-200 px-5 py-3 [&:not(:last-child)]:border-r">
      <dt className="text-[11px] font-extrabold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-0.5 truncate font-bold text-ink-900">{value}</dd>
      {sub && <dd className="truncate text-xs text-ink-500">{sub}</dd>}
    </div>
  );
}

function ChecklistCard({ c }: { c: CaseDetail }) {
  const actions = useCaseActions(c.id);
  const notify = useNotify();
  return (
    <div className="card card-pad">
      <SectionTitle title="Family checklist" description="Shared with the family portal. Families sign, upload and report district steps; you can mark anything here. Completing the required steps moves the case to Ready automatically." />
      <JourneyProgress journey={c.journey} />
      <div className="mt-6">
        <JourneyView
          journey={c.journey}
          mode="staff"
          handlers={{
            busy: actions.checklist.isPending,
            onToggle: (step, done) =>
              actions.checklist
                .mutateAsync({ item: step.id, completed: done })
                .then(() => notify(`${step.title}: ${done ? 'done' : 'reopened'}`))
                .catch((e) => notify('Could not update', 'error', errorMessage(e))),
          }}
        />
      </div>
    </div>
  );
}

function FamilyCard({ c }: { c: CaseDetail }) {
  return (
    <div className="card card-pad">
      <SectionTitle title="What the family told us" />
      <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm">
        <dt className="text-ink-500">Child</dt>
        <dd className="text-ink-900">{c.child.firstName} {c.child.lastName} · DOB {formatDate(c.child.dateOfBirth)} · {c.child.preferredLanguage}</dd>
        <dt className="text-ink-500">Address</dt>
        <dd className="text-ink-900">
          {c.child.address.line1}, {c.child.address.city}, {c.child.address.state} {c.child.address.postalCode}
          {c.child.geocodePrecision === 'zip-approx' && <span className="block text-xs text-ink-500">Location approximate (ZIP level)</span>}
        </dd>
        {c.guardians.map((g, i) => (
          <GuardianRow key={i} g={g} />
        ))}
        <dt className="text-ink-500">Referral</dt>
        <dd className="text-ink-900">{REFERRAL_LABEL[c.referralSource]}{c.referringProvider ? ` · ${c.referringProvider}` : ''}</dd>
        <dt className="text-ink-500">Coverage</dt>
        <dd className="text-ink-900">
          {FUNDING_LABEL[c.fundingSource]}
          {c.insurance && <span className="block text-xs text-ink-500">{c.insurance.payer} · Member {c.insurance.memberId}</span>}
        </dd>
        <dt className="text-ink-500">Concerns</dt>
        <dd className="text-ink-900">
          {c.urgentConcern && <span className="mb-1 mr-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-800 ring-1 ring-red-200"><WarningRegular /> Urgent</span>}
          {c.concerns}
        </dd>
        {c.siblings.length > 0 && (
          <>
            <dt className="text-ink-500">Siblings</dt>
            <dd className="space-y-1">
              {c.siblings.map((x) => (
                <Link key={x.id} to={`/staff/cases/${x.id}`} className="flex items-center gap-2 text-ink-900 hover:underline">
                  <PeopleRegular className="text-ink-500" /> {x.childName} · {disciplineName(x.discipline)} <StatusBadge status={x.status} />
                </Link>
              ))}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

function GuardianRow({ g }: { g: CaseDetail['guardians'][number] }) {
  return (
    <>
      <dt className="text-ink-500">{g.relationship}</dt>
      <dd className="text-ink-900">
        {g.firstName} {g.lastName}
        <span className="mt-1 flex flex-wrap gap-2">
          <a href={`tel:${g.phone}`} className="chip hover:border-seed-300"><CallRegular /> {g.phone}</a>
          {g.email && <a href={`mailto:${g.email}`} className="chip hover:border-seed-300"><MailRegular /> {g.email}</a>}
        </span>
      </dd>
    </>
  );
}

function PlanCard({ c }: { c: CaseDetail }) {
  const actions = useCaseActions(c.id);
  const notify = useNotify();
  const editable = c.status !== 'scheduled' && c.status !== 'closed';
  const update = (b: Parameters<typeof actions.plan.mutate>[0]) =>
    actions.plan.mutate(b, { onSuccess: () => notify('Care plan updated'), onError: (e) => notify('Could not update', 'error', errorMessage(e)) });
  const settings: SessionSetting[] = c.preferredSetting === 'community' ? ['home', 'clinic', 'telehealth', 'community'] : ['home', 'clinic', 'telehealth'];
  return (
    <div className="card card-pad">
      <SectionTitle title="Care plan & availability" description={editable ? 'Changes re-rank matches instantly.' : 'Return the case to the queue to edit.'} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Sessions/wk">
          <Select disabled={!editable} value={String(c.sessionsPerWeek)} onValueChange={(v) => update({ sessionsPerWeek: Number(v) })} options={['1', '2', '3'].map((n) => ({ value: n, label: n }))} />
        </Field>
        <Field label="Minutes">
          <Select disabled={!editable} value={String(c.sessionMinutes)} onValueChange={(v) => update({ sessionMinutes: Number(v) as 30 | 45 | 60 })} options={['30', '45', '60'].map((n) => ({ value: n, label: `${n} min` }))} />
        </Field>
        <Field label="Setting">
          <Select disabled={!editable || c.preferredSetting === 'community'} value={c.preferredSetting} onValueChange={(v) => update({ preferredSetting: v as 'home' | 'clinic' | 'telehealth' })} options={settings.map((x) => ({ value: x, label: SETTING_LABEL[x] }))} />
        </Field>
      </div>
      <div className="mt-4 space-y-3">
        <Checkbox disabled={!editable} checked={c.acceptsTelehealth} onCheckedChange={(v) => update({ acceptsTelehealth: v })} label="Telehealth OK" />
        <Checkbox disabled={!editable} checked={c.urgentConcern} onCheckedChange={(v) => update({ urgentConcern: v })} label="Urgent concern" description="Re-prioritizes the queue." />
      </div>
      <div className="mt-4 rounded-xl bg-cream-50 p-3 text-sm">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-500">Family availability</p>
        <p className="mt-1 text-ink-900">{windowsSummary(c.availability)}</p>
      </div>
    </div>
  );
}

function DocumentsCard({ c }: { c: CaseDetail }) {
  return (
    <div className="card card-pad">
      <SectionTitle title="Documents" description="Uploaded by the family from their portal." />
      {c.documents.length === 0 ? (
        <p className="text-sm text-ink-500">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-cream-200">
          {c.documents.map((doc) => (
            <li key={doc.id}>
              <button type="button" onClick={() => void openDocument(doc.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:text-seed-700">
                <DocumentRegular className="shrink-0 text-xl text-seed-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{doc.filename}</span>
                  <span className="text-xs text-ink-500">{DOCUMENT_LABEL[doc.kind]} · {doc.uploadedBy} · {formatDate(doc.uploadedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityCard({ c }: { c: CaseDetail }) {
  return (
    <div className="card card-pad">
      <SectionTitle title="Activity" description="Append-only audit trail." />
      <ol className="relative max-h-96 space-y-4 overflow-y-auto border-l-2 border-cream-200 pl-5">
        {c.events.map((e, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-seed-300 ring-4 ring-white" />
            <p className="text-sm font-semibold text-ink-900">{e.message}</p>
            <p className="text-xs text-ink-500">{e.actor} · {formatDateTime(e.at)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MatchesCard({ c }: { c: CaseDetail }) {
  const ready = c.status === 'ready';
  const matches = useMatches(c.id, true);
  const actions = useCaseActions(c.id);
  const notify = useNotify();
  const book = (m: MatchSuggestionDto) =>
    actions.book.mutate(
      { therapistId: m.therapistId, setting: m.setting, slots: m.slots.map((x) => ({ day: x.day, start: x.start })) },
      { onSuccess: () => notify(`Booked with ${m.therapistName}`, 'success', m.slots.map(slotLabel).join(', ')), onError: (e) => notify('Could not book', 'error', errorMessage(e)) },
    );

  return (
    <div className="card card-pad">
      <SectionTitle
        title="Best therapist matches"
        description={`Ranked by the driving each slot adds to the therapist’s existing route, caseload balance, language and sibling continuity.${matches.data ? ` Drive times: ${matches.data.travelSource === 'azure-maps' ? 'Azure Maps' : 'estimated'}.` : ''}`}
      />
      {!ready && <Alert tone="info" className="mb-4" title="Preview only">The family’s checklist has to be complete before booking. Blocking: {c.journey.blocking.map((b) => b.title).join(', ') || 'review'}.</Alert>}
      {matches.isLoading && <Spinner label="Finding therapists…" />}
      {matches.isError && <ErrorBar error={matches.error} />}
      <div className="space-y-3">
        {matches.data?.suggestions.map((m, i) => (
          <div key={m.therapistId} className={cn('rounded-2xl border p-4 transition hover:shadow-card', i === 0 ? 'border-seed-300 bg-seed-50/60' : 'border-cream-200 bg-white')}>
            <div className="flex flex-wrap items-start gap-4">
              <div className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-black', i === 0 ? 'bg-seed-500 text-white' : 'bg-cream-200 text-seed-950')} aria-label={`Fit score ${m.score}`}>{m.score}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-extrabold text-ink-900">{m.therapistName}</p>
                  {i === 0 && <span className="rounded-full bg-clay-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-clay-700">Best fit</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {m.slots.map((s) => <span key={`${s.day}-${s.start}`} className="chip"><CalendarCheckmarkRegular /> {slotLabel(s)}</span>)}
                  <span className="chip">{SETTING_LABEL[m.setting]}</span>
                  {isTravelSetting(m.setting) && <span className="chip"><VehicleCarRegular /> +{Math.round(m.addedTravelMinutes)} min/wk</span>}
                </div>
                <ul className="mt-3 space-y-1">
                  {m.reasons.map((r, j) => <li key={j} className="flex gap-2 text-sm text-ink-700"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-seed-400" />{r}</li>)}
                </ul>
              </div>
              <Button disabled={!ready || actions.book.isPending} onClick={() => book(m)}>Book</Button>
            </div>
          </div>
        ))}
      </div>
      {matches.data && matches.data.suggestions.length === 0 && (
        <EmptyState icon={<WarningRegular />} title="No therapist can take this child right now">
          <ul className="mt-1 space-y-0.5">
            {Object.entries(matches.data.exclusions).map(([why, n]) => <li key={why}>{why}: {n} therapist{n === 1 ? '' : 's'}</li>)}
          </ul>
          <p className="mt-2">Try widening availability, allowing telehealth, or fewer sessions per week.</p>
        </EmptyState>
      )}
    </div>
  );
}

function SessionsCard({ c }: { c: CaseDetail }) {
  const actions = useCaseActions(c.id);
  const notify = useNotify();
  const [reason, setReason] = useState('');
  return (
    <div className="card card-pad">
      <SectionTitle title="Standing sessions" description={`With ${c.assignedTherapistName}`} />
      <div className="space-y-3">
        {c.appointments.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-4 rounded-2xl bg-seed-50 p-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-seed-500 text-xl text-white"><CalendarCheckmarkRegular /></span>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-ink-900">Every {slotLabel(a)}</p>
              <p className="text-xs text-ink-500">{SETTING_LABEL[a.setting]} · {a.locationLabel} · first session {formatDate(a.startsOn)} (evaluation)</p>
              <p className="text-xs text-ink-500">Outlook calendar: {a.calendarSync === 'not-configured' ? 'sync not configured' : a.calendarSync}</p>
            </div>
            <Link to={`/staff/therapists/${a.therapistId}`} className="text-sm font-bold text-seed-700 hover:underline">Therapist’s week →</Link>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-cream-200 pt-5">
        <Field label="Return to queue" hint="Cancels these sessions; the child keeps their queue position.">
          <Textarea className="min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. family schedule changed" />
        </Field>
        <Button
          variant="secondary"
          className="mt-3"
          disabled={reason.trim().length < 2 || actions.unschedule.isPending}
          onClick={() => actions.unschedule.mutate(reason, { onSuccess: () => { setReason(''); notify('Returned to queue'); }, onError: (e) => notify('Failed', 'error', errorMessage(e)) })}
        >
          Return to queue
        </Button>
      </div>
    </div>
  );
}

function ReviewBar({ c }: { c: CaseDetail }) {
  const actions = useCaseActions(c.id);
  const notify = useNotify();
  return (
    <Alert
      tone="warning"
      className="mb-6"
      title="Needs review"
      action={
        <Button size="sm" variant="secondary" onClick={() => actions.resolveReview.mutate({ note: 'Verified with family' }, { onSuccess: () => notify('Review resolved'), onError: (e) => notify('Failed', 'error', errorMessage(e)) })}>
          Mark resolved
        </Button>
      }
    >
      {c.reviewReason}
    </Alert>
  );
}

function CaseMenu({ c }: { c: CaseDetail }) {
  const actions = useCaseActions(c.id);
  const notify = useNotify();
  const run = (status: 'on-hold' | 'closed' | 'ready', note: string) =>
    actions.status.mutate({ status, note }, { onSuccess: () => notify('Case updated'), onError: (e) => notify('Could not update case', 'error', errorMessage(e)) });
  return (
    <Menu trigger={<Button variant="secondary"><MoreHorizontalRegular /> Actions</Button>}>
      {(c.status === 'on-hold' || c.status === 'closed') && <MenuItem onSelect={() => run('ready', 'Resumed')}>Resume / reopen</MenuItem>}
      {c.status !== 'on-hold' && c.status !== 'scheduled' && c.status !== 'closed' && <MenuItem onSelect={() => run('on-hold', 'Family requested a pause')}>Put on hold</MenuItem>}
      {c.status !== 'closed' && <MenuItem tone="danger" onSelect={() => run('closed', c.status === 'scheduled' ? 'Discharged' : 'Closed')}>{c.status === 'scheduled' ? 'Discharge' : 'Close case'}</MenuItem>}
    </Menu>
  );
}
