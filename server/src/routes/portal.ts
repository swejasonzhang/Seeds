import express from 'express';
import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { z } from 'zod';
import {
  DAY_SHORT,
  DOCUMENT_COMPLETES,
  DOCUMENT_KINDS,
  STATUS_LABEL,
  formatMinute,
  journeyFor,
  stepDef,
  weeklyWindowSchema,
  type CaseStatus,
  type CaseloadItemDto,
  type DemoPersonasDto,
  type DocumentDto,
  type FamilyPortalDto,
  type FundingSource,
  type TherapistPortalDto,
} from '@seeds/shared';
import {
  Appointment,
  CaseDocument,
  Child,
  IntakeCase,
  Therapist,
  documentBucket,
  type AppointmentDoc,
  type CaseDoc,
  type ChildDoc,
  type DocumentDoc,
  type TherapistDoc,
} from '../db/models.ts';
import { ageInMonths } from '../core/dates.ts';
import { today, type Services } from '../context.ts';
import { conflict, HttpError, notFound } from '../errors.ts';
import { isStaff } from '../auth.ts';
import { buildJourney, setStep } from '../services/journey.ts';
import { toAppointmentDto, toTherapistSummary, therapistName } from '../services/mappers.ts';
import { therapistDayRoute } from '../services/dayRoute.ts';

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), 'Invalid id');
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];

export const toDocumentDto = (d: DocumentDoc): DocumentDto => ({
  id: d._id.toString(),
  kind: d.kind,
  filename: d.filename,
  contentType: d.contentType,
  size: d.size,
  uploadedAt: d.createdAt.toISOString(),
  uploadedBy: d.uploadedBy,
});

async function docsByCase(caseIds: mongoose.Types.ObjectId[]) {
  const docs = await CaseDocument.find({ caseId: { $in: caseIds } }).sort({ createdAt: -1 }).lean<DocumentDoc[]>();
  const map = new Map<string, DocumentDto[]>();
  for (const d of docs) map.set(d.caseId.toString(), [...(map.get(d.caseId.toString()) ?? []), toDocumentDto(d)]);
  return map;
}

// ======================================================================
// Family portal: the parent's view of every child, checklist and session
// ======================================================================

