import mongoose from 'mongoose';
import { CALENDAR_SYNC_STATES, CASE_STATUSES, CHECKLIST_ITEMS, DISCIPLINES, FUNDING_SOURCES, PRIORITY_FACTORS, REFERRAL_SOURCES, SETTINGS } from '@seeds/shared';
import type { GeoPoint } from '../core/travel.ts';

const { Schema, model } = mongoose;

// GeoJSON point: coordinates are [longitude, latitude]. Enables 2dsphere indexes for radius pre-filtering.
const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

export const toPoint = (p: GeoPoint) => ({ type: 'Point' as const, coordinates: [p.lon, p.lat] });
export const fromPoint = (p?: { coordinates?: number[] } | null): GeoPoint | null =>
  p?.coordinates && p.coordinates.length === 2 ? { lat: p.coordinates[1]!, lon: p.coordinates[0]! } : null;

const windowSchema = new Schema({ day: Number, start: Number, end: Number }, { _id: false });
const addressSchema = new Schema({ line1: String, city: String, state: String, postalCode: String }, { _id: false });
const placeSchema = new Schema({ label: String, point: { type: pointSchema, default: undefined } }, { _id: false });

// ---------- children (clients) ----------

const childSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    firstNameKey: { type: String, required: true },
    lastNameKey: { type: String, required: true },
    dateOfBirth: { type: String, required: true }, // YYYY-MM-DD
    preferredLanguage: { type: String, default: 'English' },
    address: { type: addressSchema, required: true },
    location: { type: pointSchema, default: undefined },
    geocodePrecision: String,
    householdKey: { type: String, required: true },
    guardians: [
      new Schema(
        { firstName: String, lastName: String, relationship: String, phone: String, email: String, isPrimary: Boolean },
        { _id: false },
      ),
    ],
  },
  { timestamps: true },
);
childSchema.index({ lastNameKey: 1, firstNameKey: 1, dateOfBirth: 1 }); // duplicate detection
childSchema.index({ householdKey: 1 }); // sibling detection
childSchema.index({ location: '2dsphere' });

export const Child = model('Child', childSchema, 'children');

// ---------- intake cases (one per child per discipline) ----------

const caseSchema = new Schema(
  {
    submissionCode: { type: String, required: true },
    referenceCode: { type: String, required: true, unique: true },
    childId: { type: Schema.Types.ObjectId, ref: 'Child', required: true },

    // Denormalized for fast queue reads with no joins.
    childName: { type: String, required: true },
    childDob: { type: String, required: true },
    town: String,
    householdKey: String,
    preferredLanguage: { type: String, default: 'English' },
    searchKey: { type: String, required: true },

    discipline: { type: String, enum: DISCIPLINES, required: true },
    status: { type: String, enum: CASE_STATUSES, required: true },
    reviewReason: String,

    receivedAt: { type: Date, required: true },
    queueSortKey: { type: Date, required: true },
    priorityBoostDays: { type: Number, default: 0 },
    priorityFactors: [{ type: String, enum: PRIORITY_FACTORS }],
    targetStartBy: { type: String, required: true },

    fundingSource: { type: String, enum: FUNDING_SOURCES, required: true },
    referralSource: { type: String, enum: REFERRAL_SOURCES, required: true },
    referringProvider: String,
    concerns: String,
    urgentConcern: { type: Boolean, default: false },
    insurance: { payer: String, memberId: String },

    preferredSetting: { type: String, enum: SETTINGS, required: true },
    acceptsTelehealth: { type: Boolean, default: false },
    sessionLocation: { type: placeSchema, default: undefined },

    availability: [windowSchema],
    sessionsPerWeek: { type: Number, default: 1 },
    sessionMinutes: { type: Number, default: 45 },

    completedChecklist: [{ type: String, enum: CHECKLIST_ITEMS }],
    consent: { signedBy: String, signedAt: Date },

    assignedTherapistId: { type: Schema.Types.ObjectId, ref: 'Therapist' },
    assignedTherapistName: String,
    scheduledAt: Date,

    events: [new Schema({ at: Date, actor: String, kind: String, message: String }, { _id: false })],
  },
  { timestamps: true },
);
// The queue: filter by status (+ discipline) and sort by effective wait. Served straight from this index.
caseSchema.index({ status: 1, discipline: 1, queueSortKey: 1 });
caseSchema.index({ status: 1, queueSortKey: 1 });
caseSchema.index({ submissionCode: 1 });
caseSchema.index({ childId: 1 });
caseSchema.index({ householdKey: 1, status: 1 });
caseSchema.index({ assignedTherapistId: 1 });
caseSchema.index({ receivedAt: -1 });

export const IntakeCase = model('IntakeCase', caseSchema, 'cases');

// ---------- therapists ----------

const therapistSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    discipline: { type: String, enum: DISCIPLINES, required: true },
    credential: { type: String, required: true },
    email: { type: String, required: true, unique: true }, // Microsoft 365 UPN for calendar sync
    homeBase: { type: placeSchema, required: true },
    maxOneWayTravelMinutes: { type: Number, default: 30 },
    weeklyCapacity: { type: Number, default: 25 },
    settings: [{ type: String, enum: SETTINGS }],
    languages: { type: [String], default: ['English'] },
    availability: [windowSchema],
    active: { type: Boolean, default: true },
    /** Optimistic concurrency token: every booking bumps it, so concurrent bookings can't double-book. */
    scheduleVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);
therapistSchema.index({ discipline: 1, active: 1 });
therapistSchema.index({ 'homeBase.point': '2dsphere' });

export const Therapist = model('Therapist', therapistSchema, 'therapists');

// ---------- appointments (standing weekly sessions) ----------

const appointmentSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: 'IntakeCase', required: true },
    therapistId: { type: Schema.Types.ObjectId, ref: 'Therapist', required: true },
    referenceCode: { type: String, required: true },
    childLabel: { type: String, required: true }, // initials only: safe for calendars and route sheets
    therapistName: { type: String, required: true },
    discipline: { type: String, enum: DISCIPLINES, required: true },
    day: { type: Number, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    startsOn: { type: String, required: true },
    endsOn: String,
    setting: { type: String, enum: SETTINGS, required: true },
    location: { type: placeSchema, default: undefined },
    status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
    calendar: {
      state: { type: String, enum: CALENDAR_SYNC_STATES, default: 'not-configured' },
      eventId: String,
      error: String,
      attempts: { type: Number, default: 0 },
      claimedAt: Date,
    },
  },
  { timestamps: true },
);
appointmentSchema.index({ therapistId: 1, status: 1, day: 1, start: 1 });
appointmentSchema.index({ caseId: 1, status: 1 });
appointmentSchema.index({ 'calendar.state': 1, 'calendar.claimedAt': 1 }); // calendar outbox

export const Appointment = model('Appointment', appointmentSchema, 'appointments');

// ---------- meta (locks, one-time jobs) ----------

export const Meta = model('Meta', new Schema({ _id: String, at: Date }, { versionKey: false }), 'meta');

export type ChildDoc = mongoose.InferSchemaType<typeof childSchema> & { _id: mongoose.Types.ObjectId };
export type CaseDoc = mongoose.InferSchemaType<typeof caseSchema> & { _id: mongoose.Types.ObjectId };
export type TherapistDoc = mongoose.InferSchemaType<typeof therapistSchema> & { _id: mongoose.Types.ObjectId };
export type AppointmentDoc = mongoose.InferSchemaType<typeof appointmentSchema> & { _id: mongoose.Types.ObjectId };

export async function connectDb(uri: string) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { maxPoolSize: 20, serverSelectionTimeoutMS: 10_000 });
  // createIndexes (not syncIndexes): safe when several instances boot at once, never drops indexes.
  await Promise.all([Child.createIndexes(), IntakeCase.createIndexes(), Therapist.createIndexes(), Appointment.createIndexes()]);
}

export const isDbConnected = () => mongoose.connection.readyState === 1;

/** Human-readable reason + fix for the most common hosted-MongoDB connection failures. */
export function explainDbError(err: unknown, uri: string): string {
  const message = err instanceof Error ? err.message.split('\n')[0]! : String(err);
  const atlas = uri.includes('.mongodb.net');
  if (/auth|bad auth|authentication/i.test(message)) {
    return `${message}. Check the username and password in MONGODB_URI (URL-encode special characters in the password).`;
  }
  if (atlas) {
    return (
      `${message}. MongoDB Atlas is not accepting connections from this server. In Atlas → Security → Network Access, ` +
      `add this host's outbound IPs (Render: service → Connect → Outbound) or 0.0.0.0/0, then restart.`
    );
  }
  return `${message}. Check that MongoDB is running and MONGODB_URI is correct.`;
}

/**
 * Connect in the background and keep retrying with backoff. The HTTP server is already listening, so the platform
 * sees an open port, /healthz stays green, /readyz reports 503 and the API answers 503 until the database is up.
 */
export async function connectDbWithRetry(uri: string, log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void }) {
  for (let attempt = 1; ; attempt++) {
    try {
      await connectDb(uri);
      return;
    } catch (err) {
      const delayMs = Math.min(60_000, 2_000 * 2 ** Math.min(attempt - 1, 5));
      log.error({ attempt, retryInSeconds: delayMs / 1000, reason: explainDbError(err, uri) }, 'MongoDB connection failed');
      await mongoose.disconnect().catch(() => undefined);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
