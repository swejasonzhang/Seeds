import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Badge,
  Card,
  CardHeader,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Title2,
  Title3,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowLeftRegular, HomeRegular, VehicleCarRegular, VideoRegular } from '@fluentui/react-icons';
import { DAY_LONG, SETTING_LABEL, formatMinute } from '@seeds/shared';
import { useRoute, useTherapist, useTherapists } from '../api';
import { DisciplineBadge, ErrorBar, Loading, windowsSummary } from '../components/bits';

const useStyles = makeStyles({
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  row: { cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: tokens.spacingHorizontalL, alignItems: 'start', marginTop: tokens.spacingVerticalL, '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' } },
  stop: { display: 'flex', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  leg: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 0 4px 8px' },
  time: { minWidth: '76px', fontWeight: tokens.fontWeightSemibold },
});

const todayIso = () => new Date().toLocaleDateString('en-CA');

export function TherapistsPage() {
  const s = useStyles();
  const nav = useNavigate();
  const list = useTherapists();
  if (list.isLoading) return <Loading />;
  if (list.isError) return <ErrorBar error={list.error} />;
  return (
    <>
      <Title2>Therapists</Title2>
      <Text block className={s.sub} style={{ marginBottom: 12 }}>
        Caseload, coverage and weekly drive time. Click a therapist for their week and daily route.
      </Text>
      <Card>
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Therapist</TableHeaderCell>
              <TableHeaderCell style={{ width: 80 }}>Service</TableHeaderCell>
              <TableHeaderCell>Home base</TableHeaderCell>
              <TableHeaderCell>Languages</TableHeaderCell>
              <TableHeaderCell>Settings</TableHeaderCell>
              <TableHeaderCell style={{ width: 130 }}>Caseload</TableHeaderCell>
              <TableHeaderCell style={{ width: 120 }}>Drive / week</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.map((t) => {
              const open = t.weeklyCapacity - t.sessionsBooked;
              return (
                <TableRow key={t.id} className={s.row} onClick={() => nav(`/therapists/${t.id}`)}>
                  <TableCell>
                    <Text weight="semibold">{t.name}</Text>
                    <div className={s.sub}>{windowsSummary(t.availability)}</div>
                  </TableCell>
                  <TableCell><DisciplineBadge discipline={t.discipline} /></TableCell>
                  <TableCell>{t.homeBaseLabel}<div className={s.sub}>≤ {t.maxOneWayTravelMinutes} min one way</div></TableCell>
                  <TableCell>{t.languages.join(', ')}</TableCell>
                  <TableCell>{t.settings.map((x) => SETTING_LABEL[x]).join(', ')}</TableCell>
                  <TableCell>
                    <Text weight="semibold">{t.sessionsBooked}</Text> / {t.weeklyCapacity}
                    <div className={s.sub}>{open > 0 ? `${open} open` : 'Full'}</div>
                  </TableCell>
                  <TableCell>{Math.round(t.weeklyDriveMinutes / 6) / 10} h</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

export function TherapistPage() {
  const { id = '' } = useParams();
  const s = useStyles();
  const t = useTherapist(id);
  const [date, setDate] = useState(todayIso());
  const route = useRoute(id, date);
  if (t.isLoading) return <Loading />;
  if (t.isError || !t.data) return <ErrorBar error={t.error} />;
  const d = t.data;
  const days = [1, 2, 3, 4, 5, 6, 0].filter((day) => d.appointments.some((a) => a.day === day) || d.availability.some((w) => w.day === day));

  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <Link to="/therapists" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <ArrowLeftRegular /> All therapists
        </Link>
      </div>
      <Title2>{d.name}</Title2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <DisciplineBadge discipline={d.discipline} />
        <Badge appearance="tint">{d.sessionsBooked}/{d.weeklyCapacity} sessions</Badge>
        <Badge appearance="tint" icon={<VehicleCarRegular />}>{Math.round(d.weeklyDriveMinutes)} min driving / week</Badge>
        <Text className={s.sub}>{d.homeBaseLabel} · {d.languages.join(', ')} · {d.email}</Text>
      </div>

      <div className={s.grid}>
        <Card>
          <CardHeader header={<Title3>Standing weekly schedule</Title3>} />
          {days.map((day) => {
            const appts = d.appointments.filter((a) => a.day === day);
            const avail = d.availability.filter((w) => w.day === day);
            return (
              <div key={day}>
                <Text weight="semibold">{DAY_LONG[day]}</Text>{' '}
                <span className={s.sub}>{avail.map((w) => `${formatMinute(w.start)}–${formatMinute(w.end)}`).join(', ') || 'not available'}</span>
                {appts.length === 0 && <div className={s.sub} style={{ padding: '4px 0 8px' }}>No sessions yet: open for new children</div>}
                {appts.map((a) => (
                  <div key={a.id} className={s.stop}>
                    <span className={s.time}>{formatMinute(a.start)}</span>
                    <span>
                      <Link to={`/cases/${a.caseId}`}>{a.childLabel}</Link> <span className={s.sub}>{a.referenceCode}</span>
                      <div className={s.sub}>{SETTING_LABEL[a.setting]} · {a.locationLabel}</div>
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </Card>

        <Card>
          <CardHeader
            header={<Title3>Route sheet</Title3>}
            action={
              <Field>
                <Input type="date" value={date} onChange={(_, v) => v.value && setDate(v.value)} />
              </Field>
            }
          />
          {route.isLoading && <Loading />}
          {route.isError && <ErrorBar error={route.error} />}
          {route.data && route.data.stops.length === 0 && <Text>No sessions on {DAY_LONG[route.data.day]}.</Text>}
          {route.data && route.data.stops.length > 0 && (
            <>
              <Text>
                {DAY_LONG[route.data.day]}: <strong>{route.data.stops.length} visits</strong>, {route.data.totalDriveMinutes} min / {route.data.totalDriveMiles} mi driving
                {route.data.travelSource === 'estimate' && <span className={s.sub}> (estimated)</span>}
              </Text>
              <div>
                <div className={s.leg}><HomeRegular /> Start at home base ({d.homeBaseLabel})</div>
                {route.data.stops.map((stop) => (
                  <div key={stop.appointmentId}>
                    <div className={s.leg}>
                      {stop.setting === 'telehealth' ? <><VideoRegular /> Telehealth: no drive</> : <><VehicleCarRegular /> {stop.driveMinutes} min ({stop.driveMiles} mi) from {stop.fromLabel}</>}
                    </div>
                    <div className={s.stop}>
                      <span className={s.time}>{formatMinute(stop.start)}</span>
                      <span>
                        <Text weight="semibold">{stop.label}</Text> · {stop.childLabel} <span className={s.sub}>{stop.referenceCode}</span>
                        <div className={s.sub}>until {formatMinute(stop.end)} · {SETTING_LABEL[stop.setting]}</div>
                      </span>
                    </div>
                  </div>
                ))}
                <div className={s.leg}><HomeRegular /> {route.data.returnHomeMinutes} min back to home base</div>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
