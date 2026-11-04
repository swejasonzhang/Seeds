import { useState } from 'react';
import { Link } from 'react-router';
import { CheckmarkCircleRegular, ErrorCircleRegular, FlashRegular, VehicleCarRegular } from '@fluentui/react-icons';
import { SETTING_LABEL, isTravelSetting, type AutoMatchResponse, type Discipline } from '@seeds/shared';
import { errorMessage, useAutoMatch, useConfirmBookings } from '../api';
import { useNotify } from '../toast';
import { DisciplineBadge, ErrorBar, PriorityChips, slotLabel } from '../components/bits';
import { Avatar, Button, Checkbox, Field, Select, Spinner, cn } from '../components/kit';
import { PageHeader, StatTile } from '../components/ui';

export function AutoMatchPage() {
  const notify = useNotify();
  const run = useAutoMatch();
  const confirm = useConfirmBookings();
  const [discipline, setDiscipline] = useState<Discipline | 'all'>('all');
  const [limit, setLimit] = useState('50');
  const [plan, setPlan] = useState<AutoMatchResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, string | true>>({});

  const go = () =>
    run.mutate(
      { discipline: discipline === 'all' ? undefined : discipline, limit: Number(limit) },
      {
        onSuccess: (p) => {
          setPlan(p);
          setResults({});
          setSelected(new Set(p.proposals.filter((x) => x.suggestion).map((x) => x.caseId)));
        },
      },
    );

  const pending = plan ? plan.proposals.filter((p) => p.suggestion && selected.has(p.caseId) && results[p.caseId] !== true) : [];

  const book = () =>
    confirm.mutate(
      { bookings: pending.map((p) => ({ caseId: p.caseId, therapistId: p.suggestion!.therapistId, setting: p.suggestion!.setting, slots: p.suggestion!.slots.map((x) => ({ day: x.day, start: x.start })) })) },
      {
        onSuccess: (r) => {
          const next = { ...results };
          for (const x of r.results) next[x.caseId] = x.ok ? true : (x.error ?? 'Failed');
          setResults(next);
          const ok = r.results.filter((x) => x.ok).length;
          notify(`Booked ${ok} of ${r.results.length} children`, ok === r.results.length ? 'success' : 'warning');
        },
        onError: (e) => notify('Booking failed', 'error', errorMessage(e)),
      },
    );

  const toggle = (id: string, on: boolean) => setSelected((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <div className={cn(plan && pending.length > 0 && 'pb-24')}>
      <PageHeader
        eyebrow="Staff portal"
        title="Auto-match the queue"
        description="Walks the ready queue in priority order and reserves each child’s best slot before moving on, so the highest-priority children get first pick and later visits cluster onto routes already planned. Nothing is booked until you confirm."
      />

      <div className="card card-pad mb-6 flex flex-wrap items-end gap-4">
        <Field label="Service" className="w-56">
          <Select value={discipline} onValueChange={setDiscipline} options={[{ value: 'all', label: 'Speech + OT' }, { value: 'speech', label: 'Speech therapy' }, { value: 'ot', label: 'Occupational therapy' }]} />
        </Field>
        <Field label="Children to plan" className="w-44">
          <Select value={limit} onValueChange={setLimit} options={['10', '25', '50', '100', '200'].map((n) => ({ value: n, label: `Top ${n}` }))} />
        </Field>
        <Button size="lg" onClick={go} disabled={run.isPending}>
          <FlashRegular /> {run.isPending ? 'Planning…' : plan ? 'Re-plan' : 'Propose schedule'}
        </Button>
      </div>

      {run.isPending && <Spinner label="Planning routes…" />}
      {run.isError && <ErrorBar error={run.error} />}

      {plan && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatTile label="Matched" value={plan.matched} context={`of ${plan.proposals.length} children in priority order`} />
            <StatTile label="Need a coordinator" value={plan.unmatched} status={plan.unmatched > 0 ? 'warning' : 'neutral'} context="No therapist fits yet; reasons below" />
            <StatTile label="Driving saved" value={`${(plan.estimatedMinutesSaved / 60).toFixed(1)} h/wk`} context="vs. a dedicated trip for every child" />
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-cream-200 text-xs font-bold uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="w-12 px-5 py-3" />
                    <th className="w-10 py-3">#</th>
                    <th className="px-3 py-3">Child</th>
                    <th className="hidden px-3 py-3 lg:table-cell">Priority</th>
                    <th className="px-3 py-3">Proposed therapist &amp; time</th>
                    <th className="hidden px-3 py-3 md:table-cell">Added drive</th>
                    <th className="px-3 py-3">Fit</th>
                    <th className="px-3 py-3">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-200">
                  {plan.proposals.map((p, i) => {
                    const r = results[p.caseId];
                    return (
                      <tr key={p.caseId} className={cn(!p.suggestion && 'bg-amber-50/40')}>
                        <td className="px-5 py-3">
                          {p.suggestion && r !== true && <Checkbox checked={selected.has(p.caseId)} onCheckedChange={(v) => toggle(p.caseId, v)} label={<span className="sr-only">Select {p.childName}</span>} />}
                        </td>
                        <td className="py-3 font-bold text-ink-500">{i + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={p.childName} size="sm" />
                            <div>
                              <Link to={`/staff/cases/${p.caseId}`} className="font-bold text-ink-900 hover:underline">{p.childName}</Link> <DisciplineBadge discipline={p.discipline} />
                              <p className="text-xs text-ink-500">{p.town} · {p.effectiveWaitDays}d effective wait</p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-3 py-3 lg:table-cell"><PriorityChips factors={p.priorityFactors} /></td>
                        <td className="px-3 py-3">
                          {p.suggestion ? (
                            <>
                              <p className="font-bold text-ink-900">{p.suggestion.therapistName}</p>
                              <p className="text-xs text-ink-500">{p.suggestion.slots.map(slotLabel).join(' · ')} · {SETTING_LABEL[p.suggestion.setting]}</p>
                              <p className="text-xs text-ink-500">{p.suggestion.reasons[0]}</p>
                            </>
                          ) : (
                            <p className="text-xs font-semibold text-amber-800">No match: {Object.entries(p.exclusions).map(([k, n]) => `${k} (${n})`).join(', ')}</p>
                          )}
                        </td>
                        <td className="hidden px-3 py-3 md:table-cell">
                          {p.suggestion && (isTravelSetting(p.suggestion.setting) ? <span className="chip"><VehicleCarRegular /> +{Math.round(p.suggestion.addedTravelMinutes)} min</span> : <span className="text-xs text-ink-500">none</span>)}
                        </td>
                        <td className="px-3 py-3 font-black text-ink-900">{p.suggestion?.score}</td>
                        <td className="px-3 py-3">
                          {r === true ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-seed-700"><CheckmarkCircleRegular /> Booked</span>
                          ) : r ? (
                            <span className="inline-flex items-start gap-1 text-xs font-semibold text-red-700"><ErrorCircleRegular className="mt-0.5 shrink-0" /> {r}</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {pending.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-cream-200 bg-white/95 backdrop-blur lg:left-64">
              <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-8">
                <p className="text-sm text-ink-700"><strong className="text-ink-900">{pending.length}</strong> proposals selected. Each one re-checks the live schedule as it books.</p>
                <Button size="lg" onClick={book} disabled={confirm.isPending}>{confirm.isPending ? 'Booking…' : `Book ${pending.length} children`}</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
