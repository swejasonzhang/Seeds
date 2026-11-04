import type { AppointmentDto, QueueItem, TherapistSummary, CaseEventDto, CalendarSyncState, SessionSetting } from '@seeds/shared';
import type { AppointmentDoc, CaseDoc, TherapistDoc } from '../db/models.ts';
import { ageInMonths, wholeDaysSince } from '../core/dates.ts';
import { missingChecklist, slaState } from '../core/policies.ts';

export const childLabel = (first: string, last: string) => `${first.trim()[0] ?? '?'}.${last.trim()[0] ?? '?'}.`;

export function toQueueItem(c: CaseDoc, now: Date, today: string): QueueItem {
  return {
    id: c._id.toString(),
    referenceCode: c.referenceCode,
    childName: c.childName,
    ageMonths: ageInMonths(c.childDob, today),
    discipline: c.discipline,
    status: c.status,
    reviewReason: c.reviewReason ?? undefined,
    receivedAt: c.receivedAt.toISOString(),
    effectiveWaitDays: wholeDaysSince(c.queueSortKey, now),
    waitDays: wholeDaysSince(c.receivedAt, now),
    priorityFactors: c.priorityFactors,
    targetStartBy: c.targetStartBy,
    sla: slaState(c.targetStartBy, today, c.status),
    town: c.town ?? '',
    preferredSetting: c.preferredSetting,
    fundingSource: c.fundingSource,
    missingChecklist: missingChecklist(c.fundingSource, c.completedChecklist),
    assignedTherapistName: c.assignedTherapistName ?? undefined,
  };
}

export function toAppointmentDto(a: AppointmentDoc): AppointmentDto {
  return {
    id: a._id.toString(),
    caseId: a.caseId.toString(),
    referenceCode: a.referenceCode,
    childLabel: a.childLabel,
    therapistId: a.therapistId.toString(),
    therapistName: a.therapistName,
    day: a.day,
    start: a.start,
    end: a.end,
    startsOn: a.startsOn,
    setting: a.setting as SessionSetting,
    locationLabel: a.location?.label ?? (a.setting === 'telehealth' ? 'Telehealth' : ''),
    calendarSync: (a.calendar?.state ?? 'not-configured') as CalendarSyncState,
  };
}

export function toEventDto(e: { at?: Date | null; actor?: string | null; kind?: string | null; message?: string | null }): CaseEventDto {
  return { at: (e.at ?? new Date(0)).toISOString(), actor: e.actor ?? '', kind: e.kind ?? '', message: e.message ?? '' };
}

export function therapistName(t: Pick<TherapistDoc, 'firstName' | 'lastName' | 'credential'>) {
  return `${t.firstName} ${t.lastName}, ${t.credential}`;
}

export function toTherapistSummary(t: TherapistDoc, sessionsBooked: number, weeklyDriveMinutes: number): TherapistSummary {
  return {
    id: t._id.toString(),
    name: therapistName(t),
    credential: t.credential,
    discipline: t.discipline,
    homeBaseLabel: t.homeBase.label ?? '',
    settings: t.settings as SessionSetting[],
    languages: t.languages,
    weeklyCapacity: t.weeklyCapacity,
    sessionsBooked,
    maxOneWayTravelMinutes: t.maxOneWayTravelMinutes,
    availability: t.availability.map((w) => ({ day: w.day!, start: w.start!, end: w.end! })),
    active: t.active,
    weeklyDriveMinutes,
  };
}

export const event = (actor: string, kind: string, message: string, at = new Date()) => ({ at, actor, kind, message });
