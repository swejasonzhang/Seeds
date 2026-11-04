import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  CHECKLIST_ITEMS,
  DISCIPLINES,
  FUNDING_SOURCES,
  SETTINGS,
  STATUS_LABEL,
  addressSchema,
  requiredChecklist,
  weeklyWindowSchema,
  type CaseDetail,
  type CaseStatus,
  type Paged,
  type QueueItem,
} from '@seeds/shared';
import { Appointment, CaseDocument, Child, IntakeCase, toPoint, type AppointmentDoc, type CaseDoc, type ChildDoc, type DocumentDoc } from '../db/models.ts';
import { buildJourney, refreshCaseStatus, setStep } from '../services/journey.ts';
import { toDocumentDto } from './portal.ts';
import { assessPriority, deriveStatus } from '../core/policies.ts';
import { addDays } from '../core/dates.ts';
import { today, type Services } from '../context.ts';
import { conflict, HttpError, notFound } from '../errors.ts';
import { event, toAppointmentDto, toEventDto, toQueueItem } from '../services/mappers.ts';
import { bookCase, matchForCase, unscheduleCase } from '../services/scheduling.ts';

const WAITING: CaseStatus[] = ['needs-review', 'pending-documents', 'ready'];
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), 'Invalid id');

const queueQuery = z.object({
  status: z.string().optional(),
  discipline: z.enum(DISCIPLINES).optional(),
  q: z.string().trim().max(80).optional(),
  sla: z.enum(['at-risk', 'breached']).optional(),
  missing: z.enum(CHECKLIST_ITEMS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function caseRoutes(s: Services, requireCoordinator: express.RequestHandler) {
  const r = express.Router();
  const actor = (req: express.Request) => req.user?.name ?? 'Staff';

  async function loadCase(id: unknown) {
    const c = await IntakeCase.findById(objectId.parse(id)).lean<CaseDoc>();
    if (!c) throw notFound('Case');
    return c;
  }

  const refreshStatus = (id: mongoose.Types.ObjectId) => refreshCaseStatus(id, s.now());

  // ----- queue -----

  r.get('/queue', async (req, res) => {
    const p = queueQuery.parse(req.query);
    const statuses = p.status ? (p.status.split(',') as CaseStatus[]) : WAITING;
    const filter: Record<string, unknown> = { status: { $in: statuses } };
    if (p.discipline) filter.discipline = p.discipline;
    if (p.q) filter.searchKey = { $regex: escapeRegex(p.q.toLowerCase()) };
    const t = today(s);
    if (p.sla === 'breached') filter.targetStartBy = { $lt: t };
    if (p.sla === 'at-risk') filter.targetStartBy = { $gte: t, $lte: addDays(t, s.config.priority.atRiskWithinDays) };
    if (p.missing) {
      filter.completedChecklist = { $ne: p.missing };
      filter.fundingSource = { $in: FUNDING_SOURCES.filter((f) => requiredChecklist(f).includes(p.missing!)) };
    }

    const [docs, total] = await Promise.all([
      IntakeCase.find(filter, { events: 0, concerns: 0, insurance: 0 })
        .sort({ queueSortKey: 1, _id: 1 })
        .skip((p.page - 1) * p.pageSize)
        .limit(p.pageSize)
        .lean<CaseDoc[]>(),
      IntakeCase.countDocuments(filter),
    ]);
    const now = s.now();
    const body: Paged<QueueItem> = { items: docs.map((d) => toQueueItem(d, now, t)), total, page: p.page, pageSize: p.pageSize };
    res.json(body);
  });

  r.get('/queue/counts', async (req, res) => {
    const discipline = z.enum(DISCIPLINES).optional().parse(req.query.discipline);
    const match = discipline ? { discipline } : {};
    const rows = await IntakeCase.aggregate<{ _id: CaseStatus; n: number }>([{ $match: match }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    res.json({ counts: Object.fromEntries(rows.map((x) => [x._id, x.n])) });
  });

  // ----- case detail -----

  r.get('/cases/:id', async (req, res) => {
    const c = await loadCase(req.params.id);
    const [child, appts, siblings, docs] = await Promise.all([
      Child.findById(c.childId).lean<ChildDoc>(),
      Appointment.find({ caseId: c._id, status: 'active' }).sort({ day: 1, start: 1 }).lean<AppointmentDoc[]>(),
      c.householdKey
        ? IntakeCase.find({ householdKey: c.householdKey, _id: { $ne: c._id } }, { referenceCode: 1, childName: 1, discipline: 1, status: 1, assignedTherapistName: 1 }).lean<CaseDoc[]>()
        : Promise.resolve([] as CaseDoc[]),
      CaseDocument.find({ caseId: c._id }).sort({ createdAt: -1 }).lean<DocumentDoc[]>(),
    ]);
    if (!child) throw notFound('Client');
    const t = today(s);
    const body: CaseDetail = {
      ...toQueueItem(c, s.now(), t),
      child: {
        firstName: child.firstName,
        lastName: child.lastName,
        dateOfBirth: child.dateOfBirth,
        preferredLanguage: child.preferredLanguage,
        address: { line1: child.address.line1 ?? '', city: child.address.city ?? '', state: child.address.state ?? '', postalCode: child.address.postalCode ?? '' },
        geocodePrecision: child.geocodePrecision ?? undefined,
      },
      guardians: child.guardians.map((g) => ({
        firstName: g.firstName ?? '',
        lastName: g.lastName ?? '',
        relationship: g.relationship ?? '',
        phone: g.phone ?? '',
        email: g.email ?? undefined,
        isPrimary: Boolean(g.isPrimary),
      })),
      concerns: c.concerns ?? '',
      urgentConcern: c.urgentConcern,
      referralSource: c.referralSource,
      referringProvider: c.referringProvider ?? undefined,
      insurance: c.insurance?.payer || c.insurance?.memberId ? { payer: c.insurance.payer ?? undefined, memberId: c.insurance.memberId ?? undefined } : undefined,
      acceptsTelehealth: c.acceptsTelehealth,
      sessionLocationLabel: c.sessionLocation?.label ?? undefined,
      sessionLocated: Boolean(c.sessionLocation?.point?.coordinates?.length) || c.preferredSetting === 'telehealth',
      availability: c.availability.map((w) => ({ day: w.day!, start: w.start!, end: w.end! })),
      sessionsPerWeek: c.sessionsPerWeek,
      sessionMinutes: c.sessionMinutes,
      requiredChecklist: requiredChecklist(c.fundingSource),
      completedChecklist: c.completedChecklist,
      consent: c.consent?.signedBy ? { signedBy: c.consent.signedBy, signedAt: (c.consent.signedAt ?? c.receivedAt).toISOString() } : undefined,
      appointments: appts.map(toAppointmentDto),
      journey: buildJourney(c),
      documents: docs.map(toDocumentDto),
      events: [...c.events].reverse().map(toEventDto),
      siblings: siblings.map((x) => ({
        id: x._id.toString(),
        referenceCode: x.referenceCode,
        childName: x.childName,
        discipline: x.discipline,
        status: x.status,
        therapistName: x.assignedTherapistName ?? undefined,
      })),
    };
    res.json(body);
  });

  // ----- paperwork checklist: completing it auto-advances the case into the matching queue -----

  r.patch('/cases/:id/checklist', requireCoordinator, async (req, res) => {
    const body = z.object({ item: z.enum(CHECKLIST_ITEMS), completed: z.boolean(), note: z.string().trim().max(300).optional() }).parse(req.body);
    const c = await loadCase(req.params.id);
    await setStep(c._id, body.item, body.completed, actor(req), s.now(), body.note);
    res.status(204).end();
  });

  // ----- care plan / family preferences -----

  r.patch('/cases/:id/plan', requireCoordinator, async (req, res) => {
    const body = z
      .object({
        sessionsPerWeek: z.number().int().min(1).max(3).optional(),
        sessionMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]).optional(),
        urgentConcern: z.boolean().optional(),
        preferredSetting: z.enum(SETTINGS).exclude(['community']).optional(),
        acceptsTelehealth: z.boolean().optional(),
        availability: z.array(weeklyWindowSchema).min(1).max(42).optional(),
      })
      .parse(req.body);
    const c = await loadCase(req.params.id);
    if (c.status === 'scheduled') throw conflict('Return the case to the queue before changing its plan');

    const set: Record<string, unknown> = { ...body };
    const changes: string[] = Object.keys(body);
    if (body.preferredSetting && body.preferredSetting !== c.preferredSetting) {
      const child = await Child.findById(c.childId).lean<ChildDoc>();
      set.sessionLocation =
        body.preferredSetting === 'home'
          ? { label: child?.address.city ?? c.town, point: child?.location ?? undefined }
          : body.preferredSetting === 'clinic'
            ? { label: s.config.matching.clinicLabel, point: toPoint(s.config.matching.clinic) }
            : undefined;
    }
    if (body.urgentConcern !== undefined && body.urgentConcern !== c.urgentConcern) {
      // Re-score from the original received date, so the case keeps the wait it has already accrued.
      const p = assessPriority(
        {
          receivedAt: c.receivedAt,
          receivedDate: c.receivedAt.toISOString().slice(0, 10),
          dateOfBirth: c.childDob,
          fundingSource: c.fundingSource,
          urgentConcern: body.urgentConcern,
          siblingActive: c.priorityFactors.includes('sibling-active'),
        },
        s.config.priority,
      );
      Object.assign(set, { queueSortKey: p.queueSortKey, priorityBoostDays: p.boostDays, priorityFactors: p.factors });
    }
    await IntakeCase.updateOne({ _id: c._id }, { $set: set, $push: { events: event(actor(req), 'plan', `Updated ${changes.join(', ')}`, s.now()) } });
    res.status(204).end();
  });

  // ----- resolve a "needs review" flag, optionally with a corrected address -----

  r.post('/cases/:id/resolve-review', requireCoordinator, async (req, res) => {
    const body = z.object({ address: addressSchema.optional(), note: z.string().max(500).optional() }).parse(req.body);
    const c = await loadCase(req.params.id);
    const set: Record<string, unknown> = { reviewReason: null };
    if (body.address) {
      const hit = await s.geocoder.geocode(body.address);
      if (!hit) throw new HttpError(422, 'Still could not locate that address. Check the street and ZIP code.', 'unprocessable');
      await Child.updateOne({ _id: c.childId }, { $set: { address: body.address, location: toPoint(hit.point), geocodePrecision: hit.precision } });
      if (c.preferredSetting === 'home') set.sessionLocation = { label: body.address.city, point: toPoint(hit.point) };
      set.town = body.address.city;
    }
    await IntakeCase.updateOne(
      { _id: c._id },
      { $set: set, $push: { events: event(actor(req), 'review', `Review resolved${body.address ? ' (address corrected)' : ''}${body.note ? `: ${body.note}` : ''}`, s.now()) } },
    );
    await refreshStatus(c._id);
    res.status(204).end();
  });

  // ----- manual status: hold, close/discharge, resume -----

  r.post('/cases/:id/status', requireCoordinator, async (req, res) => {
    const body = z.object({ status: z.enum(['on-hold', 'closed', 'ready']), note: z.string().trim().max(500).optional() }).parse(req.body);
    const c = await loadCase(req.params.id);
    const who = actor(req);
    if (body.status === 'on-hold' && c.status === 'scheduled') throw conflict('Return the case to the queue before putting it on hold');
    if (body.status === 'closed' && c.status === 'scheduled') {
      await unscheduleCase(c._id.toString(), body.note ?? 'Discharged', who, s);
    }
    const status: CaseStatus = body.status === 'ready' ? deriveStatus({ ...c, status: 'pending-documents' }) : body.status;
    await IntakeCase.updateOne(
      { _id: c._id },
      { $set: { status }, $push: { events: event(who, 'status', `${STATUS_LABEL[c.status]} → ${STATUS_LABEL[status]}${body.note ? `: ${body.note}` : ''}`, s.now()) } },
    );
    res.status(204).end();
  });

  // ----- matching & booking -----

  r.get('/cases/:id/matches', async (req, res) => {
    res.json(await matchForCase(objectId.parse(req.params.id), s));
  });

  const bookBody = z.object({
    therapistId: objectId,
    setting: z.enum(SETTINGS),
    slots: z.array(z.object({ day: z.number().int().min(0).max(6), start: z.number().int().min(0).max(1440) })).min(1).max(3),
  });

  r.post('/cases/:id/book', requireCoordinator, async (req, res) => {
    const appts = await bookCase(objectId.parse(req.params.id), bookBody.parse(req.body), actor(req), s);
    res.status(201).json({ appointments: appts.map(toAppointmentDto) });
  });

  r.post('/cases/:id/unschedule', requireCoordinator, async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(2).max(300) }).parse(req.body);
    await unscheduleCase(objectId.parse(req.params.id), reason, actor(req), s);
    res.status(204).end();
  });

  return { router: r, bookBody };
}
