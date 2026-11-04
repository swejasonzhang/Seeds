import { useState } from 'react';
import { Link } from 'react-router';
import {
  Button,
  Card,
  Checkbox,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Title2,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { FlashRegular } from '@fluentui/react-icons';
import { SETTING_LABEL, isTravelSetting, type AutoMatchResponse, type Discipline } from '@seeds/shared';
import { errorMessage, useAutoMatch, useConfirmBookings } from '../api';
import { useNotify } from '../toast';
import { DisciplineBadge, ErrorBar, PriorityChips, slotLabel } from '../components/bits';

const useStyles = makeStyles({
  controls: { display: 'flex', gap: tokens.spacingHorizontalM, alignItems: 'flex-end', margin: `${tokens.spacingVerticalM} 0` },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

export function AutoMatchPage() {
  const s = useStyles();
  const notify = useNotify();
  const run = useAutoMatch();
  const confirm = useConfirmBookings();
  const [discipline, setDiscipline] = useState<Discipline | ''>('');
  const [limit, setLimit] = useState(50);
  const [plan, setPlan] = useState<AutoMatchResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, string | true>>({});

  const go = () =>
    run.mutate(
      { discipline: discipline || undefined, limit },
      {
        onSuccess: (p) => {
          setPlan(p);
          setResults({});
          setSelected(new Set(p.proposals.filter((x) => x.suggestion).map((x) => x.caseId)));
        },
      },
    );

  const book = () => {
    if (!plan) return;
    const bookings = plan.proposals
      .filter((p) => p.suggestion && selected.has(p.caseId) && results[p.caseId] !== true)
      .map((p) => ({
        caseId: p.caseId,
        therapistId: p.suggestion!.therapistId,
        setting: p.suggestion!.setting,
        slots: p.suggestion!.slots.map((x) => ({ day: x.day, start: x.start })),
      }));
    confirm.mutate(
      { bookings },
      {
        onSuccess: (r) => {
          const next = { ...results };
          for (const x of r.results) next[x.caseId] = x.ok ? true : (x.error ?? 'Failed');
          setResults(next);
          const ok = r.results.filter((x) => x.ok).length;
          notify(`Booked ${ok} of ${r.results.length}`, ok === r.results.length ? 'success' : 'warning');
        },
        onError: (e) => notify('Booking failed', 'error', errorMessage(e)),
      },
    );
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <>
      <Title2>Auto-match the queue</Title2>
      <Text block className={s.sub}>
        Walks the ready queue in priority order and proposes each child's best slot, reserving it before moving on, so the
        highest-priority children get first pick and later visits cluster onto routes already planned. Nothing is booked until you confirm.
      </Text>
      <div className={s.controls}>
        <Field label="Service">
          <Select value={discipline} onChange={(_, d) => setDiscipline(d.value as Discipline | '')}>
            <option value="">Speech + OT</option>
            <option value="speech">Speech therapy</option>
            <option value="ot">Occupational therapy</option>
          </Select>
        </Field>
        <Field label="Top N children">
          <Select value={String(limit)} onChange={(_, d) => setLimit(Number(d.value))}>
            {[10, 25, 50, 100, 200].map((n) => <option key={n}>{n}</option>)}
          </Select>
        </Field>
        <Button appearance="primary" icon={<FlashRegular />} onClick={go} disabled={run.isPending}>
          {run.isPending ? 'Planning…' : 'Propose schedule'}
        </Button>
        {plan && (
          <Button appearance="primary" onClick={book} disabled={confirm.isPending || selected.size === 0}>
            {confirm.isPending ? 'Booking…' : `Book ${[...selected].filter((id) => results[id] !== true).length} selected`}
          </Button>
        )}
      </div>

      {run.isError && <ErrorBar error={run.error} />}
      {plan && (
        <MessageBar intent="success" style={{ marginBottom: 12 }}>
          <MessageBarBody>
            <MessageBarTitle>
              {plan.matched} of {plan.proposals.length} children matched
            </MessageBarTitle>
            Clustering onto existing routes saves about {Math.round(plan.estimatedMinutesSaved / 60)} hours of driving per week versus dedicated trips.
            {plan.unmatched > 0 && ` ${plan.unmatched} need a coordinator's attention (see reasons).`}
          </MessageBarBody>
        </MessageBar>
      )}

      {plan && (
        <Card>
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: 40 }} />
                <TableHeaderCell style={{ width: 40 }}>#</TableHeaderCell>
                <TableHeaderCell>Child</TableHeaderCell>
                <TableHeaderCell>Priority</TableHeaderCell>
                <TableHeaderCell>Proposed therapist &amp; time</TableHeaderCell>
                <TableHeaderCell style={{ width: 110 }}>Added drive</TableHeaderCell>
                <TableHeaderCell style={{ width: 60 }}>Fit</TableHeaderCell>
                <TableHeaderCell>Result</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.proposals.map((p, i) => {
                const r = results[p.caseId];
                return (
                  <TableRow key={p.caseId}>
                    <TableCell>
                      {p.suggestion && r !== true && <Checkbox checked={selected.has(p.caseId)} onChange={(_, d) => toggle(p.caseId, Boolean(d.checked))} />}
                    </TableCell>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>
                      <Link to={`/cases/${p.caseId}`}>{p.childName}</Link> <DisciplineBadge discipline={p.discipline} />
                      <div className={s.sub}>{p.town} · {p.effectiveWaitDays}d effective wait</div>
                    </TableCell>
                    <TableCell><PriorityChips factors={p.priorityFactors} /></TableCell>
                    <TableCell>
                      {p.suggestion ? (
                        <>
                          <Text weight="semibold">{p.suggestion.therapistName}</Text>
                          <div className={s.sub}>{p.suggestion.slots.map(slotLabel).join(' · ')} · {SETTING_LABEL[p.suggestion.setting]}</div>
                          <div className={s.sub}>{p.suggestion.reasons[0]}</div>
                        </>
                      ) : (
                        <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                          No match: {Object.entries(p.exclusions).map(([k, n]) => `${k} (${n})`).join(', ')}
                        </Text>
                      )}
                    </TableCell>
                    <TableCell>{p.suggestion && isTravelSetting(p.suggestion.setting) ? `+${Math.round(p.suggestion.addedTravelMinutes)} min` : p.suggestion ? '0' : ''}</TableCell>
                    <TableCell>{p.suggestion?.score}</TableCell>
                    <TableCell>{r === true ? <Text style={{ color: tokens.colorPaletteGreenForeground1 }}>Booked</Text> : r ? <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>{r}</Text> : null}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
