// Fictional demo data for Nassau County. Every name, phone (555-01xx) and address here is made up.
import mongoose from 'mongoose';
import { DISCIPLINE_SHORT, journeyFor, requiredChecklist, type CaseStatus, type ChecklistItem, type Discipline, type FundingSource, type SessionSetting, type WeeklyWindow } from '@seeds/shared';
import { Appointment, CaseDocument, Child, IntakeCase, Meta, Therapist, toPoint } from '../db/models.ts';
import { ZIP_CENTROIDS } from '../services/zipCentroids.ts';
import { addDays, isoDateInZone, nextOccurrence } from '../core/dates.ts';
import { assessPriority } from '../core/policies.ts';
import { planQueue, type MatchRequest, type TherapistSchedule } from '../core/matching.ts';
import type { GeoPoint } from '../core/travel.ts';
import type { Services } from '../context.ts';
import { randomCode } from '../services/codes.ts';
import { childLabel } from '../services/mappers.ts';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const H = (h: number, m = 0) => h * 60 + m;
const weekdays = (days: number[], start: number, end: number): WeeklyWindow[] => days.map((day) => ({ day, start, end }));

const THERAPISTS: Array<{
  first: string; last: string; discipline: Discipline; credential: string; zip: string; cap: number; range: number;
  settings: SessionSetting[]; languages: string[]; availability: WeeklyWindow[];
}> = [
  { first: 'Dana', last: 'Whitfield', discipline: 'speech', credential: 'CCC-SLP', zip: '11501', cap: 24, range: 30, settings: ['home', 'community', 'telehealth'], languages: ['English', 'Spanish'], availability: weekdays([1, 2, 3, 4, 5], H(8, 30), H(16, 30)) },
  { first: 'Leila', last: 'Moradi', discipline: 'speech', credential: 'CCC-SLP', zip: '11021', cap: 22, range: 30, settings: ['home', 'clinic', 'telehealth'], languages: ['English', 'Farsi'], availability: [...weekdays([1, 2, 3, 4], H(12), H(19)), { day: 6, start: H(9), end: H(13) }] },
  { first: 'Marcus', last: 'Bell', discipline: 'speech', credential: 'CCC-SLP', zip: '11801', cap: 25, range: 30, settings: ['home', 'community'], languages: ['English'], availability: weekdays([1, 2, 3, 4, 5], H(8), H(15)) },
  { first: 'Nadège', last: 'Pierre', discipline: 'speech', credential: 'CCC-SLP', zip: '11580', cap: 22, range: 30, settings: ['home', 'community', 'telehealth'], languages: ['English', 'Haitian Creole', 'French'], availability: weekdays([2, 3, 4, 5], H(10), H(18)) },
  { first: 'Grace', last: 'Lin', discipline: 'speech', credential: 'CCC-SLP', zip: '11361', cap: 20, range: 25, settings: ['clinic', 'home', 'telehealth'], languages: ['English', 'Mandarin'], availability: weekdays([1, 3, 5], H(9), H(17)) },
  { first: 'Owen', last: 'Callahan', discipline: 'speech', credential: 'CCC-SLP', zip: '11050', cap: 20, range: 30, settings: ['home', 'clinic'], languages: ['English'], availability: weekdays([1, 2, 3, 4, 5], H(13), H(19)) },
  { first: 'Sofia', last: 'Reyes', discipline: 'speech', credential: 'SLPA', zip: '11756', cap: 26, range: 30, settings: ['home', 'community'], languages: ['English', 'Spanish'], availability: weekdays([1, 2, 3, 4, 5], H(9), H(17)) },
  { first: 'Hannah', last: 'Brooks', discipline: 'ot', credential: 'OTR/L', zip: '11530', cap: 24, range: 30, settings: ['home', 'community', 'clinic'], languages: ['English'], availability: weekdays([1, 2, 3, 4, 5], H(8), H(16)) },
  { first: 'Daniel', last: 'Park', discipline: 'ot', credential: 'OTR/L', zip: '11791', cap: 22, range: 30, settings: ['home', 'clinic'], languages: ['English', 'Korean'], availability: weekdays([1, 2, 3, 4], H(11), H(19)) },
  { first: 'Isabel', last: 'Ortiz', discipline: 'ot', credential: 'OTR/L', zip: '11570', cap: 24, range: 30, settings: ['home', 'community', 'telehealth'], languages: ['English', 'Spanish'], availability: weekdays([1, 2, 3, 4, 5], H(8, 30), H(16, 30)) },
  { first: 'Tom', last: 'Kowalski', discipline: 'ot', credential: 'COTA/L', zip: '11590', cap: 26, range: 30, settings: ['home', 'community'], languages: ['English'], availability: [...weekdays([2, 3, 4, 5], H(9), H(17)), { day: 6, start: H(9), end: H(13) }] },
  { first: 'Rachel', last: 'Adeyemi', discipline: 'ot', credential: 'OTR/L', zip: '11001', cap: 20, range: 30, settings: ['home', 'clinic', 'telehealth'], languages: ['English'], availability: weekdays([1, 2, 3, 4, 5], H(12), H(19)) },
];

