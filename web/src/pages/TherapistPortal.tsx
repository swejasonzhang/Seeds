import { useEffect, useMemo, useState } from 'react';
import { CallRegular, DocumentRegular, LocationRegular, MailRegular, PeopleListRegular, SaveRegular, TranslateRegular, WarningRegular } from '@fluentui/react-icons';
import { DISCIPLINE_LABEL, DOCUMENT_LABEL, FUNDING_LABEL, SETTING_LABEL, formatMinute, type TherapistPortalDto } from '@seeds/shared';
import { ApiRequestError, errorMessage, openDocument, useMyRoute, useTherapistPortal, useUpdateAvailability } from '../api';
import { ErrorBar, Loading, formatAge, slotLabel } from '../components/bits';
import { Alert, Avatar, Button } from '../components/kit';
import { EmptyState, Meter, PageHeader, StatTile } from '../components/ui';
import { AvailabilityEditor, WeekGrid, cellsToWindows, windowsToCells } from '../components/WeekGrid';
import { RouteSheet } from '../components/RouteSheet';
import { usePersona } from '../session';

const todayIso = () => new Date().toLocaleDateString('en-CA');
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function usePortal() {
  const p = useTherapistPortal();
  return p;
}

// ---------------- My week ----------------

export function TherapistWeekPage() {
  const persona = usePersona();
  const portal = usePortal();
  const [date, setDate] = useState(todayIso());
  const route = useMyRoute(date);
  if (portal.isLoading) return <Loading />;
  if (portal.isError || !portal.data) return <ErrorBar error={portal.error} />;
  const { therapist: t, caseload } = portal.data;
  const today = new Date().getDay();
  const todays = t.appointments.filter((a) => a.day === today);

  return (
    <>
      <PageHeader eyebrow="Therapist portal" title={`${greeting()}, ${persona?.name.split(' ')[0] ?? ''}`} description={todays.length ? `You have ${todays.length} session${todays.length === 1 ? '' : 's'} today, starting ${formatMinute(Math.min(...todays.map((a) => a.start)))}.` : 'No sessions today.'} />
      <div className="stagger mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Children on caseload" value={caseload.length} context={`${DISCIPLINE_LABEL[t.discipline]}`} />
        <StatTile label="Weekly sessions" value={`${t.sessionsBooked} / ${t.weeklyCapacity}`} context={<Meter value={t.sessionsBooked} max={t.weeklyCapacity} label="Caseload" size="sm" />} />
        <StatTile label="Today" value={todays.length} context={todays.length ? todays.map((a) => formatMinute(a.start)).join(' · ') : 'Free day'} />
        <StatTile label="Travel radius" value={`${t.maxOneWayTravelMinutes} min`} context={`From ${t.homeBaseLabel}`} />
      </div>
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="scroll-in card card-pad min-w-0">
          <h2 className="mb-1 text-base font-extrabold text-seed-950">My week</h2>
          <p className="mb-4 text-xs text-ink-500">Standing sessions on top of the hours you’ve made available.</p>
          <WeekGrid availability={t.availability} appointments={t.appointments} caseHref={(a) => `/therapist/caseload#${a.caseId}`} />
        </div>
        <RouteSheet route={route.data} loading={route.isLoading} date={date} onDate={setDate} homeLabel={t.homeBaseLabel} />
      </div>
    </>
  );
}

// ---------------- Caseload ----------------

