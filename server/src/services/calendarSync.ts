import { ClientSecretCredential, DefaultAzureCredential, type TokenCredential } from '@azure/identity';
import type { Logger } from 'pino';
import { DAY_LONG, DISCIPLINE_LABEL, type CalendarSyncState, type Discipline } from '@seeds/shared';
import type { AppConfig } from '../config.ts';
import { Appointment, Therapist, type AppointmentDoc } from '../db/models.ts';

export interface CalendarSync {
  enabled: boolean;
  initialState: CalendarSyncState;
  /** Ask the worker to drain the outbox now instead of waiting for the next tick. */
  nudge(): void;
  start(): void;
  stop(): Promise<void>;
  remove(appointment: Pick<AppointmentDoc, 'therapistId' | 'calendar'>): Promise<void>;
}

const disabled: CalendarSync = {
  enabled: false,
  initialState: 'not-configured',
  nudge() {},
  start() {},
  async stop() {},
  async remove() {},
};

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TICK_MS = 15_000;
const STALE_CLAIM_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

const pad = (n: number) => n.toString().padStart(2, '0');
const localDateTime = (date: string, minute: number) => `${date}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}:00`;

/**
 * Pushes standing sessions to each therapist's Outlook calendar through Microsoft Graph, using the appointments
 * collection as a transactional outbox. Claims are atomic (findOneAndUpdate), so any number of instances can run it.
 *
 * Graph setup: app registration with the *application* permission Calendars.ReadWrite, scoped to the therapists'
 * mailboxes with Exchange Online RBAC for Applications so the app can't touch anyone else's calendar.
 */
export function createCalendarSync(config: AppConfig, log: Logger, fetchImpl: typeof fetch = fetch): CalendarSync {
  if (!config.graph.enabled) return disabled;
  const { tenantId, clientId, clientSecret, windowsTimeZone } = config.graph;
  const credential: TokenCredential =
    tenantId && clientId && clientSecret ? new ClientSecretCredential(tenantId, clientId, clientSecret) : new DefaultAzureCredential();

  let timer: NodeJS.Timeout | undefined;
  let draining: Promise<void> | null = null;

  async function graph(path: string, init: RequestInit) {
    const token = await credential.getToken('https://graph.microsoft.com/.default');
    return fetchImpl(`${GRAPH}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token!.token}`, 'Content-Type': 'application/json', ...init.headers },
    });
  }

  async function publish(appt: AppointmentDoc) {
    const therapist = await Therapist.findById(appt.therapistId, { email: 1 }).lean();
    if (!therapist) throw new Error('Therapist not found');
    // No PHI in calendar items: initials + case reference only. Full details live behind sign-in in SEEDS.
    const event = {
      subject: `${DISCIPLINE_LABEL[appt.discipline as Discipline]} · ${appt.childLabel} (${appt.referenceCode})`,
      body: { contentType: 'text', content: 'Standing weekly session booked through the SEEDS staff portal. Open the case in the portal for address and notes.' },
      start: { dateTime: localDateTime(appt.startsOn, appt.start), timeZone: windowsTimeZone },
      end: { dateTime: localDateTime(appt.startsOn, appt.end), timeZone: windowsTimeZone },
      location: { displayName: appt.location?.label ?? (appt.setting === 'telehealth' ? 'Telehealth' : '') },
      recurrence: {
        pattern: { type: 'weekly', interval: 1, daysOfWeek: [DAY_LONG[appt.day]!.toLowerCase()] },
        range: appt.endsOn
          ? { type: 'endDate', startDate: appt.startsOn, endDate: appt.endsOn }
          : { type: 'noEnd', startDate: appt.startsOn },
      },
      showAs: 'busy',
      sensitivity: 'private',
      isReminderOn: true,
      reminderMinutesBeforeStart: 15,
      transactionId: appt._id.toString(), // idempotent retries: Graph won't create a second event
    };
    const res = await graph(`/users/${encodeURIComponent(therapist.email)}/events`, { method: 'POST', body: JSON.stringify(event) });
    if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const created = (await res.json()) as { id: string };
    return created.id;
  }

  async function claimNext(): Promise<AppointmentDoc | null> {
    const now = new Date();
    return Appointment.findOneAndUpdate(
      {
        status: 'active',
        $or: [
          { 'calendar.state': 'pending' },
          { 'calendar.state': 'syncing', 'calendar.claimedAt': { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
          { 'calendar.state': 'failed', 'calendar.attempts': { $lt: MAX_ATTEMPTS }, 'calendar.claimedAt': { $lt: new Date(now.getTime() - 60_000) } },
        ],
      },
      { $set: { 'calendar.state': 'syncing', 'calendar.claimedAt': now }, $inc: { 'calendar.attempts': 1 } },
      { sort: { 'calendar.claimedAt': 1 }, new: true },
    ).lean<AppointmentDoc>();
  }

  async function drain() {
    for (let i = 0; i < 25; i++) {
      const appt = await claimNext();
      if (!appt) return;
      try {
        const eventId = await publish(appt);
        await Appointment.updateOne({ _id: appt._id }, { $set: { 'calendar.state': 'synced', 'calendar.eventId': eventId, 'calendar.error': null } });
      } catch (err) {
        log.warn({ err, appointmentId: appt._id }, 'Calendar sync failed');
        await Appointment.updateOne({ _id: appt._id }, { $set: { 'calendar.state': 'failed', 'calendar.error': String(err).slice(0, 500) } });
      }
    }
  }

  const run = () => {
    if (draining) return;
    draining = drain()
      .catch((err) => log.error({ err }, 'Calendar outbox drain crashed'))
      .finally(() => (draining = null));
  };

  return {
    enabled: true,
    initialState: 'pending',
    nudge: () => setImmediate(run),
    start() {
      timer = setInterval(run, TICK_MS);
      timer.unref();
      run();
    },
    async stop() {
      clearInterval(timer);
      await draining;
    },
    async remove(appt) {
      if (!appt.calendar?.eventId) return;
      const therapist = await Therapist.findById(appt.therapistId, { email: 1 }).lean();
      if (!therapist) return;
      const res = await graph(`/users/${encodeURIComponent(therapist.email)}/events/${appt.calendar.eventId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) log.warn({ status: res.status }, 'Failed to delete Outlook event');
    },
  };
}