const CHILD_FIRST = ['Ava', 'Liam', 'Mia', 'Noah', 'Sofia', 'Ethan', 'Isla', 'Lucas', 'Zara', 'Mateo', 'Chloe', 'Aiden', 'Nora', 'Leo', 'Maya', 'Elijah', 'Aria', 'Kai', 'Layla', 'Owen', 'Emma', 'Jaden', 'Lily', 'Ezra', 'Amara', 'Caleb', 'Hana', 'Theo', 'Ruby', 'Daniel', 'Ivy', 'Samuel', 'Leah', 'Adam', 'Naomi', 'Julian', 'Yara', 'Felix', 'Aaliyah', 'Max'];
const ADULT_FIRST = ['Jessica', 'Michael', 'Ana', 'David', 'Priya', 'Kevin', 'Maria', 'Chris', 'Fatima', 'Brian', 'Lauren', 'Jose', 'Mei', 'Ryan', 'Nicole', 'Andre'];
const LAST = ['Rivera', 'Cohen', 'Patel', 'Murphy', 'Nguyen', 'Romano', 'Hosseini', 'Johnson', 'Kim', 'Garcia', 'Rossi', 'Baptiste', 'Chen', 'Sullivan', 'Shah', 'Morales', 'Levy', 'Okafor', 'Walsh', 'Ramirez', 'Esposito', 'Zhang', 'Brennan', 'Haddad'];
const STREETS = ['Willis Ave', 'Hillside Ave', 'Jericho Tpke', 'Franklin Ave', 'Nassau Blvd', 'Old Country Rd', 'Plandome Rd', 'Merrick Ave', 'Searingtown Rd', 'Post Ave', 'Hempstead Tpke', 'Northern Blvd', 'Maple St', 'Oak Dr', 'Cedar Ln', 'Elm St'];
const CONCERNS: Record<Discipline, string[]> = {
  speech: [
    'Says only a handful of words and gets frustrated when not understood.',
    'Hard for family and teachers to understand; drops sounds at the ends of words.',
    'Stutters, especially when excited; starting to avoid talking in class.',
    'Pediatrician noted a language delay at the last well visit.',
    'Picky eating and difficulty chewing; gags on textured foods.',
  ],
  ot: [
    'Struggles with holding crayons and using utensils compared to peers.',
    'Very sensitive to noise and clothing textures; meltdowns during transitions.',
    'Teacher reports trouble with handwriting and staying seated.',
    'Clumsy, bumps into things, and tires quickly on the playground.',
    'Difficulty with dressing, buttons and zippers.',
  ],
};
const LANGS = [...Array(30).fill('English'), ...Array(5).fill('Spanish'), 'Mandarin', 'Mandarin', 'Farsi', 'Haitian Creole', 'Korean'] as string[];

