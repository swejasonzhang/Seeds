import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeftRegular, LocationRegular, TranslateRegular, VehicleCarRegular } from '@fluentui/react-icons';
import { SETTING_LABEL, type Discipline } from '@seeds/shared';
import { useRoute, useTherapist, useTherapists } from '../api';
import { DisciplineBadge, ErrorBar, Loading, windowsSummary } from '../components/bits';
import { Avatar, Tabs, TabsList, TabsTrigger } from '../components/kit';
import { Meter, PageHeader, StatTile } from '../components/ui';
import { WeekGrid } from '../components/WeekGrid';
import { RouteSheet } from '../components/RouteSheet';

const todayIso = () => new Date().toLocaleDateString('en-CA');

export function TherapistsPage() {
  const list = useTherapists();
  const [filter, setFilter] = useState<Discipline | 'all'>('all');
  if (list.isLoading) return <Loading />;
  if (list.isError) return <ErrorBar error={list.error} />;
  const items = (list.data ?? []).filter((t) => filter === 'all' || t.discipline === filter);
  const count = (d: Discipline | 'all') => (list.data ?? []).filter((t) => d === 'all' || t.discipline === d).length;

  return (
    <>
      <PageHeader eyebrow="Staff portal" title="Therapists" description="Availability, caseload and weekly driving for every therapist. Therapists maintain their own availability in the therapist portal." />
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Discipline | 'all')} className="mb-5">
        <TabsList>
          <TabsTrigger value="all" count={count('all')}>Everyone</TabsTrigger>
          <TabsTrigger value="speech" count={count('speech')}>Speech</TabsTrigger>
          <TabsTrigger value="ot" count={count('ot')}>Occupational</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((t) => {
          const open = t.weeklyCapacity - t.sessionsBooked;
          return (
            <Link key={t.id} to={`/staff/therapists/${t.id}`} className="card card-pad group block transition hover:-translate-y-0.5 hover:shadow-lift">
              <div className="flex items-start gap-4">
                <Avatar name={t.name} size="lg" tone={t.discipline === 'speech' ? 'dark' : 'olive'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-extrabold text-seed-950 group-hover:underline">{t.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                    <DisciplineBadge discipline={t.discipline} />
                    <span className="flex items-center gap-1"><LocationRegular /> {t.homeBaseLabel} · ≤ {t.maxOneWayTravelMinutes} min</span>
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="font-bold text-ink-900">{t.sessionsBooked} / {t.weeklyCapacity} sessions</span>
                  <span className="text-xs font-semibold text-ink-500">{open > 0 ? `${open} open` : 'Full'}</span>
                </div>
                <Meter value={t.sessionsBooked} max={t.weeklyCapacity} label={`${t.name} caseload`} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="chip"><VehicleCarRegular /> {(t.weeklyDriveMinutes / 60).toFixed(1)} h driving/wk</span>
                <span className="chip"><TranslateRegular /> {t.languages.join(', ')}</span>
              </div>
              <p className="mt-3 line-clamp-2 text-xs text-ink-500">{t.settings.map((x) => SETTING_LABEL[x]).join(' · ')} — {windowsSummary(t.availability)}</p>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export function TherapistPage() {
  const { id = '' } = useParams();
  const t = useTherapist(id);
  const [date, setDate] = useState(todayIso());
  const route = useRoute(id, date);
  if (t.isLoading) return <Loading />;
  if (t.isError || !t.data) return <ErrorBar error={t.error} />;
  const d = t.data;

  return (
    <>
      <Link to="/staff/therapists" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-seed-700 hover:underline">
        <ArrowLeftRegular /> All therapists
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={d.name} size="lg" tone={d.discipline === 'speech' ? 'dark' : 'olive'} />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-seed-950">{d.name}</h1>
          <p className="text-sm text-ink-500">{d.homeBaseLabel} · {d.languages.join(', ')} · {d.email}</p>
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Sessions booked" value={`${d.sessionsBooked} / ${d.weeklyCapacity}`} context={<Meter value={d.sessionsBooked} max={d.weeklyCapacity} label="Caseload" size="sm" />} />
        <StatTile label="Open slots this week" value={Math.max(0, d.weeklyCapacity - d.sessionsBooked)} context={`Travels up to ${d.maxOneWayTravelMinutes} min one way`} />
        <StatTile label="Driving per week" value={`${(d.weeklyDriveMinutes / 60).toFixed(1)} h`} context="Across all route days" />
      </div>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="card card-pad">
          <h2 className="mb-1 text-base font-extrabold text-seed-950">Week at a glance</h2>
          <p className="mb-4 text-xs text-ink-500">Availability (set by the therapist) and standing sessions. Click a session to open the case.</p>
          <WeekGrid availability={d.availability} appointments={d.appointments} caseHref={(a) => `/staff/cases/${a.caseId}`} />
        </div>
        <RouteSheet route={route.data} loading={route.isLoading} date={date} onDate={setDate} homeLabel={d.homeBaseLabel} />
      </div>
    </>
  );
}
