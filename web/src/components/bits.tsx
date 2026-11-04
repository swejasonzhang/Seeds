import type { ReactNode } from 'react';
import { Alert, Spinner, Tip } from './kit';
import {
  CalendarCheckmarkRegular,
  CheckmarkCircleRegular,
  ClockRegular,
  DocumentRegular,
  ErrorCircleRegular,
  PauseCircleRegular,
  SearchInfoRegular,
  WarningRegular,
  ArchiveRegular,
} from '@fluentui/react-icons';
import {
  DAY_SHORT,
  DISCIPLINE_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  formatMinute,
  type CaseStatus,
  type Discipline,
  type PriorityFactor,
  type SlaState,
  type WeeklyWindow,
} from '@seeds/shared';
import { errorMessage } from '../api';

const pill = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold';

const STATUS_STYLE: Record<CaseStatus, { cls: string; icon: ReactNode }> = {
  'needs-review': { cls: 'bg-red-50 text-red-800 ring-1 ring-red-200', icon: <SearchInfoRegular /> },
  'pending-documents': { cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', icon: <DocumentRegular /> },
  ready: { cls: 'bg-seed-50 text-seed-800 ring-1 ring-seed-200', icon: <ClockRegular /> },
  scheduled: { cls: 'bg-seed-500 text-white', icon: <CalendarCheckmarkRegular /> },
  'on-hold': { cls: 'bg-cream-200 text-ink-700', icon: <PauseCircleRegular /> },
  closed: { cls: 'bg-cream-200 text-ink-500', icon: <ArchiveRegular /> },
};

export const StatusBadge = ({ status }: { status: CaseStatus }) => (
  <span className={`${pill} ${STATUS_STYLE[status].cls}`}>
    {STATUS_STYLE[status].icon}
    {STATUS_LABEL[status]}
  </span>
);

export const DisciplineBadge = ({ discipline }: { discipline: Discipline }) => (
  <span className={`${pill} ${discipline === 'speech' ? 'bg-seed-950 text-cream-50' : 'bg-olive-200 text-seed-950'}`}>
    {discipline === 'speech' ? 'Speech' : 'OT'}
  </span>
);
export const disciplineName = (d: Discipline) => DISCIPLINE_LABEL[d];

export const PriorityChips = ({ factors }: { factors: PriorityFactor[] }) =>
  factors.length === 0 ? null : (
    <span className="inline-flex flex-wrap gap-1">
      {factors.map((f) => (
        <span key={f} className={`${pill} font-semibold ${f === 'urgent' ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-clay-50 text-clay-700 ring-1 ring-clay-200'}`}>
          {f === 'urgent' && <WarningRegular />}
          {PRIORITY_LABEL[f]}
        </span>
      ))}
    </span>
  );

const SLA: Record<SlaState, { label: string; cls: string; icon: ReactNode }> = {
  'on-track': { label: 'On track', cls: 'text-seed-700', icon: <CheckmarkCircleRegular /> },
  'at-risk': { label: 'At risk', cls: 'text-amber-700', icon: <WarningRegular /> },
  breached: { label: 'Past target', cls: 'text-red-700', icon: <ErrorCircleRegular /> },
  met: { label: 'Met', cls: 'text-seed-700', icon: <CheckmarkCircleRegular /> },
};

export const SlaBadge = ({ sla, target }: { sla: SlaState; target: string }) => (
  <Tip content={`Target start by ${formatDate(target)}`}>
    <span tabIndex={0} className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold ${SLA[sla].cls}`}>
      {SLA[sla].icon}
      {SLA[sla].label}
    </span>
  </Tip>
);

export const formatAge = (months: number) => (months < 24 ? `${months} mo` : `${Math.floor(months / 12)}y ${months % 12}m`);

export function formatDate(iso: string) {
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const slotLabel = (s: { day: number; start: number; end?: number }) =>
  `${DAY_SHORT[s.day]} ${formatMinute(s.start)}${s.end ? `–${formatMinute(s.end)}` : ''}`;

export function windowsSummary(windows: WeeklyWindow[]) {
  const byDay = new Map<number, string[]>();
  for (const w of [...windows].sort((a, b) => a.day - b.day || a.start - b.start)) {
    byDay.set(w.day, [...(byDay.get(w.day) ?? []), `${formatMinute(w.start)}–${formatMinute(w.end)}`]);
  }
  return [...byDay.entries()].map(([d, t]) => `${DAY_SHORT[d]} ${t.join(', ')}`).join(' · ');
}

export const initials = (name: string) =>
  name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

export const Loading = ({ label = 'Loading…' }: { label?: string }) => <Spinner label={label} />;

export const ErrorBar = ({ error }: { error: unknown }) => <Alert tone="error" title="Something went wrong">{errorMessage(error)}</Alert>;