export function familyRoutes(s: Services) {
  const r = express.Router();

  async function ownCase(req: express.Request) {
    const c = await IntakeCase.findOne({ _id: objectId.parse(req.params.id), householdKey: req.user!.familyKey }).lean<CaseDoc>();
    if (!c) throw notFound('Case');
    return c;
  }

  r.get('/', async (req, res) => {
    const key = req.user!.familyKey!;
    const [children, cases] = await Promise.all([
      Child.find({ householdKey: key }).sort({ dateOfBirth: 1 }).lean<ChildDoc[]>(),
      IntakeCase.find({ householdKey: key, status: { $ne: 'closed' } }).sort({ receivedAt: -1 }).lean<CaseDoc[]>(),
    ]);
    const caseIds = cases.map((c) => c._id);
    const [appts, docs] = await Promise.all([
      Appointment.find({ caseId: { $in: caseIds }, status: 'active' }).sort({ day: 1, start: 1 }).lean<AppointmentDoc[]>(),
      docsByCase(caseIds),
    ]);
    const therapistIds = [...new Set(cases.flatMap((c) => (c.assignedTherapistId ? [c.assignedTherapistId.toString()] : [])))];
    const therapists = await Therapist.find({ _id: { $in: therapistIds } }, { firstName: 1, lastName: 1, credential: 1, languages: 1 }).lean<TherapistDoc[]>();
    const t = today(s);

    const body: FamilyPortalDto = {
      guardianName: req.user!.name,
      familyKey: key,
      children: children.map((ch) => ({
        id: ch._id.toString(),
        firstName: ch.firstName,
        lastName: ch.lastName,
        ageMonths: ageInMonths(ch.dateOfBirth, t),
        cases: cases
          .filter((c) => c.childId.equals(ch._id))
          .map((c) => {
            const th = therapists.find((x) => c.assignedTherapistId?.equals(x._id));
            return {
              id: c._id.toString(),
              referenceCode: c.referenceCode,
              discipline: c.discipline,
              status: c.status,
              receivedAt: c.receivedAt.toISOString(),
              fundingSource: c.fundingSource,
              preferredSetting: c.preferredSetting,
              targetStartBy: c.targetStartBy,
              journey: buildJourney(c),
              therapist: th ? { name: therapistName(th), languages: th.languages } : undefined,
              sessions: appts
                .filter((a) => a.caseId.equals(c._id))
                .map((a) => ({ day: a.day, start: a.start, end: a.end, startsOn: a.startsOn, setting: a.setting, locationLabel: a.location?.label ?? 'Telehealth' })),
              documents: docs.get(c._id.toString()) ?? [],
            };
          }),
      })),
    };
    res.json(body);
  });

  // Parents sign (HIPAA, office policy) and report district progress we can't see from here.
  r.post('/cases/:id/steps/:step', async (req, res) => {
    const c = await ownCase(req);
    const step = z.string().parse(req.params.step);
    const inJourney = journeyFor(c.fundingSource).flatMap((p) => p.steps).find((x) => x === step);
    if (!inJourney) throw new HttpError(400, 'That step does not apply to this child', 'bad_request');
    const def = stepDef(inJourney, c.fundingSource);
    if (def.familyAction !== 'sign' && def.familyAction !== 'confirm') throw new HttpError(400, 'Upload a document to complete this step', 'bad_request');
    const body = z.object({ signatureName: z.string().trim().min(2).optional(), note: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    if (def.familyAction === 'sign' && !body.signatureName) throw new HttpError(400, 'Type your full name to sign', 'bad_request');
    const note = def.familyAction === 'sign' ? `e-signed by "${body.signatureName}"` : body.note;
    await setStep(c._id, inJourney, true, `${req.user!.name} (parent)`, s.now(), note);
    res.status(204).end();
  });

  r.post('/cases/:id/documents', express.json({ limit: '8mb' }), async (req, res) => {
    const c = await ownCase(req);
    const body = z
      .object({
        kind: z.enum(DOCUMENT_KINDS),
        filename: z.string().trim().min(1).max(160),
        contentType: z.string().refine((t) => ALLOWED_TYPES.includes(t), 'Upload a PDF or a photo (JPG, PNG, HEIC)'),
        dataBase64: z.string().min(1),
      })
      .parse(req.body);
    const bytes = Buffer.from(body.dataBase64, 'base64');
    if (bytes.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Files must be 5 MB or smaller', 'too_large');

    const fileId = new mongoose.Types.ObjectId();
    await new Promise<void>((resolve, reject) =>
      Readable.from(bytes)
        .pipe(documentBucket().openUploadStreamWithId(fileId, body.filename, { metadata: { caseId: c._id, contentType: body.contentType } }))
        .on('finish', () => resolve())
        .on('error', reject),
    );
    const doc = await CaseDocument.create({
      caseId: c._id,
      householdKey: c.householdKey ?? '',
      kind: body.kind,
      filename: body.filename.replace(/[^\w.\- ()]/g, '_'),
      contentType: body.contentType,
      size: bytes.length,
      fileId,
      uploadedBy: `${req.user!.name} (parent)`,
    });
    const completes = DOCUMENT_COMPLETES[body.kind];
    if (completes && journeyFor(c.fundingSource).some((p) => p.steps.includes(completes))) {
      await setStep(c._id, completes, true, `${req.user!.name} (parent)`, s.now(), `uploaded ${doc.filename}`);
    }
    res.status(201).json(toDocumentDto(doc.toObject() as DocumentDoc));
  });

  return r;
}

// ======================================================================
// Therapist portal: my week, my route, my caseload, my availability
// ======================================================================

export function therapistPortalRoutes(s: Services) {
  const r = express.Router();
  const me = async (req: express.Request) => {
    const t = req.user!.therapistId ? await Therapist.findById(req.user!.therapistId).lean<TherapistDoc>() : null;
    if (!t) throw new HttpError(403, 'No therapist profile is linked to this account', 'forbidden');
    return t;
  };

  r.get('/', async (req, res) => {
    const t = await me(req);
    const appts = await Appointment.find({ therapistId: t._id, status: 'active' }).sort({ day: 1, start: 1 }).lean<AppointmentDoc[]>();
    const caseIds = [...new Set(appts.map((a) => a.caseId.toString()))].map((id) => new mongoose.Types.ObjectId(id));
    const [cases, docs] = await Promise.all([IntakeCase.find({ _id: { $in: caseIds } }).lean<CaseDoc[]>(), docsByCase(caseIds)]);
    const children = await Child.find({ _id: { $in: cases.map((c) => c.childId) } }).lean<ChildDoc[]>();
    const dto = appts.map(toAppointmentDto);
    const now = today(s);

    const caseload: CaseloadItemDto[] = cases.map((c) => {
      const child = children.find((x) => x._id.equals(c.childId));
      const g = child?.guardians.find((x) => x.isPrimary) ?? child?.guardians[0];
      const j = buildJourney(c);
      return {
        caseId: c._id.toString(),
        referenceCode: c.referenceCode,
        childName: c.childName,
        ageMonths: ageInMonths(c.childDob, now),
        discipline: c.discipline,
        preferredLanguage: c.preferredLanguage ?? 'English',
        setting: c.preferredSetting,
        locationLabel: c.sessionLocation?.label ?? c.town ?? '',
        homeAddress: child ? `${child.address.line1}, ${child.address.city}, ${child.address.state} ${child.address.postalCode}` : '',
        guardian: { name: g ? `${g.firstName} ${g.lastName}` : '', relationship: g?.relationship ?? '', phone: g?.phone ?? '', email: g?.email ?? undefined },
        concerns: c.concerns ?? '',
        urgentConcern: c.urgentConcern,
        fundingSource: c.fundingSource,
        sessions: dto.filter((a) => a.caseId === c._id.toString()),
        journey: { done: j.done, total: j.total },
        documents: docs.get(c._id.toString()) ?? [],
      };
    });
    caseload.sort((a, b) => (a.sessions[0]?.day ?? 9) - (b.sessions[0]?.day ?? 9) || (a.sessions[0]?.start ?? 0) - (b.sessions[0]?.start ?? 0));

    const body: TherapistPortalDto = {
      therapist: { ...toTherapistSummary(t, appts.length, 0), email: t.email, appointments: dto },
      caseload,
    };
    res.json(body);
  });

  r.get('/route', async (req, res) => {
    const t = await me(req);
    const date = z.iso.date().optional().parse(req.query.date) ?? today(s);
    res.json(await therapistDayRoute(t, date, s));
  });

  // Therapists own their availability. Shrinking it under booked sessions is refused, so nothing silently breaks.
  r.put('/availability', async (req, res) => {
    const t = await me(req);
    const { availability } = z.object({ availability: z.array(weeklyWindowSchema).max(42) }).parse(req.body);
    const appts = await Appointment.find({ therapistId: t._id, status: 'active' }, { day: 1, start: 1, end: 1, childLabel: 1 }).lean<AppointmentDoc[]>();
    const outside = appts.filter((a) => !availability.some((w) => w.day === a.day && w.start <= a.start && w.end >= a.end));
    if (outside.length) {
      const list = outside.map((a) => `${DAY_SHORT[a.day]} ${formatMinute(a.start)} (${a.childLabel})`).join(', ');
      throw conflict(`These booked sessions fall outside the new hours: ${list}. Ask the front desk to move them first.`);
    }
    await Therapist.updateOne({ _id: t._id }, { $set: { availability }, $inc: { scheduleVersion: 1 } });
    res.status(204).end();
  });

  return r;
}

// ======================================================================
// Documents: parents of the household, the assigned therapist, and staff
// ======================================================================

export function documentRoutes() {
  const r = express.Router();
  r.get('/documents/:id', async (req, res) => {
    const doc = await CaseDocument.findById(objectId.parse(req.params.id)).lean<DocumentDoc>();
    if (!doc) throw notFound('Document');
    const u = req.user!;
    let allowed = isStaff(u) || (u.roles.includes('parent') && u.familyKey === doc.householdKey);
    if (!allowed && u.therapistId) {
      allowed = Boolean(await Appointment.exists({ caseId: doc.caseId, therapistId: u.therapistId, status: 'active' }));
    }
    if (!allowed) throw new HttpError(403, 'You do not have access to this document', 'forbidden');
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.filename.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    documentBucket().openDownloadStream(doc.fileId).on('error', () => res.status(404).end()).pipe(res);
  });
  return r;
}

// ======================================================================
// Demo sign-in: pick a parent, therapist or front-desk persona
// ======================================================================

export function demoRoutes() {
  const r = express.Router();
  r.get('/demo/personas', async (_req, res) => {
    const therapists = await Therapist.find({ active: true }, { firstName: 1, lastName: 1, credential: 1, discipline: 1, homeBase: 1 }).sort({ discipline: 1, lastName: 1 }).lean<TherapistDoc[]>();
    // A spread of families at different points in the journey.
    const wanted: CaseStatus[] = ['pending-documents', 'ready', 'scheduled', 'needs-review'];
    const sample: CaseDoc[] = [];
    for (const status of wanted) {
      for (const funding of ['cse', 'cpse', 'insurance', 'private'] as FundingSource[]) {
        const c = await IntakeCase.findOne({ status, fundingSource: funding }, { householdKey: 1, childName: 1, status: 1, fundingSource: 1, discipline: 1 })
          .sort({ receivedAt: -1 })
          .lean<CaseDoc>();
        if (c && !sample.some((x) => x.householdKey === c.householdKey)) sample.push(c);
      }
    }
    const recent = await IntakeCase.find({ events: { $elemMatch: { actor: 'Family (online intake)', message: { $not: /demo data/ } } } }, { householdKey: 1, childName: 1, status: 1, fundingSource: 1 })
      .sort({ receivedAt: -1 })
      .limit(3)
      .lean<CaseDoc[]>();
    const families = [...recent, ...sample].filter((c, i, all) => all.findIndex((x) => x.householdKey === c.householdKey) === i).slice(0, 10);
    const guardians = await Child.find({ householdKey: { $in: families.map((f) => f.householdKey ?? '') } }, { householdKey: 1, guardians: 1 }).lean<ChildDoc[]>();

    const body: DemoPersonasDto = {
      admin: { kind: 'admin', key: 'admin', name: 'Front desk / intake coordinator', subtitle: 'Sees every family, checklist and therapist' },
      therapists: therapists.map((t) => ({
        kind: 'therapist',
        key: `therapist:${t._id}`,
        name: therapistName(t),
        subtitle: `${t.discipline === 'speech' ? 'Speech' : 'OT'} · based in ${t.homeBase.label}`,
      })),
      families: families.map((f) => {
        const g = guardians.find((x) => x.householdKey === f.householdKey)?.guardians[0];
        return {
          kind: 'parent',
          key: `parent:${f.householdKey}`,
          name: g ? `${g.firstName} ${g.lastName}` : 'Family',
          subtitle: `Parent of ${f.childName.split(' ')[0]} · ${STATUS_LABEL[f.status]} · ${f.fundingSource.toUpperCase()}`,
        };
      }),
    };
    res.json(body);
  });
  return r;
}
