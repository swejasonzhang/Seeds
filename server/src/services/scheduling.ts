import mongoose from 'mongoose';
import {
  DAY_SHORT,
  formatMinute,
  isTravelSetting,
  type AutoMatchResponse,
  type BookRequest,
  type Discipline,
  type MatchResponse,
  type MatchSuggestionDto,
} from '@seeds/shared';
import { Appointment, IntakeCase, Therapist, fromPoint, toPoint, type AppointmentDoc, type CaseDoc, type TherapistDoc } from '../db/models.ts';
import { cloneSchedule, matchCase, planQueue, type MatchRequest, type MatchSuggestion, type TherapistSchedule } from '../core/matching.ts';
import type { GeoPoint } from '../core/travel.ts';
import { addDays, nextOccurrence, wholeDaysSince } from '../core/dates.ts';
import { deriveStatus } from '../core/policies.ts';
import { today, type Services } from '../context.ts';
import { conflict, HttpError, notFound } from '../errors.ts';
import { childLabel, event, therapistName } from './mappers.ts';

const { Types } = mongoose;

// ---------- loading engine inputs ----------

export async function loadSchedules(filter: { discipline?: Discipline; therapistIds?: string[] } = {}): Promise<TherapistSchedule[]> {
  const q: Record<string, unknown> = { active: true };
  if (filter.discipline) q.discipline = filter.discipline;
  if (filter.therapistIds) q._id = { $in: filter.therapistIds.map((id) => new Types.ObjectId(id)) };
  const therapists = await Therapist.find(q).lean<TherapistDoc[]>();
  const appts = await Appointment.find(
    { therapistId: { $in: therapists.map((t) => t._id) }, status: 'active' },
    { therapistId: 1, day: 1, start: 1, end: 1, location: 1, caseId: 1 },
  ).lean<AppointmentDoc[]>();

  const byTherapist = new Map<string, AppointmentDoc[]>();
  for (const a of appts) {
    const k = a.therapistId.toString();
    byTherapist.set(k, [...(byTherapist.get(k) ?? []), a]);
  }
  return therapists.map((t) => toSchedule(t, byTherapist.get(t._id.toString()) ?? []));
}

function toSchedule(t: TherapistDoc, appts: AppointmentDoc[]): TherapistSchedule {
  return {
    therapistId: t._id.toString(),
    name: therapistName(t),
    discipline: t.discipline,
    homeBase: fromPoint(t.homeBase.point)!,
    maxOneWayTravelMinutes: t.maxOneWayTravelMinutes,
    weeklyCapacity: t.weeklyCapacity,
    settings: t.settings,
    languages: t.languages,
    availability: t.availability.map((w) => ({ day: w.day!, start: w.start!, end: w.end! })),
    visits: appts.map((a) => ({
      day: a.day,
      start: a.start,
      end: a.end,
      location: fromPoint(a.location?.point),
      label: a.location?.label ?? 'Telehealth',
      caseId: a.caseId.toString(),
    })),
  };
}

export async function toMatchRequest(c: CaseDoc): Promise<MatchRequest> {
  // Continuity: a sibling's therapist (same household, same discipline) can do back-to-back visits at one address.
  const sibling = c.householdKey
    ? await IntakeCase.findOne(
        { householdKey: c.householdKey, _id: { $ne: c._id }, discipline: c.discipline, status: 'scheduled' },
        { assignedTherapistId: 1 },
      ).lean()
    : null;
  return {
    caseId: c._id.toString(),
    discipline: c.discipline,
    setting: c.preferredSetting,
    acceptsTelehealth: c.acceptsTelehealth,
    location: fromPoint(c.sessionLocation?.point),
    locationLabel: c.sessionLocation?.label ?? c.town ?? '',
    familyWindows: c.availability.map((w) => ({ day: w.day!, start: w.start!, end: w.end! })),
    sessionsPerWeek: c.sessionsPerWeek,
    sessionMinutes: c.sessionMinutes,
    preferredLanguage: c.preferredLanguage ?? 'English',
    continuityTherapistId: sibling?.assignedTherapistId?.toString(),
  };
}

/** Every location the engine might measure between for these therapists on the family's days. */
function relevantPoints(request: MatchRequest, schedules: TherapistSchedule[], s: Services): GeoPoint[] {
  const days = new Set(request.familyWindows.map((w) => w.day));
  const points: GeoPoint[] = [];
  if (request.location) points.push(request.location);
  if (request.setting === 'clinic') points.push(s.config.matching.clinic);
  for (const t of schedules) {
    points.push(t.homeBase);
    for (const v of t.visits) if (v.location && days.has(v.day)) points.push(v.location);
  }
  return points;
}

