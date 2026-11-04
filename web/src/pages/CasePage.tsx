import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  Badge,
  Body1,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Divider,
  Field,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Select,
  Text,
  Textarea,
  Title2,
  Title3,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowLeftRegular, CalendarCheckmarkRegular, MoreHorizontalRegular, VehicleCarRegular } from '@fluentui/react-icons';
import {
  CHECKLIST_LABEL,
  FUNDING_LABEL,
  REFERRAL_LABEL,
  SETTING_LABEL,
  isTravelSetting,
  type CaseDetail,
  type MatchSuggestionDto,
  type SessionSetting,
} from '@seeds/shared';
import { errorMessage, useCase, useCaseActions, useMatches } from '../api';
import { useNotify } from '../toast';
import {
  DisciplineBadge,
  ErrorBar,
  Loading,
  PriorityChips,
  SlaBadge,
  StatusBadge,
  disciplineName,
  formatAge,
  formatDate,
  formatDateTime,
  slotLabel,
  windowsSummary,
} from '../components/bits';

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)', gap: tokens.spacingHorizontalL, alignItems: 'start', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' } },
  col: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: tokens.spacingVerticalL },
  chips: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' },
  dl: { display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: '6px', columnGap: '12px', margin: '0px', '& dt': { color: tokens.colorNeutralForeground3 }, '& dd': { margin: '0px' } },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  suggestion: { padding: tokens.spacingHorizontalM, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, display: 'flex', gap: '16px' },
  score: { minWidth: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: tokens.fontWeightBold, fontSize: tokens.fontSizeBase500, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 },
  reasons: { margin: '6px 0 0', paddingLeft: '18px', color: tokens.colorNeutralForeground2 },
  timeline: { display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' },
});

