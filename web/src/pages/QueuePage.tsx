import { useDeferredValue, useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar, Button, Input, Select, Tabs, TabsList, TabsTrigger, Tip } from '../components/kit';
import { ChevronRightRegular, FlashRegular, PeopleQueueRegular, SearchRegular } from '@fluentui/react-icons';
import { CHECKLIST_LABEL, SETTING_LABEL, STATUS_LABEL, type CaseStatus, type Discipline, type QueueItem } from '@seeds/shared';
import { useDashboard, useQueue, useQueueCounts } from '../api';
import { DisciplineBadge, ErrorBar, PriorityChips, SlaBadge, StatusBadge, formatAge } from '../components/bits';
import { EmptyState, PageHeader, SkeletonRows, StatTile } from '../components/ui';

const TABS: CaseStatus[] = ['ready', 'pending-documents', 'needs-review', 'scheduled', 'on-hold', 'closed'];

function KpiRow() {
  const d = useDashboard();
  if (!d.data) return <div className="mb-6 grid h-[116px] gap-4 sm:grid-cols-2 xl:grid-cols-5" />;
  const k = d.data;
  return (
    <div className="stagger mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5 [&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1">
      <StatTile label="Ready to schedule" value={k.readyToSchedule} context={`Median wait ${k.medianWaitDaysReady} days`} />
      <StatTile label="Waiting on paperwork" value={k.pendingDocuments} context="Authorizations, Rx, insurance" />
      <StatTile label="Needs review" value={k.needsReview} status={k.needsReview > 0 ? 'warning' : 'neutral'} context="Address or duplicate checks" />
      <StatTile label="Past target start" value={k.slaBreached} status={k.slaBreached > 0 ? 'critical' : 'neutral'} context={`${k.slaAtRisk} more at risk within 7 days`} />
      <StatTile label="New referrals" value={k.intakesLast7Days} context={`Last 7 days · ${k.scheduledLast7Days} scheduled`} />
    </div>
  );
}