const toDto = (m: MatchSuggestion): MatchSuggestionDto => ({
  therapistId: m.therapistId,
  therapistName: m.therapistName,
  setting: m.setting,
  slots: m.slots,
  score: m.score,
  addedTravelMinutes: m.addedTravelMinutes,
  addedMiles: m.addedMiles,
  caseloadAfter: m.caseloadAfter,
  weeklyCapacity: m.weeklyCapacity,
  reasons: m.reasons,
});

// ---------- single-case matching ----------

/**
 * Two-phase matching. Phase 1 screens every therapist with the cheap heuristic. Phase 2 re-scores only the top few
 * with real Azure Maps drive times (one route-matrix call, cached), so cost stays flat as staff count grows.
 */
export async function matchForCase(caseId: string, s: Services): Promise<MatchResponse> {
  const c = await IntakeCase.findById(caseId).lean<CaseDoc>();
  if (!c) throw notFound('Case');
  const request = await toMatchRequest(c);
  const schedules = await loadSchedules({ discipline: c.discipline });

  const screen = matchCase(request, schedules, s.travel.screening, { ...s.config.matching, maxSuggestions: 8 });
  if (s.travel.source === 'estimate' || screen.suggestions.length === 0) {
    return { suggestions: screen.suggestions.slice(0, s.config.matching.maxSuggestions).map(toDto), exclusions: screen.exclusions, travelSource: 'estimate' };
  }

  const shortlist = schedules.filter((t) => screen.suggestions.slice(0, 6).some((x) => x.therapistId === t.therapistId));
  const refined = await s.travel.refine(relevantPoints(request, shortlist, s));
  const final = matchCase(request, shortlist, refined, s.config.matching);
  return { suggestions: final.suggestions.map(toDto), exclusions: screen.exclusions, travelSource: 'azure-maps' };
}

// ---------- whole-queue auto-match ----------

export async function autoMatch(opts: { discipline?: Discipline; limit: number }, s: Services): Promise<AutoMatchResponse> {
  const q: Record<string, unknown> = { status: 'ready' };
  if (opts.discipline) q.discipline = opts.discipline;
  const cases = await IntakeCase.find(q).sort({ queueSortKey: 1 }).limit(opts.limit).lean<CaseDoc[]>();
  const requests = await Promise.all(cases.map(toMatchRequest));
  const schedules = (await loadSchedules(opts.discipline ? { discipline: opts.discipline } : {})).map(cloneSchedule);

  const plan = planQueue(requests, schedules, s.travel.screening, s.config.matching);
  const now = s.now();
  const byId = new Map(cases.map((c) => [c._id.toString(), c]));
  let saved = 0;
  const proposals = plan.map((entry) => {
    const c = byId.get(entry.request.caseId)!;
    if (entry.proposal) saved += Math.max(0, entry.standaloneMinutes - entry.proposal.addedTravelMinutes);
    return {
      caseId: entry.request.caseId,
      referenceCode: c.referenceCode,
      childName: c.childName,
      discipline: c.discipline,
      effectiveWaitDays: wholeDaysSince(c.queueSortKey, now),
      priorityFactors: c.priorityFactors,
      town: c.town ?? '',
      suggestion: entry.proposal ? toDto(entry.proposal) : undefined,
      exclusions: entry.exclusions,
    };
  });
  const matched = proposals.filter((p) => p.suggestion).length;
  return { proposals, matched, unmatched: proposals.length - matched, travelSource: 'estimate', estimatedMinutesSaved: Math.round(saved) };
}

// ---------- booking ----------

/**
 * Book standing weekly sessions with optimistic concurrency and no multi-document transaction (works on a standalone
 * MongoDB, Atlas, or Cosmos DB for MongoDB alike):
 *   1. re-validate the exact slots against the therapist's *current* week
 *   2. insert appointments
 *   3. claim the therapist's scheduleVersion read in step 1 (compare-and-swap)
 *   4. move the case ready → scheduled (conditional)
 * If 3 or 4 loses a race, the inserted appointments are deleted and the caller gets 409. Because appointments are
 * written *before* the version claim, a concurrent booker either sees them or loses the claim: no double-booking.
 */