export interface SeedSummary {
  therapists: number;
  children: number;
  cases: number;
  appointments: number;
}

export async function seedDemoData(s: Services, childCount = 90): Promise<SeedSummary> {
  const r = mulberry32(20261104);
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const chance = (p: number) => r() < p;
  const jitter = (p: GeoPoint, amt = 0.012): GeoPoint => ({ lat: p.lat + (r() * 2 - 1) * amt, lon: p.lon + (r() * 2 - 1) * amt * 1.3 });
  const now = s.now();
  const todayIso = isoDateInZone(now, s.config.timeZone);
  const zips = Object.keys(ZIP_CENTROIDS);
  const nearZips = zips.filter((z) => {
    const c = ZIP_CENTROIDS[z]!;
    return Math.abs(c.lat - 40.755) < 0.09 && Math.abs(c.lon + 73.64) < 0.13; // weight the clinic's catchment area
  });

  // ----- therapists -----
  const therapistDocs = await Therapist.insertMany(
    THERAPISTS.map((t) => {
      const c = ZIP_CENTROIDS[t.zip]!;
      return {
        firstName: t.first,
        lastName: t.last,
        discipline: t.discipline,
        credential: t.credential,
        email: `${t.first}.${t.last}`.toLowerCase().normalize('NFKD').replace(/[^a-z.]/g, '') + '@seeds-demo.example',
        homeBase: { label: c.town, point: toPoint(jitter(c)) },
        maxOneWayTravelMinutes: t.range,
        weeklyCapacity: t.cap,
        settings: t.settings,
        languages: t.languages,
        availability: t.availability,
      };
    }),
  );

  // ----- children + cases -----
  type Draft = { caseDoc: Record<string, unknown>; destiny: CaseStatus; request?: MatchRequest };
  const drafts: Draft[] = [];
  const childDocs: Record<string, unknown>[] = [];
  let household: { last: string; phone: string; zip: string; line1: string; point: GeoPoint; guardianFirst: string } | null = null;

  for (let i = 0; i < childCount; i++) {
    const prev = household;
    const sibling: boolean = prev !== null && chance(0.15);
    const zip: string = prev && sibling ? prev.zip : chance(0.7) ? pick(nearZips) : pick(zips);
    const town = ZIP_CENTROIDS[zip]!;
    const last: string = prev && sibling ? prev.last : pick(LAST);
    const phone: string = prev && sibling ? prev.phone : `(516) 555-01${String(i % 100).padStart(2, '0')}`;
    const line1: string = prev && sibling ? prev.line1 : `${10 + Math.floor(r() * 290)} ${pick(STREETS)}`;
    const point: GeoPoint = prev && sibling ? prev.point : jitter(town);
    const guardianFirst: string = prev && sibling ? prev.guardianFirst : pick(ADULT_FIRST);
    household = { last, phone, zip, line1, point, guardianFirst };

    const ageMonths = 14 + Math.floor(r() * 100);
    const dob = addDays(todayIso, -Math.round(ageMonths * 30.44));
    const first = pick(CHILD_FIRST);
    const childId = new mongoose.Types.ObjectId();
    const language = pick(LANGS);
    childDocs.push({
      _id: childId,
      firstName: first,
      lastName: last,
      firstNameKey: first.toLowerCase(),
      lastNameKey: last.toLowerCase(),
      dateOfBirth: dob,
      preferredLanguage: language,
      address: { line1, city: town.town, state: 'NY', postalCode: zip },
      location: toPoint(point),
      geocodePrecision: 'demo',
      householdKey: phone.replace(/\D/g, '').slice(-10),
      guardians: [{ firstName: guardianFirst, lastName: last, relationship: chance(0.8) ? 'Mother' : 'Father', phone, email: `${guardianFirst.toLowerCase()}.${last.toLowerCase()}@example.com`, isPrimary: true }],
    });

    const disciplines: Discipline[] = chance(0.2) ? ['speech', 'ot'] : [chance(0.62) ? 'speech' : 'ot'];
    // Programs the practice lists publicly (Information.txt §3): CPSE 3–5, CSE school-age, major insurance, private pay.
    const funding: FundingSource =
      ageMonths < 36 ? (chance(0.75) ? 'insurance' : 'private')
        : ageMonths < 60 ? pick<FundingSource>(['cpse', 'cpse', 'cpse', 'insurance', 'insurance', 'private'])
          : pick<FundingSource>(['cse', 'cse', 'insurance', 'insurance', 'insurance', 'private']);
    const setting: SessionSetting =
      ageMonths < 36 ? pick<SessionSetting>(['home', 'home', 'home', 'home', 'home', 'clinic'])
        : ageMonths < 60 ? pick<SessionSetting>(['home', 'home', 'community', 'community', 'clinic', 'telehealth'])
          : pick<SessionSetting>(['clinic', 'clinic', 'home', 'home', 'community', 'telehealth']);
    const schoolAge = ageMonths >= 60;
    const days = [1, 2, 3, 4, 5].filter(() => chance(0.55));
    if (days.length === 0) days.push(1 + Math.floor(r() * 5));
    const availability: WeeklyWindow[] = days.flatMap((day) =>
      schoolAge ? [{ day, start: H(15), end: H(18) }] : chance(0.5) ? [{ day, start: H(8), end: H(12) }] : [{ day, start: H(9), end: H(15) }],
    );
    if (schoolAge && chance(0.25)) availability.push({ day: 6, start: H(9), end: H(12) });

    const communityPoint = jitter(point, 0.006);
    const sessionLocation =
      setting === 'home' ? { label: town.town, point: toPoint(point) }
        : setting === 'community' ? { label: `${pick(['Little Sprouts', 'Bright Horizons', 'Rainbow', 'Sunshine'])} ${schoolAge ? 'School' : 'Preschool'}, ${town.town}`, point: toPoint(communityPoint) }
          : setting === 'clinic' ? { label: s.config.matching.clinicLabel, point: toPoint(s.config.matching.clinic) }
            : undefined;

    const submissionCode = `SEED-${randomCode()}`;
    for (const discipline of disciplines) {
      const roll = r();
      const destiny: CaseStatus = roll < 0.42 ? 'scheduled' : roll < 0.68 ? 'ready' : roll < 0.88 ? 'pending-documents' : roll < 0.93 ? 'needs-review' : roll < 0.97 ? 'on-hold' : 'closed';
      const waitDays = destiny === 'scheduled' ? 40 + Math.floor(r() * 90) : Math.floor(r() * 72);
      const receivedAt = new Date(now.getTime() - waitDays * 86_400_000 - Math.floor(r() * 8) * 3_600_000);
      const receivedDate = isoDateInZone(receivedAt, s.config.timeZone);
      const urgent = chance(0.08);
      const p = assessPriority({ receivedAt, receivedDate, dateOfBirth: dob, fundingSource: funding, urgentConcern: urgent, siblingActive: Boolean(sibling) }, s.config.priority);
      // Everything done for cases past intake; partial, realistic progress for families still gathering paperwork.
      const allSteps = journeyFor(funding).flatMap((p) => p.steps);
      const required = requiredChecklist(funding);
      let completed: ChecklistItem[];
      if (destiny === 'pending-documents' || destiny === 'needs-review') {
        const districtSteps = allSteps.filter((x) => x.startsWith('district') || x === 'evaluation-consent' || x === 'iep-meeting');
        const districtDone = districtSteps.slice(0, Math.floor(r() * districtSteps.length)); // never the IEP itself
        completed = [
          'consent',
          ...(chance(0.6) ? (['hipaa-ack', 'office-policy'] as ChecklistItem[]) : []),
          ...(chance(0.3) ? (['prior-reports'] as ChecklistItem[]) : []),
          ...(funding === 'insurance' ? (['insurance-card', ...(chance(0.4) ? ['physician-referral'] : [])] as ChecklistItem[]) : []),
          ...districtDone,
        ];
        // make sure at least one required step is still open
        if (required.every((x) => completed.includes(x))) completed = completed.filter((x) => x !== 'office-policy' && x !== 'physician-referral');
      } else {
        completed = allSteps.filter((x) => x !== 'prior-reports' || chance(0.6));
      }
      const checklistLog = completed.map((item, i) => ({
        item,
        at: new Date(Math.min(now.getTime() - (completed.length - i) * 3_600_000, receivedAt.getTime() + i * 36 * 3_600_000)),
        by: item === 'insurance-verified' ? 'Front desk (demo)' : `${guardianFirst} ${last} (parent)`,
      }));
      const referenceCode = `${submissionCode}-${DISCIPLINE_SHORT[discipline]}`;
      const caseId = new mongoose.Types.ObjectId();
      const caseDoc: Record<string, unknown> = {
        _id: caseId,
        submissionCode,
        referenceCode,
        childId,
        childName: `${first} ${last}`,
        childDob: dob,
        town: town.town,
        householdKey: phone.replace(/\D/g, '').slice(-10),
        preferredLanguage: language,
        searchKey: `${first} ${last} ${referenceCode} ${last}`.toLowerCase(),
        discipline,
        status: destiny === 'scheduled' ? 'ready' : destiny,
        reviewReason: destiny === 'needs-review' ? 'Possible duplicate: similar name and phone already on file. Verify with family.' : undefined,
        receivedAt,
        queueSortKey: p.queueSortKey,
        priorityBoostDays: p.boostDays,
        priorityFactors: p.factors,
        targetStartBy: p.targetStartBy,
        fundingSource: funding,
        referralSource: funding === 'cpse' || funding === 'cse' ? 'school-district' : pick(['parent', 'pediatrician', 'pediatrician']),
        concerns: pick(CONCERNS[discipline]),
        urgentConcern: urgent,
        insurance: funding === 'insurance' || funding === 'medicaid' ? { payer: funding === 'medicaid' ? 'NYS Medicaid' : pick(['Aetna', 'Cigna', 'Empire BCBS', 'UnitedHealthcare']), memberId: `DEMO${Math.floor(r() * 1e6)}` } : undefined,
        preferredSetting: setting,
        acceptsTelehealth: setting === 'telehealth' || chance(0.4),
        sessionLocation,
        availability,
        sessionsPerWeek: chance(0.15) ? 2 : 1,
        sessionMinutes: ageMonths < 36 ? 30 : chance(0.7) ? 45 : 60,
        completedChecklist: completed,
        checklistLog,
        consent: { signedBy: `${guardianFirst} ${last}`, signedAt: receivedAt },
        events: [{ at: receivedAt, actor: 'Family (online intake)', kind: 'submitted', message: 'Referral submitted via online intake (demo data)' }],
      };
      const request: MatchRequest | undefined =
        destiny === 'scheduled'
          ? {
              caseId: caseId.toString(),
              discipline,
              setting,
              acceptsTelehealth: caseDoc.acceptsTelehealth as boolean,
              location: setting === 'home' ? point : setting === 'community' ? communityPoint : null,
              locationLabel: sessionLocation?.label ?? town.town,
              familyWindows: availability,
              sessionsPerWeek: caseDoc.sessionsPerWeek as number,
              sessionMinutes: caseDoc.sessionMinutes as number,
              preferredLanguage: language,
            }
          : undefined;
      drafts.push({ caseDoc, destiny, request });
    }
  }

  await Child.insertMany(childDocs);
  await IntakeCase.insertMany(drafts.map((d) => d.caseDoc));

  // ----- existing caseload: let the engine build realistic routes for the "already scheduled" children -----
  const schedules: TherapistSchedule[] = therapistDocs.map((t) => ({
    therapistId: t._id.toString(),
    name: `${t.firstName} ${t.lastName}, ${t.credential}`,
    discipline: t.discipline,
    homeBase: { lat: t.homeBase!.point!.coordinates[1]!, lon: t.homeBase!.point!.coordinates[0]! },
    maxOneWayTravelMinutes: t.maxOneWayTravelMinutes,
    weeklyCapacity: Math.round(t.weeklyCapacity * 0.8), // leave headroom so the live demo has open slots
    settings: t.settings,
    languages: t.languages,
    availability: t.availability.map((w) => ({ day: w.day!, start: w.start!, end: w.end! })),
    visits: [],
  }));
  const toSchedule = drafts.filter((d) => d.request).sort((a, b) => +(a.caseDoc.queueSortKey as Date) - +(b.caseDoc.queueSortKey as Date));
  const plan = planQueue(toSchedule.map((d) => d.request!), schedules, s.travel.screening, s.config.matching);

  const appointments: Record<string, unknown>[] = [];
  for (const entry of plan) {
    if (!entry.proposal) continue;
    const draft = toSchedule.find((d) => (d.caseDoc._id as mongoose.Types.ObjectId).toString() === entry.request.caseId)!;
    const t = therapistDocs.find((x) => x._id.toString() === entry.proposal!.therapistId)!;
    const tName = `${t.firstName} ${t.lastName}, ${t.credential}`;
    const [cf, cl] = (draft.caseDoc.childName as string).split(' ');
    const scheduledAt = new Date((draft.caseDoc.receivedAt as Date).getTime() + (5 + Math.floor(r() * 20)) * 86_400_000);
    for (const slot of entry.proposal.slots) {
      appointments.push({
        caseId: draft.caseDoc._id,
        therapistId: t._id,
        referenceCode: draft.caseDoc.referenceCode,
        childLabel: childLabel(cf ?? '', cl ?? ''),
        therapistName: tName,
        discipline: draft.caseDoc.discipline,
        day: slot.day,
        start: slot.start,
        end: slot.end,
        startsOn: nextOccurrence(isoDateInZone(scheduledAt, s.config.timeZone), slot.day),
        setting: entry.proposal.setting,
        location: entry.proposal.visitLocation
          ? { label: entry.proposal.setting === 'clinic' ? s.config.matching.clinicLabel : entry.request.locationLabel, point: toPoint(entry.proposal.visitLocation) }
          : undefined,
        calendar: { state: 'not-configured' },
      });
    }
    await IntakeCase.updateOne(
      { _id: draft.caseDoc._id },
      {
        $set: { status: 'scheduled', assignedTherapistId: t._id, assignedTherapistName: tName, scheduledAt },
        $push: { events: { at: scheduledAt, actor: 'Demo coordinator', kind: 'scheduled', message: `Booked with ${tName}` } },
      },
    );
  }
  if (appointments.length) await Appointment.insertMany(appointments);

  return { therapists: therapistDocs.length, children: childDocs.length, cases: drafts.length, appointments: appointments.length };
}

/** Seed once per database, even if several instances boot at the same moment. */
export async function seedIfEmpty(s: Services) {
  if ((await Therapist.estimatedDocumentCount()) > 0) return;
  try {
    await Meta.create({ _id: 'demo-seed', at: new Date() });
  } catch {
    return; // another instance holds the lock
  }
  const summary = await seedDemoData(s);
  s.log.info(summary, 'Seeded demo data');
}

export async function resetDatabase() {
  await Promise.all([Child.deleteMany({}), IntakeCase.deleteMany({}), Therapist.deleteMany({}), Appointment.deleteMany({}), Meta.deleteMany({}), CaseDocument.deleteMany({})]);
  // uploaded file bytes (GridFS bucket "documents")
  const db = mongoose.connection.db!;
  await Promise.all(['documents.files', 'documents.chunks'].map((c) => db.collection(c).deleteMany({})));
}
