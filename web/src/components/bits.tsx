import { Badge, MessageBar, MessageBarBody, Spinner, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
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

type BadgeColor = 'brand' | 'danger' | 'important' | 'informative' | 'severe' | 'subtle' | 'success' | 'warning';

const STATUS_COLOR: Record<CaseStatus, BadgeColor> = {
  'needs-review': 'severe',
  'pending-documents': 'warning',
  ready: 'brand',
  scheduled: 'success',
  'on-hold': 'subtle',
  closed: 'informative',
};

export const StatusBadge = ({ status }: { status: CaseStatus }) => (
  <Badge appearance="tint" color={STATUS_COLOR[status]}>
    {STATUS_LABEL[status]}
  </Badge>
);

export const DisciplineBadge = ({ discipline }: { discipline: Discipline }) => (
  <Badge appearance="outline" color={discipline === 'speech' ? 'brand' : 'important'}>
    {discipline === 'speech' ? 'Speech' : 'OT'}
  </Badge>
);
export const disciplineName = (d: Discipline) => DISCIPLINE_LABEL[d];

export const PriorityChips = ({ factors }: { factors: PriorityFactor[] }) => (
  <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
    {factors.map((f) => (
      <Badge key={f} size="small" appearance="tint" color={f === 'urgent' ? 'danger' : 'informative'}>
        {PRIORITY_LABEL[f]}
      </Badge>
    ))}
  </span>
);

const SLA: Record<SlaState, { label: string; color: BadgeColor }> = {
  'on-track': { label: 'On track', color: 'success' },
  'at-risk': { label: 'At risk', color: 'warning' },
  breached: { label: 'Past target', color: 'danger' },
  met: { label: 'Met', color: 'informative' },
};

export const SlaBadge = ({ sla, target }: { sla: SlaState; target: string }) => (
  <Tooltip content={`Target start by ${formatDate(target)}`} relationship="description">
    <Badge appearance="tint" color={SLA[sla].color}>
      {SLA[sla].label}
    </Badge>
  </Tooltip>
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

const useStyles = makeStyles({
  center: { display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL },
});

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const s = useStyles();
  return (
    <div className={s.center}>
      <Spinner label={label} />
    </div>
  );
}

export const ErrorBar = ({ error }: { error: unknown }) => (
  <MessageBar intent="error">
    <MessageBarBody>{errorMessage(error)}</MessageBarBody>
  </MessageBar>
);