export async function bookCase(caseId: string, body: BookRequest, actor: string, s: Services) {
  const c = await IntakeCase.findById(caseId).lean<CaseDoc>();
  if (!c) throw notFound('Case');
  if (c.status !== 'ready') throw conflict(`This case is "${c.status}", not ready to schedule`);
  if (!Types.ObjectId.isValid(body.therapistId)) throw notFound('Therapist');
  const therapist = await Therapist.findOne({ _id: body.therapistId, active: true }).lean<TherapistDoc>();
  if (!therapist) throw notFound('Therapist');
  if (therapist.discipline !== c.discipline) throw new HttpError(400, 'Therapist discipline does not match this case', 'bad_request');
  if (new Set(body.slots.map((x) => x.day)).size !== body.slots.length) throw new HttpError(400, 'Use one slot per day', 'bad_request');

  const version = therapist.scheduleVersion;
  const [schedule] = await loadSchedules({ therapistIds: [body.therapistId] });
  const base = await toMatchRequest(c);
  const request: MatchRequest = {
    ...base,
    setting: body.setting,
    acceptsTelehealth: false,
    sessionsPerWeek: body.slots.length,
    familyWindows: body.slots.map((x) => ({ day: x.day, start: x.start, end: x.start + c.sessionMinutes })),
  };
  const estimator = s.travel.source === 'azure-maps' ? await s.travel.refine(relevantPoints(request, [schedule!], s)) : s.travel.screening;
  const check = matchCase(request, [schedule!], estimator, s.config.matching);
  const ok = check.suggestions[0];
  const requested = new Set(body.slots.map((x) => `${x.day}:${x.start}`));
  if (!ok || ok.slots.some((x) => !requested.has(`${x.day}:${x.start}`))) {
    const why = Object.keys(check.exclusions)[0] ?? 'the slot is no longer open';
    throw conflict(`That time can't be booked: ${why}. Refresh the suggestions and try again.`);
  }

  const startDate = addDays(today(s), 1);
  const location = isTravelSetting(body.setting) || body.setting === 'clinic'
    ? { label: body.setting === 'clinic' ? s.config.matching.clinicLabel : request.locationLabel, point: ok.visitLocation ? toPoint(ok.visitLocation) : undefined }
    : undefined;
  const [first, last] = c.childName.split(' ');
  const name = therapistName(therapist);

  const inserted = await Appointment.insertMany(
    ok.slots.map((slot) => ({
      caseId: c._id,
      therapistId: therapist._id,
      referenceCode: c.referenceCode,
      childLabel: childLabel(first ?? '', last ?? ''),
      therapistName: name,
      discipline: c.discipline,
      day: slot.day,
      start: slot.start,
      end: slot.end,
      startsOn: nextOccurrence(startDate, slot.day),
      setting: body.setting,
      location,
      calendar: { state: s.calendar.initialState },
    })),
  );
  const rollback = () => Appointment.deleteMany({ _id: { $in: inserted.map((a) => a._id) } });

  const claimed = await Therapist.updateOne({ _id: therapist._id, scheduleVersion: version }, { $inc: { scheduleVersion: 1 } });
  if (claimed.modifiedCount !== 1) {
    await rollback();
    throw conflict(`${name}'s schedule just changed. Refresh the suggestions and try again.`);
  }

  const when = ok.slots.map((x) => `${DAY_SHORT[x.day]} ${formatMinute(x.start)}`).join(', ');
  const moved = await IntakeCase.updateOne(
    { _id: c._id, status: 'ready' },
    {
      $set: { status: 'scheduled', assignedTherapistId: therapist._id, assignedTherapistName: name, scheduledAt: s.now() },
      $push: {
        events: event(actor, 'scheduled', `Booked with ${name}: ${when} (${body.setting}, +${Math.round(ok.addedTravelMinutes)} min drive/week)`, s.now()),
      },
    },
  );
  if (moved.modifiedCount !== 1) {
    await rollback();
    throw conflict('Someone else just updated this case. Refresh and try again.');
  }

  s.calendar.nudge();
  return Appointment.find({ _id: { $in: inserted.map((a) => a._id) } }).lean<AppointmentDoc[]>();
}

/** Cancel a case's standing sessions and put it back in the queue (keeping its original queue position). */
export async function unscheduleCase(caseId: string, reason: string, actor: string, s: Services) {
  const c = await IntakeCase.findById(caseId).lean<CaseDoc>();
  if (!c) throw notFound('Case');
  if (c.status !== 'scheduled') throw conflict('Only scheduled cases can be returned to the queue');
  const appts = await Appointment.find({ caseId: c._id, status: 'active' }).lean<AppointmentDoc[]>();
  await Appointment.updateMany({ caseId: c._id, status: 'active' }, { $set: { status: 'cancelled' } });
  await Promise.all(appts.map((a) => s.calendar.remove(a).catch(() => undefined)));
  if (c.assignedTherapistId) await Therapist.updateOne({ _id: c.assignedTherapistId }, { $inc: { scheduleVersion: 1 } });

  const status = deriveStatus({ ...c, status: 'pending-documents' });
  await IntakeCase.updateOne(
    { _id: c._id },
    {
      $set: { status, assignedTherapistId: null, assignedTherapistName: null, scheduledAt: null },
      $push: { events: event(actor, 'unscheduled', `Returned to queue: ${reason}`, s.now()) },
    },
  );
}
