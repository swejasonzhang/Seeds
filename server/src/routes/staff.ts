import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  DISCIPLINES,
  SETTINGS,
  weeklyWindowSchema,
  type CaseStatus,
  type DashboardDto,
  type Discipline,
  type TherapistDetail,
} from '@seeds/shared';
import { Appointment, IntakeCase, Therapist, fromPoint, type AppointmentDoc, type CaseDoc, type TherapistDoc } from '../db/models.ts';
import { buildDayRoute } from '../core/route.ts';
import { addDays, isoDateInZone } from '../core/dates.ts';
import { today, type Services } from '../context.ts';
import { notFound } from '../errors.ts';
import { toAppointmentDto, toTherapistSummary } from '../services/mappers.ts';
import { autoMatch, bookCase } from '../services/scheduling.ts';
import { therapistDayRoute } from '../services/dayRoute.ts';
import type { TravelEstimator } from '../core/travel.ts';

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), 'Invalid id');

function weeklyDriveMinutes(t: TherapistDoc, appts: AppointmentDoc[], travel: TravelEstimator) {
  const home = fromPoint(t.homeBase.point)!;
  let total = 0;
  for (let day = 0; day < 7; day++) {
    const visits = appts
      .filter((a) => a.day === day)
      .map((a) => ({ id: a._id.toString(), start: a.start, end: a.end, location: fromPoint(a.location?.point), label: a.location?.label ?? '' }));
    if (visits.length) total += buildDayRoute(home, 'Home base', visits, travel).totalDriveMinutes;
  }
  return total;
}