export function CasePage() {
  const { id = '' } = useParams();
  const s = useStyles();
  const c = useCase(id);
  if (c.isLoading) return <Loading />;
  if (c.isError || !c.data) return <ErrorBar error={c.error ?? new Error('Case not found')} />;
  const d = c.data;

  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <Link to="/queue" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <ArrowLeftRegular /> Back to queue
        </Link>
      </div>
      <div className={s.header}>
        <div>
          <Title2>{d.childName}</Title2>
          <div className={s.chips}>
            <Text className={s.sub}>{d.referenceCode}</Text>
            <StatusBadge status={d.status} />
            <DisciplineBadge discipline={d.discipline} />
            <SlaBadge sla={d.sla} target={d.targetStartBy} />
            <PriorityChips factors={d.priorityFactors} />
            <Text className={s.sub}>
              Waiting {d.waitDays} days · queue position as if {d.effectiveWaitDays} days
            </Text>
          </div>
        </div>
        <CaseMenu c={d} />
      </div>

      {d.status === 'needs-review' && <ReviewBar c={d} />}

      <div className={s.grid}>
        <div className={s.col}>
          <Card>
            <CardHeader header={<Title3>Child &amp; family</Title3>} />
            <dl className={s.dl}>
              <dt>Child</dt>
              <dd>{d.child.firstName} {d.child.lastName}, {formatAge(d.ageMonths)} (DOB {formatDate(d.child.dateOfBirth)})</dd>
              <dt>Language</dt>
              <dd>{d.child.preferredLanguage}</dd>
              <dt>Address</dt>
              <dd>
                {d.child.address.line1}, {d.child.address.city}, {d.child.address.state} {d.child.address.postalCode}
                {d.child.geocodePrecision === 'zip-approx' && <div className={s.sub}>Location approximate (ZIP level): travel times are estimates</div>}
              </dd>
              {d.guardians.map((g, i) => (
                <GuardianRow key={i} g={g} />
              ))}
              {d.siblings.length > 0 && (
                <>
                  <dt>Siblings</dt>
                  <dd>
                    {d.siblings.map((x) => (
                      <div key={x.id}>
                        <Link to={`/cases/${x.id}`}>{x.childName}</Link> · {disciplineName(x.discipline)} · <StatusBadge status={x.status} />
                        {x.therapistName && <span className={s.sub}> with {x.therapistName}</span>}
                      </div>
                    ))}
                  </dd>
                </>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader header={<Title3>Referral</Title3>} />
            <dl className={s.dl}>
              <dt>Received</dt>
              <dd>{formatDateTime(d.receivedAt)}</dd>
              <dt>Referred by</dt>
              <dd>{REFERRAL_LABEL[d.referralSource]}{d.referringProvider ? ` · ${d.referringProvider}` : ''}</dd>
              <dt>Funding</dt>
              <dd>
                {FUNDING_LABEL[d.fundingSource]}
                {d.insurance && <div className={s.sub}>{d.insurance.payer} · Member {d.insurance.memberId}</div>}
              </dd>
              <dt>Concerns</dt>
              <dd>
                {d.urgentConcern && <Badge color="danger" appearance="tint" style={{ marginRight: 6 }}>Urgent</Badge>}
                {d.concerns}
              </dd>
            </dl>
          </Card>

          <ChecklistCard c={d} />
          <PlanCard c={d} />

          <Card>
            <CardHeader header={<Title3>Activity</Title3>} />
            <div className={s.timeline}>
              {d.events.map((e, i) => (
                <div key={i}>
                  <Text weight="semibold">{e.message}</Text>
                  <div className={s.sub}>{e.actor} · {formatDateTime(e.at)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className={s.col}>
          {d.status === 'scheduled' ? <AppointmentsCard c={d} /> : d.status !== 'closed' && <MatchesCard c={d} />}
        </div>
      </div>
    </>
  );
}

function GuardianRow({ g }: { g: CaseDetail['guardians'][number] }) {
  return (
    <>
      <dt>{g.relationship}</dt>
      <dd>
        {g.firstName} {g.lastName} · <a href={`tel:${g.phone}`}>{g.phone}</a>
        {g.email && <> · <a href={`mailto:${g.email}`}>{g.email}</a></>}
      </dd>
    </>
  );
}

function ChecklistCard({ c }: { c: CaseDetail }) {
  const actions = useCaseActions(c.id);
  const notify = useNotify();
  const done = c.requiredChecklist.filter((i) => c.completedChecklist.includes(i)).length;
  return (
    <Card>
      <CardHeader
        header={<Title3>Paperwork</Title3>}
        description={<Text size={200}>{done}/{c.requiredChecklist.length} complete · required for {FUNDING_LABEL[c.fundingSource]}. Completing the list moves the case into the matching queue automatically.</Text>}
      />
      {c.requiredChecklist.map((item) => (
        <Checkbox
          key={item}
          label={CHECKLIST_LABEL[item]}
          checked={c.completedChecklist.includes(item)}
          disabled={actions.checklist.isPending || c.status === 'closed'}
          onChange={(_, d) =>
            actions.checklist.mutate({ item, completed: Boolean(d.checked) }, { onError: (e) => notify('Could not update checklist', 'error', errorMessage(e)) })
          }
        />
      ))}
      {c.consent && <Text size={200}>Consent e-signed by {c.consent.signedBy} on {formatDateTime(c.consent.signedAt)}</Text>}
    </Card>
  );
}

function PlanCard({ c }: { c: CaseDetail }) {
  const actions = useCaseActions(c.id);
  const notify = useNotify();
  const editable = c.status !== 'scheduled' && c.status !== 'closed';
  const update = (b: Parameters<typeof actions.plan.mutate>[0]) =>
    actions.plan.mutate(b, { onSuccess: () => notify('Plan updated'), onError: (e) => notify('Could not update plan', 'error', errorMessage(e)) });
  return (
    <Card>
      <CardHeader header={<Title3>Care plan &amp; availability</Title3>} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Sessions / week">
          <Select disabled={!editable} value={String(c.sessionsPerWeek)} onChange={(_, d) => update({ sessionsPerWeek: Number(d.value) })}>
            {[1, 2, 3].map((n) => <option key={n}>{n}</option>)}
          </Select>
        </Field>
        <Field label="Minutes">
          <Select disabled={!editable} value={String(c.sessionMinutes)} onChange={(_, d) => update({ sessionMinutes: Number(d.value) as 30 | 45 | 60 })}>
            {[30, 45, 60].map((n) => <option key={n}>{n}</option>)}
          </Select>
        </Field>
        <Field label="Setting">
          <Select
            disabled={!editable || c.preferredSetting === 'community'}
            value={c.preferredSetting}
            onChange={(_, d) => update({ preferredSetting: d.value as 'home' | 'clinic' | 'telehealth' })}
          >
            {((c.preferredSetting === 'community' ? ['home', 'clinic', 'telehealth', 'community'] : ['home', 'clinic', 'telehealth']) as SessionSetting[]).map((x) => (
              <option key={x} value={x}>{SETTING_LABEL[x]}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Checkbox disabled={!editable} label="Telehealth OK" checked={c.acceptsTelehealth} onChange={(_, d) => update({ acceptsTelehealth: Boolean(d.checked) })} />
      <Checkbox disabled={!editable} label="Urgent concern (re-prioritizes the queue)" checked={c.urgentConcern} onChange={(_, d) => update({ urgentConcern: Boolean(d.checked) })} />
      <Text>
        <strong>Family availability:</strong> {windowsSummary(c.availability)}
      </Text>
      {c.sessionLocationLabel && <Text size={200}>Session location: {c.sessionLocationLabel}</Text>}
    </Card>
  );
}

function MatchesCard({ c }: { c: CaseDetail }) {
  const s = useStyles();
  const ready = c.status === 'ready';
  const matches = useMatches(c.id, true);
  const actions = useCaseActions(c.id);
  const notify = useNotify();

  const book = (m: MatchSuggestionDto) =>
    actions.book.mutate(
      { therapistId: m.therapistId, setting: m.setting, slots: m.slots.map((x) => ({ day: x.day, start: x.start })) },
      {
        onSuccess: () => notify(`Booked with ${m.therapistName}`, 'success', m.slots.map(slotLabel).join(', ')),
        onError: (e) => notify('Could not book', 'error', errorMessage(e)),
      },
    );

  return (
    <Card>
      <CardHeader
        header={<Title3>Best therapist matches</Title3>}
        description={
          <Text size={200}>
            Ranked by added drive time on the therapist's existing route, caseload balance, language and sibling continuity.
            {matches.data && ` Drive times: ${matches.data.travelSource === 'azure-maps' ? 'Azure Maps' : 'estimated'}.`}
          </Text>
        }
      />
      {!ready && (
        <MessageBar intent="info">
          <MessageBarBody>Preview only: finish the paperwork{c.status === 'needs-review' ? ' and review' : ''} to book.</MessageBarBody>
        </MessageBar>
      )}
      {matches.isLoading && <Loading label="Finding therapists…" />}
      {matches.isError && <ErrorBar error={matches.error} />}
      {matches.data?.suggestions.map((m) => (
        <div key={m.therapistId} className={s.suggestion}>
          <div className={s.score} title="Fit score">{m.score}</div>
          <div style={{ flexGrow: 1 }}>
            <Text weight="semibold" size={400}>{m.therapistName}</Text>
            <div className={s.sub} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span><CalendarCheckmarkRegular /> {m.slots.map(slotLabel).join(' · ')}</span>
              <span>{SETTING_LABEL[m.setting]}</span>
              {isTravelSetting(m.setting) && <span><VehicleCarRegular /> +{Math.round(m.addedTravelMinutes)} min/week</span>}
            </div>
            <ul className={s.reasons}>
              {m.reasons.map((r, i) => <li key={i}><Body1>{r}</Body1></li>)}
            </ul>
          </div>
          <div>
            <Button appearance="primary" disabled={!ready || actions.book.isPending} onClick={() => book(m)}>
              Book
            </Button>
          </div>
        </div>
      ))}
      {matches.data && matches.data.suggestions.length === 0 && (
        <MessageBar intent="warning">
          <MessageBarBody>
            <strong>No therapist can take this child right now.</strong>
            <ul style={{ margin: '4px 0 0' }}>
              {Object.entries(matches.data.exclusions).map(([why, n]) => <li key={why}>{why}: {n} therapist{n === 1 ? '' : 's'}</li>)}
            </ul>
            Try widening the family's availability, allowing telehealth, or reducing sessions per week.
          </MessageBarBody>
        </MessageBar>
      )}
    </Card>
  );
}

function AppointmentsCard({ c }: { c: CaseDetail }) {
  const s = useStyles();
  const actions = useCaseActions(c.id);
  const notify = useNotify();
  const [reason, setReason] = useState('');
  return (
    <Card>
      <CardHeader header={<Title3>Standing sessions</Title3>} description={<Text size={200}>with {c.assignedTherapistName}</Text>} />
      {c.appointments.map((a) => (
        <div key={a.id} className={s.suggestion}>
          <CalendarCheckmarkRegular fontSize={28} />
          <div style={{ flexGrow: 1 }}>
            <Text weight="semibold">Every {slotLabel(a)}</Text>
            <div className={s.sub}>
              {SETTING_LABEL[a.setting]} · {a.locationLabel} · first session {formatDate(a.startsOn)} (evaluation)
            </div>
            <div className={s.sub}>
              Outlook calendar: {a.calendarSync === 'not-configured' ? 'sync not configured' : a.calendarSync}
            </div>
          </div>
          <Link to={`/therapists/${a.therapistId}`}>Therapist's week</Link>
        </div>
      ))}
      <Divider />
      <Field label="Return to queue (cancels these sessions; the child keeps their queue position)">
        <Textarea value={reason} onChange={(_, d) => setReason(d.value)} placeholder="Reason, e.g. family schedule changed" />
      </Field>
      <div>
        <Button
          disabled={reason.trim().length < 2 || actions.unschedule.isPending}
          onClick={() => actions.unschedule.mutate(reason, { onSuccess: () => { setReason(''); notify('Returned to queue'); }, onError: (e) => notify('Failed', 'error', errorMessage(e)) })}
        >
          Return to queue
        </Button>
      </div>
    </Card>
  );
}

function ReviewBar({ c }: { c: CaseDetail }) {
  const actions = useCaseActions(c.id);
  const notify = useNotify();
  return (
    <MessageBar intent="warning" style={{ marginBottom: 16 }}>
      <MessageBarBody>
        <strong>Needs review:</strong> {c.reviewReason}{' '}
        <Button size="small" onClick={() => actions.resolveReview.mutate({ note: 'Verified with family' }, { onSuccess: () => notify('Review resolved'), onError: (e) => notify('Failed', 'error', errorMessage(e)) })}>
          Mark resolved
        </Button>
      </MessageBarBody>
    </MessageBar>
  );
}

function CaseMenu({ c }: { c: CaseDetail }) {
  const actions = useCaseActions(c.id);
  const notify = useNotify();
  const run = (status: 'on-hold' | 'closed' | 'ready', note: string) =>
    actions.status.mutate({ status, note }, { onSuccess: () => notify('Case updated'), onError: (e) => notify('Could not update case', 'error', errorMessage(e)) });
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button icon={<MoreHorizontalRegular />}>Actions</Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {(c.status === 'on-hold' || c.status === 'closed') && <MenuItem onClick={() => run('ready', 'Resumed')}>Resume / reopen</MenuItem>}
          {c.status !== 'on-hold' && c.status !== 'scheduled' && c.status !== 'closed' && <MenuItem onClick={() => run('on-hold', 'Family requested a pause')}>Put on hold</MenuItem>}
          {c.status !== 'closed' && <MenuItem onClick={() => run('closed', c.status === 'scheduled' ? 'Discharged' : 'Closed')}>{c.status === 'scheduled' ? 'Discharge' : 'Close case'}</MenuItem>}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
