import type { DayRoute } from '@seeds/shared';
import { Appointment, fromPoint, type AppointmentDoc, type TherapistDoc } from '../db/models.ts';
import { buildDayRoute } from '../core/route.ts';
import { dayOfWeek } from '../core/dates.ts';
import type { Services } from '../context.ts';
import { therapistName } from './mappers.ts';

/** A therapist's itinerary for one date: ordered stops with drive legs (Azure Maps when configured). */
export async function therapistDayRoute(t: TherapistDoc, date: string, s: Services): Promise<DayRoute> {
  const day = dayOfWeek(date);
  const appts = await Appointment.find({ therapistId: t._id, status: 'active', day, startsOn: { $lte: date } }).lean<AppointmentDoc[]>();
  const visits = appts
    .filter((a) => !a.endsOn || a.endsOn >= date)
    .map((a) => ({ id: a._id.toString(), start: a.start, end: a.end, location: fromPoint(a.location?.point), label: a.location?.label ?? 'Telehealth', appt: a }));
  const home = fromPoint(t.homeBase.point)!;
  const estimator =
    s.travel.source === 'azure-maps' ? await s.travel.refine([home, ...visits.flatMap((v) => (v.location ? [v.location] : []))]) : s.travel.screening;
  const route = buildDayRoute(home, 'Home base', visits, estimator);
  return {
    therapistId: t._id.toString(),
    therapistName: therapistName(t),
    date,
    day,
    stops: route.legs.map((l) => ({
      appointmentId: l.visit.id,
      start: l.visit.start,
      end: l.visit.end,
      label: l.visit.label,
      setting: l.visit.appt.setting,
      referenceCode: l.visit.appt.referenceCode,
      childLabel: l.visit.appt.childLabel,
      fromLabel: l.fromLabel,
      driveMinutes: l.driveMinutes,
      driveMiles: l.driveMiles,
    })),
    returnHomeMinutes: route.returnHomeMinutes,
    totalDriveMinutes: route.totalDriveMinutes,
    totalDriveMiles: route.totalDriveMiles,
    travelSource: s.travel.source,
  };
}