export function staffRoutes(
  s: Services,
  guards: { requireCoordinator: express.RequestHandler; requireAdmin: express.RequestHandler },
  bookBody: z.ZodType<Parameters<typeof bookCase>[1]>,
) {
  const r = express.Router();


  // ----- whole-queue auto-match: propose a schedule for the top N waiting children in one click -----

  r.post('/queue/auto-match', guards.requireCoordinator, async (req, res) => {
    const body = z.object({ discipline: z.enum(DISCIPLINES).optional(), limit: z.number().int().min(1).max(200).default(50) }).parse(req.body ?? {});
    res.json(await autoMatch(body, s));
  });

  r.post('/queue/auto-match/confirm', guards.requireCoordinator, async (req, res) => {
    const { bookings } = z
      .object({ bookings: z.array(z.intersection(z.object({ caseId: objectId }), bookBody)).min(1).max(200) })
      .parse(req.body);
    const results = [];
    // Sequential on purpose: each booking re-validates against the schedule the previous one just changed.
    for (const b of bookings) {
      try {
        await bookCase(b.caseId, b, req.user!.name, s);
        results.push({ caseId: b.caseId, ok: true });
      } catch (err) {
        results.push({ caseId: b.caseId, ok: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    }
    res.json({ results });
  });

  // ----- therapists -----

  r.get('/therapists', async (req, res) => {
    const discipline = z.enum(DISCIPLINES).optional().parse(req.query.discipline);
    const therapists = await Therapist.find(discipline ? { discipline } : {}).sort({ discipline: 1, lastName: 1 }).lean<TherapistDoc[]>();
    const appts = await Appointment.find({ status: 'active', therapistId: { $in: therapists.map((t) => t._id) } }, { therapistId: 1, day: 1, start: 1, end: 1, location: 1 }).lean<AppointmentDoc[]>();
    res.json(
      therapists.map((t) => {
        const mine = appts.filter((a) => a.therapistId.equals(t._id));
        return toTherapistSummary(t, mine.length, weeklyDriveMinutes(t, mine, s.travel.screening));
      }),
    );
  });

  r.get('/therapists/:id', async (req, res) => {
    const t = await Therapist.findById(objectId.parse(req.params.id)).lean<TherapistDoc>();
    if (!t) throw notFound('Therapist');
    const appts = await Appointment.find({ therapistId: t._id, status: 'active' }).sort({ day: 1, start: 1 }).lean<AppointmentDoc[]>();
    const body: TherapistDetail = {
      ...toTherapistSummary(t, appts.length, weeklyDriveMinutes(t, appts, s.travel.screening)),
      email: t.email,
      appointments: appts.map(toAppointmentDto),
    };
    res.json(body);
  });

  r.patch('/therapists/:id', guards.requireAdmin, async (req, res) => {
    const body = z
      .object({
        weeklyCapacity: z.number().int().min(0).max(60).optional(),
        maxOneWayTravelMinutes: z.number().int().min(5).max(90).optional(),
        settings: z.array(z.enum(SETTINGS)).optional(),
        languages: z.array(z.string().trim().min(2).max(40)).max(10).optional(),
        availability: z.array(weeklyWindowSchema).max(42).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    // Availability/capacity changes alter what's bookable: bump the version so in-flight bookings re-validate.
    const result = await Therapist.updateOne({ _id: objectId.parse(req.params.id) }, { $set: body, $inc: { scheduleVersion: 1 } });
    if (result.matchedCount === 0) throw notFound('Therapist');
    res.status(204).end();
  });

  r.get('/therapists/:id/route', async (req, res) => {
    const t = await Therapist.findById(objectId.parse(req.params.id)).lean<TherapistDoc>();
    if (!t) throw notFound('Therapist');
    const date = z.iso.date().optional().parse(req.query.date) ?? today(s);
    res.json(await therapistDayRoute(t, date, s));
  });

  // ----- dashboard -----

  r.get('/dashboard', async (_req, res) => {
    const now = s.now();
    const t = today(s);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const waiting: CaseStatus[] = ['needs-review', 'pending-documents', 'ready'];

    const [statusRows, waitingDocs, scheduledLast7Days, intakesLast7Days, capacityRows, bookedRows, trendRows] = await Promise.all([
      IntakeCase.aggregate<{ _id: { status: string; discipline: Discipline }; n: number }>([
        { $group: { _id: { status: '$status', discipline: '$discipline' }, n: { $sum: 1 } } },
      ]),
      IntakeCase.find({ status: { $in: waiting } }, { status: 1, discipline: 1, receivedAt: 1, targetStartBy: 1 }).lean<CaseDoc[]>(),
      IntakeCase.countDocuments({ scheduledAt: { $gte: weekAgo } }),
      IntakeCase.countDocuments({ receivedAt: { $gte: weekAgo } }),
      Therapist.aggregate<{ _id: Discipline; capacity: number }>([{ $match: { active: true } }, { $group: { _id: '$discipline', capacity: { $sum: '$weeklyCapacity' } } }]),
      Appointment.aggregate<{ _id: Discipline; n: number }>([{ $match: { status: 'active' } }, { $group: { _id: '$discipline', n: { $sum: 1 } } }]),
      IntakeCase.aggregate<{ _id: string; n: number }>([
        { $match: { receivedAt: { $gte: new Date(now.getTime() - 30 * 86_400_000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$receivedAt', timezone: s.config.timeZone } }, n: { $sum: 1 } } },
      ]),
    ]);

    const count = (status: string, discipline?: Discipline) =>
      statusRows.filter((x) => x._id.status === status && (!discipline || x._id.discipline === discipline)).reduce((a, x) => a + x.n, 0);

    const waitOf = (d: Date) => Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    const readyWaits = waitingDocs.filter((c) => c.status === 'ready').map((c) => waitOf(c.receivedAt)).sort((a, b) => a - b);
    const median = readyWaits.length ? readyWaits[Math.floor(readyWaits.length / 2)]! : 0;
    const atRiskBy = addDays(t, s.config.priority.atRiskWithinDays);

    const buckets = [
      { label: '0–7 days', min: 0, max: 7 },
      { label: '8–14 days', min: 8, max: 14 },
      { label: '15–30 days', min: 15, max: 30 },
      { label: '31–60 days', min: 31, max: 60 },
      { label: '60+ days', min: 61, max: Infinity },
    ];

    const trendMap = new Map(trendRows.map((x) => [x._id, x.n]));
    const intakeTrend = Array.from({ length: 30 }, (_, i) => {
      const date = isoDateInZone(new Date(now.getTime() - (29 - i) * 86_400_000), s.config.timeZone);
      return { date, count: trendMap.get(date) ?? 0 };
    });

    const body: DashboardDto = {
      generatedAt: now.toISOString(),
      openCases: statusRows.filter((x) => x._id.status !== 'closed').reduce((a, x) => a + x.n, 0),
      readyToSchedule: count('ready'),
      pendingDocuments: count('pending-documents'),
      needsReview: count('needs-review'),
      scheduledLast7Days,
      intakesLast7Days,
      medianWaitDaysReady: median,
      oldestWaitDaysReady: readyWaits.at(-1) ?? 0,
      slaAtRisk: waitingDocs.filter((c) => c.targetStartBy >= t && c.targetStartBy <= atRiskBy).length,
      slaBreached: waitingDocs.filter((c) => c.targetStartBy < t).length,
      byDiscipline: DISCIPLINES.map((d) => ({
        discipline: d,
        ready: count('ready', d),
        pendingDocuments: count('pending-documents', d),
        needsReview: count('needs-review', d),
        scheduled: count('scheduled', d),
        booked: bookedRows.find((x) => x._id === d)?.n ?? 0,
        capacity: capacityRows.find((x) => x._id === d)?.capacity ?? 0,
      })),
      waitBuckets: buckets.map((b) => {
        const inBucket = waitingDocs.filter((c) => {
          const w = waitOf(c.receivedAt);
          return w >= b.min && w <= b.max;
        });
        return { label: b.label, speech: inBucket.filter((c) => c.discipline === 'speech').length, ot: inBucket.filter((c) => c.discipline === 'ot').length };
      }),
      intakeTrend,
    };
    res.json(body);
  });

  return r;
}