export function CaseloadPage() {
  const portal = usePortal();
  useEffect(() => {
    if (portal.data && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [portal.data]);
  if (portal.isLoading) return <Loading />;
  if (portal.isError || !portal.data) return <ErrorBar error={portal.error} />;
  const { caseload } = portal.data;

  return (
    <>
      <PageHeader eyebrow="Therapist portal" title="My caseload" description="Everything families shared at intake, plus where each child stands on their checklist. Only you, the family and the front desk can see this." />
      {caseload.length === 0 && <div className="card"><EmptyState icon={<PeopleListRegular />} title="No children assigned yet">New matches from the front desk appear here.</EmptyState></div>}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {caseload.map((c) => (
          <article key={c.caseId} id={c.caseId} className="scroll-in card scroll-mt-6 overflow-hidden">
            <div className="flex items-start gap-4 p-5">
              <Avatar name={c.childName} size="lg" tone="dark" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold text-seed-950">{c.childName}</h2>
                  {c.urgentConcern && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-800 ring-1 ring-red-200"><WarningRegular /> Urgent</span>}
                </div>
                <p className="text-sm text-ink-500">{formatAge(c.ageMonths)} · {DISCIPLINE_LABEL[c.discipline]} · {FUNDING_LABEL[c.fundingSource].split(' (')[0]} · {c.referenceCode}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.sessions.map((s) => <span key={s.id} className="chip bg-seed-50! text-seed-900!">{slotLabel(s)}</span>)}
                  <span className="chip">{SETTING_LABEL[c.setting]}</span>
                  {c.preferredLanguage !== 'English' && <span className="chip"><TranslateRegular /> {c.preferredLanguage}</span>}
                </div>
              </div>
            </div>
            <div className="grid gap-4 border-t border-cream-200 bg-cream-50 p-5 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-500">Where</p>
                <p className="mt-1 flex gap-1.5 text-sm text-ink-900"><LocationRegular className="mt-0.5 shrink-0 text-ink-500" /> {c.setting === 'home' ? c.homeAddress : c.locationLabel}</p>
              </div>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-500">{c.guardian.relationship || 'Parent'}</p>
                <p className="mt-1 text-sm font-bold text-ink-900">{c.guardian.name}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <a href={`tel:${c.guardian.phone}`} className="chip hover:border-seed-300"><CallRegular /> {c.guardian.phone}</a>
                  {c.guardian.email && <a href={`mailto:${c.guardian.email}`} className="chip hover:border-seed-300"><MailRegular /> Email</a>}
                </div>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-500">Family’s concerns</p>
                <p className="mt-1 text-sm text-ink-700">{c.concerns}</p>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-ink-500">Checklist {c.journey.done}/{c.journey.total}</p>
                <Meter value={c.journey.done} max={c.journey.total} label={`${c.childName} checklist`} size="sm" kind="progress" />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-ink-500">Documents</p>
                {c.documents.length === 0 ? <p className="text-xs text-ink-500">None uploaded</p> : c.documents.map((d) => (
                  <button key={d.id} type="button" onClick={() => void openDocument(d.id)} className="flex items-center gap-1.5 text-xs font-bold text-seed-700 hover:underline">
                    <DocumentRegular /> {DOCUMENT_LABEL[d.kind]}
                  </button>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

// ---------------- Availability ----------------

export function AvailabilityPage() {
  const portal = usePortal();
  if (portal.isLoading) return <Loading />;
  if (portal.isError || !portal.data) return <ErrorBar error={portal.error} />;
  return <AvailabilityForm data={portal.data} />;
}

function AvailabilityForm({ data }: { data: TherapistPortalDto }) {
  const save = useUpdateAvailability();
  const original = useMemo(() => windowsToCells(data.therapist.availability), [data.therapist.availability]);
  const [cells, setCells] = useState(original);
  const [conflict, setConflict] = useState<string | null>(null);
  const [state, setState] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const dirty = cells.size !== original.size || [...cells].some((c) => !original.has(c));
  const hours = cells.size / 2;

  // Autosave shortly after the therapist stops painting.
  useEffect(() => {
    if (!dirty) return;
    setState('pending');
    const t = setTimeout(() => {
      setState('saving');
      save.mutate(cellsToWindows(cells), {
        onSuccess: () => { setConflict(null); setState('saved'); },
        onError: (e) => { setState('error'); setConflict(e instanceof ApiRequestError && e.status === 409 ? errorMessage(e) : `Couldn’t save: ${errorMessage(e)}`); },
      });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells]);

  const status = {
    saved: <span className="inline-flex items-center gap-1.5 font-semibold text-seed-700"><SaveRegular /> All changes saved</span>,
    pending: <span className="font-semibold text-ink-500">Unsaved changes…</span>,
    saving: <span className="font-semibold text-ink-500">Saving…</span>,
    error: <span className="font-semibold text-amber-800">Not saved</span>,
  }[state];

  return (
    <>
      <PageHeader
        eyebrow="Therapist portal"
        title="My availability"
        description="Paint the hours you can see children each week. Changes save automatically; the front desk only books inside these hours, and matching uses them to plan your routes."
        actions={
          <div className="flex items-center gap-3 text-sm" aria-live="polite">
            {status}
            <Button variant="secondary" size="sm" disabled={!dirty && state !== 'error'} onClick={() => { setCells(original); setConflict(null); setState('saved'); }}>Undo changes</Button>
          </div>
        }
      />
      {conflict && <Alert tone="warning" title="Some booked sessions fall outside these hours" className="mb-5">{conflict}</Alert>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card card-pad min-w-0">
          <AvailabilityEditor value={cells} onChange={setCells} booked={data.therapist.appointments} />
        </div>
        <div className="space-y-4">
          <StatTile label="Available hours per week" value={hours} context="Across Monday to Saturday" />
          <div className="card card-pad text-sm text-ink-700">
            <p className="font-extrabold text-seed-950">Tips</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-4">
              <li>Click a cell to toggle it, or drag across cells to paint a block.</li>
              <li>Locked cells are booked sessions. Ask the front desk to move them before removing those hours.</li>
              <li>Office hours are Mon–Thu until 7 PM and Fri until 3:30 PM.</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