export function QueuePage() {
  const nav = useNavigate();
  const [status, setStatus] = useState<CaseStatus>('ready');
  const [discipline, setDiscipline] = useState<Discipline | ''>('');
  const [sla, setSla] = useState<'' | 'at-risk' | 'breached'>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search.trim());
  const pageSize = 25;

  const counts = useQueueCounts(discipline || undefined);
  const queue = useQueue({ status, discipline: discipline || undefined, q: q || undefined, sla: sla || undefined, page, pageSize });
  const pages = queue.data ? Math.max(1, Math.ceil(queue.data.total / pageSize)) : 1;
  const waiting = status !== 'scheduled' && status !== 'closed';
  const reset = () => setPage(1);

  return (
    <>
      <PageHeader
        eyebrow="Staff portal"
        title="Intake queue"
        description="Ordered by effective wait: days waiting plus priority boosts for children under 3, urgent concerns, siblings already in care and mandated CPSE/CSE (IEP) services."
        actions={
          <Button size="lg" onClick={() => nav('/staff/auto-match')}>
            <FlashRegular /> Auto-match the queue
          </Button>
        }
      />
      <KpiRow />

      <div className="card overflow-hidden">
        {/* status: dropdown on phones, tabs from small tablets up (they wrap; nothing scrolls sideways) */}
        <div className="border-b border-cream-200 p-3">
          <div className="sm:hidden">
            <Select
              aria-label="Status"
              size="lg"
              value={status}
              onValueChange={(v) => { setStatus(v); reset(); }}
              options={TABS.map((t) => ({ value: t, label: `${STATUS_LABEL[t]} (${counts.data?.counts[t] ?? 0})` }))}
            />
          </div>
          <Tabs className="hidden sm:block" value={status} onValueChange={(v) => { setStatus(v as CaseStatus); reset(); }}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t} value={t} count={counts.data?.counts[t] ?? 0}>{STATUS_LABEL[t]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-cream-200 bg-cream-50 p-3 sm:flex sm:flex-wrap sm:items-center sm:px-5">
          <div className="col-span-2 sm:w-80 sm:flex-none">
            <Input icon={<SearchRegular />} aria-label="Search" placeholder="Search child, family or reference" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} />
          </div>
          <div className={waiting ? 'sm:w-48' : 'col-span-2 sm:w-48'}>
            <Select
              aria-label="Service"
              value={discipline || 'all'}
              onValueChange={(v) => { setDiscipline(v === 'all' ? '' : (v as Discipline)); reset(); }}
              options={[{ value: 'all', label: 'All services' }, { value: 'speech', label: 'Speech therapy' }, { value: 'ot', label: 'Occupational therapy' }]}
            />
          </div>
          {waiting && (
            <div className="sm:w-52">
              <Select
                aria-label="Target date"
                value={sla || 'any'}
                onValueChange={(v) => { setSla(v === 'any' ? '' : (v as 'at-risk' | 'breached')); reset(); }}
                options={[{ value: 'any', label: 'Any target date' }, { value: 'at-risk', label: 'At risk', hint: '7 days or fewer left' }, { value: 'breached', label: 'Past target' }]}
              />
            </div>
          )}
          <span className="col-span-2 text-sm text-ink-500 sm:ml-auto">{queue.data ? `${queue.data.total} ${queue.data.total === 1 ? 'child' : 'children'}` : ''}</span>
        </div>

        {queue.isError && <div className="p-4"><ErrorBar error={queue.error} /></div>}
        {queue.isLoading ? (
          <SkeletonRows rows={8} />
        ) : queue.data?.items.length === 0 ? (
          <EmptyState icon={<PeopleQueueRegular />} title={status === 'ready' ? 'The matching queue is empty' : `No ${STATUS_LABEL[status].toLowerCase()} cases`}>
            {q ? 'Try a different search.' : 'New online intakes appear here automatically.'}
          </EmptyState>
        ) : (
          <>
            {/* phones: one card per child */}
            <ul className="divide-y divide-cream-200 md:hidden">
              {queue.data?.items.map((c, i) => (
                <li key={c.id} className="scroll-in">
                  <button type="button" onClick={() => nav(`/staff/cases/${c.id}`)} className="flex w-full gap-3 p-4 text-left active:bg-seed-50">
                    <span className="w-6 shrink-0 pt-2 text-xs font-black text-ink-500">{(page - 1) * pageSize + i + 1}</span>
                    <Avatar name={c.childName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-bold text-ink-900">{c.childName}</span>
                        <span className="shrink-0 text-sm font-black tabular-nums text-ink-900">{c.effectiveWaitDays}d</span>
                      </span>
                      <span className="block text-xs text-ink-500">{formatAge(c.ageMonths)} · {c.town} · {SETTING_LABEL[c.preferredSetting]}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        <DisciplineBadge discipline={c.discipline} />
                        <SlaBadge sla={c.sla} target={c.targetStartBy} />
                        <PriorityChips factors={c.priorityFactors} />
                      </span>
                      <span className="mt-2 block text-xs"><NextStep c={c} scheduled={status === 'scheduled'} /></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* tablets & up: a table whose columns appear only when there is room (never scrolls sideways) */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="text-xs font-bold uppercase tracking-wider text-ink-500">
                <tr className="border-b border-cream-200">
                  <th className="w-12 py-3 pl-5 pr-2">#</th>
                  <th className="px-3 py-3">Child</th>
                  <th className="hidden px-3 py-3 2xl:table-cell">Service</th>
                  <th className="px-3 py-3">Waiting</th>
                  <th className="hidden px-3 py-3 xl:table-cell">Priority</th>
                  <th className="px-3 py-3">Target</th>
                  <th className="hidden px-3 py-3 2xl:table-cell">Location</th>
                  <th className="hidden px-3 py-3 lg:table-cell">{status === 'scheduled' ? 'Therapist' : 'Next step'}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {queue.data?.items.map((c, i) => (
                  <tr key={c.id} className="scroll-in row-link" onClick={() => nav(`/staff/cases/${c.id}`)}>
                    <td className="py-3 pl-5 pr-2 font-bold text-ink-500">{(page - 1) * pageSize + i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.childName} size="sm" />
                        <div className="min-w-0">
                          <p className="font-bold text-ink-900">{c.childName}</p>
                          <p className="text-xs text-ink-500">
                            {formatAge(c.ageMonths)} · {c.referenceCode}
                            <span className="2xl:hidden"> · {c.discipline === 'speech' ? 'Speech' : 'OT'} · {c.town}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 2xl:table-cell"><DisciplineBadge discipline={c.discipline} /></td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Tip content={`${c.waitDays} days since referral; ${c.effectiveWaitDays - c.waitDays} priority days added`}>
                        <span tabIndex={0} className="cursor-help font-black tabular-nums text-ink-900">{c.effectiveWaitDays}d</span>
                      </Tip>
                      {c.effectiveWaitDays !== c.waitDays && <span className="ml-1 text-xs text-ink-500">({c.waitDays}d)</span>}
                    </td>
                    <td className="hidden px-3 py-3 xl:table-cell"><PriorityChips factors={c.priorityFactors} /></td>
                    <td className="px-3 py-3"><SlaBadge sla={c.sla} target={c.targetStartBy} /></td>
                    <td className="hidden px-3 py-3 2xl:table-cell">
                      <p className="font-semibold text-ink-900">{c.town}</p>
                      <p className="text-xs text-ink-500">{SETTING_LABEL[c.preferredSetting]}</p>
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell"><NextStep c={c} scheduled={status === 'scheduled'} /></td>
                    <td className="pr-4 text-ink-500"><ChevronRightRegular /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-cream-200 bg-cream-50 px-4 py-3 sm:px-5">
          <span className="text-sm text-ink-500">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </>
  );
}

function NextStep({ c, scheduled }: { c: QueueItem; scheduled: boolean }) {
  if (scheduled) return <span className="text-ink-700">{c.assignedTherapistName}</span>;
  if (c.status === 'needs-review') return <span className="text-xs text-red-800">{c.reviewReason}</span>;
  if (c.missingChecklist.length)
    return (
      <span className="flex flex-wrap gap-1">
        {c.missingChecklist.map((m) => (
          <span key={m} className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">{CHECKLIST_LABEL[m]}</span>
        ))}
      </span>
    );
  if (c.status === 'ready') return <span className="text-xs font-bold text-seed-700">Match &amp; book →</span>;
  return <StatusBadge status={c.status} />;
}
