import { useDeferredValue, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Badge,
  Button,
  Card,
  CounterBadge,
  Input,
  Select,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Title2,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { SearchRegular, FlashRegular } from '@fluentui/react-icons';
import { CHECKLIST_LABEL, SETTING_LABEL, STATUS_LABEL, type CaseStatus, type Discipline } from '@seeds/shared';
import { useQueue, useQueueCounts } from '../api';
import { DisciplineBadge, ErrorBar, Loading, PriorityChips, SlaBadge, StatusBadge, formatAge } from '../components/bits';

const TABS: CaseStatus[] = ['ready', 'pending-documents', 'needs-review', 'scheduled', 'on-hold', 'closed'];

const useStyles = makeStyles({
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacingVerticalM },
  filters: { display: 'flex', gap: tokens.spacingHorizontalM, alignItems: 'center', flexWrap: 'wrap', margin: `${tokens.spacingVerticalM} 0` },
  row: { cursor: 'pointer' },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  pager: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: tokens.spacingVerticalM },
});

export function QueuePage() {
  const s = useStyles();
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

  return (
    <>
      <div className={s.head}>
        <div>
          <Title2>Intake queue</Title2>
          <Text block className={s.sub}>
            Ordered by effective wait: days waiting plus priority boosts (under 3, urgent, sibling in care, mandated EI/CPSE).
          </Text>
        </div>
        <Button appearance="primary" icon={<FlashRegular />} onClick={() => nav('/auto-match')}>
          Auto-match the queue
        </Button>
      </div>

      <TabList selectedValue={status} onTabSelect={(_, d) => { setStatus(d.value as CaseStatus); setPage(1); }}>
        {TABS.map((t) => (
          <Tab key={t} value={t}>
            {STATUS_LABEL[t]}{' '}
            <CounterBadge count={counts.data?.counts[t] ?? 0} showZero appearance="ghost" color={t === 'needs-review' ? 'danger' : 'informative'} />
          </Tab>
        ))}
      </TabList>

      <div className={s.filters}>
        <Input contentBefore={<SearchRegular />} placeholder="Search child, family, or reference" value={search} onChange={(_, d) => { setSearch(d.value); setPage(1); }} style={{ minWidth: 300 }} />
        <Select value={discipline} onChange={(_, d) => { setDiscipline(d.value as Discipline | ''); setPage(1); }}>
          <option value="">All services</option>
          <option value="speech">Speech therapy</option>
          <option value="ot">Occupational therapy</option>
        </Select>
        {waiting && (
          <Select value={sla} onChange={(_, d) => { setSla(d.value as typeof sla); setPage(1); }}>
            <option value="">Any target date</option>
            <option value="at-risk">At risk (≤ 7 days left)</option>
            <option value="breached">Past target</option>
          </Select>
        )}
      </div>

      {queue.isError && <ErrorBar error={queue.error} />}
      <Card>
        {queue.isLoading ? (
          <Loading />
        ) : (
          <Table size="small" aria-label="Intake queue">
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: 48 }}>#</TableHeaderCell>
                <TableHeaderCell>Child</TableHeaderCell>
                <TableHeaderCell style={{ width: 70 }}>Age</TableHeaderCell>
                <TableHeaderCell style={{ width: 80 }}>Service</TableHeaderCell>
                <TableHeaderCell style={{ width: 120 }}>Waiting</TableHeaderCell>
                <TableHeaderCell>Priority</TableHeaderCell>
                <TableHeaderCell style={{ width: 110 }}>Target</TableHeaderCell>
                <TableHeaderCell>Location</TableHeaderCell>
                <TableHeaderCell>{status === 'scheduled' ? 'Therapist' : 'Blocking'}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.data?.items.map((c, i) => (
                <TableRow key={c.id} className={s.row} onClick={() => nav(`/cases/${c.id}`)}>
                  <TableCell>{(page - 1) * pageSize + i + 1}</TableCell>
                  <TableCell>
                    <Text weight="semibold">{c.childName}</Text>
                    <div className={s.sub}>{c.referenceCode}</div>
                  </TableCell>
                  <TableCell>{formatAge(c.ageMonths)}</TableCell>
                  <TableCell><DisciplineBadge discipline={c.discipline} /></TableCell>
                  <TableCell>
                    <Tooltip content={`${c.waitDays} days since referral; ${c.effectiveWaitDays - c.waitDays} priority days added`} relationship="description">
                      <Text weight="semibold">{c.effectiveWaitDays}d</Text>
                    </Tooltip>
                    {c.effectiveWaitDays !== c.waitDays && <span className={s.sub}> ({c.waitDays}d actual)</span>}
                  </TableCell>
                  <TableCell><PriorityChips factors={c.priorityFactors} /></TableCell>
                  <TableCell><SlaBadge sla={c.sla} target={c.targetStartBy} /></TableCell>
                  <TableCell>
                    {c.town}
                    <div className={s.sub}>{SETTING_LABEL[c.preferredSetting]}</div>
                  </TableCell>
                  <TableCell>
                    {status === 'scheduled' ? (
                      c.assignedTherapistName
                    ) : c.status === 'needs-review' ? (
                      <Text size={200}>{c.reviewReason}</Text>
                    ) : c.missingChecklist.length ? (
                      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {c.missingChecklist.map((m) => <Badge key={m} size="small" appearance="outline" color="warning">{CHECKLIST_LABEL[m]}</Badge>)}
                      </span>
                    ) : c.status === 'ready' ? (
                      <Text className={s.sub}>Paperwork complete</Text>
                    ) : (
                      <StatusBadge status={c.status} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {queue.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Text>Nothing here. {status === 'ready' ? 'The matching queue is empty.' : ''}</Text>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
      <div className={s.pager}>
        <Text className={s.sub}>{queue.data ? `${queue.data.total} cases` : ''}</Text>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Text>Page {page} of {pages}</Text>
          <Button size="small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
    </>
  );
}
