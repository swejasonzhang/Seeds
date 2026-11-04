import type {
  CalendarSyncState,
  DocumentKind,
  JourneyPhaseId,
  StepOwner,
  CaseStatus,
  ChecklistItem,
  Discipline,
  FundingSource,
  PriorityFactor,
  ReferralSource,
  Role,
  SessionSetting,
  WeeklyWindow,
} from './domain.ts';

// ---------- Intake ----------

export interface IntakeResult {
  submissionCode: string;
  cases: { referenceCode: string; discipline: Discipline; status: CaseStatus }[];
  /** Services that were already open for this child, so no new case was created. */
  alreadyOpen: Discipline[];
  /** Demo only: key to open this family's portal right away (production parents sign in with Entra External ID). */
  familyKey?: string;
}

// ---------- Journey / checklist ----------

export type StepStatus = 'done' | 'todo' | 'waiting';

export interface JourneyStepDto {
  id: ChecklistItem;
  title: string;
  description: string;
  owner: StepOwner;
  status: StepStatus;
  required: boolean;
  optional: boolean;
  familyAction?: 'sign' | 'upload' | 'confirm';
  documentKind?: DocumentKind;
  timeline?: string;
  completedAt?: string;
  completedBy?: string;
}

export interface JourneyPhaseDto {
  id: JourneyPhaseId;
  title: string;
  steps: JourneyStepDto[];
}

export interface JourneySummary {
  phases: JourneyPhaseDto[];
  done: number;
  total: number;
  /** Required steps still open, in order. */
  blocking: JourneyStepDto[];
  /** First open step the family can act on. */
  nextForFamily?: JourneyStepDto;
}

export interface DocumentDto {
  id: string;
  kind: DocumentKind;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}

// ---------- Queue & cases ----------

export type SlaState = 'on-track' | 'at-risk' | 'breached' | 'met';

export interface QueueItem {
  id: string;
  referenceCode: string;
  childName: string;
  ageMonths: number;
  discipline: Discipline;
  status: CaseStatus;
  reviewReason?: string;
  receivedAt: string;
  /** Days in queue including priority boosts: the number the queue is sorted by. */
  effectiveWaitDays: number;
  waitDays: number;
  priorityFactors: PriorityFactor[];
  targetStartBy: string;
  sla: SlaState;
  town: string;
  preferredSetting: SessionSetting;
  fundingSource: FundingSource;
  missingChecklist: ChecklistItem[];
  assignedTherapistName?: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StatusCounts {
  counts: Partial<Record<CaseStatus, number>>;
}

export interface AppointmentDto {
  id: string;
  caseId: string;
  referenceCode: string;
  childLabel: string;
  therapistId: string;
  therapistName: string;
  day: number;
  start: number;
  end: number;
  startsOn: string;
  setting: SessionSetting;
  locationLabel: string;
  calendarSync: CalendarSyncState;
}

export interface CaseEventDto {
  at: string;
  actor: string;
  kind: string;
  message: string;
}

export interface CaseDetail extends QueueItem {
  child: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    preferredLanguage: string;
    address: { line1: string; city: string; state: string; postalCode: string };
    geocodePrecision?: string;
  };
  guardians: { firstName: string; lastName: string; relationship: string; phone: string; email?: string; isPrimary: boolean }[];
  concerns: string;
  urgentConcern: boolean;
  referralSource: ReferralSource;
  referringProvider?: string;
  insurance?: { payer?: string; memberId?: string };
  acceptsTelehealth: boolean;
  sessionLocationLabel?: string;
  sessionLocated: boolean;
  availability: WeeklyWindow[];
  sessionsPerWeek: number;
  sessionMinutes: number;
  requiredChecklist: ChecklistItem[];
  completedChecklist: ChecklistItem[];
  consent?: { signedBy: string; signedAt: string };
  appointments: AppointmentDto[];
  events: CaseEventDto[];
  journey: JourneySummary;
  documents: DocumentDto[];
  siblings: { id: string; referenceCode: string; childName: string; discipline: Discipline; status: CaseStatus; therapistName?: string }[];
}

export interface UpdatePlanRequest {
  sessionsPerWeek?: number;
  sessionMinutes?: number;
  urgentConcern?: boolean;
  preferredSetting?: SessionSetting;
  acceptsTelehealth?: boolean;
  availability?: WeeklyWindow[];
}

export interface StatusChangeRequest {
  status: Extract<CaseStatus, 'on-hold' | 'closed' | 'ready'>;
  note?: string;
}

// ---------- Matching ----------

export type TravelSource = 'estimate' | 'azure-maps';

export interface ProposedSlotDto {
  day: number;
  start: number;
  end: number;
  addedTravelMinutes: number;
  addedMiles: number;
  after?: string;
  before?: string;
}

export interface MatchSuggestionDto {
  therapistId: string;
  therapistName: string;
  setting: SessionSetting;
  slots: ProposedSlotDto[];
  score: number;
  addedTravelMinutes: number;
  addedMiles: number;
  caseloadAfter: number;
  weeklyCapacity: number;
  reasons: string[];
}

export interface MatchResponse {
  suggestions: MatchSuggestionDto[];
  exclusions: Record<string, number>;
  travelSource: TravelSource;
}

export interface BookRequest {
  therapistId: string;
  setting: SessionSetting;
  slots: { day: number; start: number }[];
}

export interface BookResponse {
  appointments: AppointmentDto[];
}

export interface AutoMatchRequest {
  discipline?: Discipline;
  limit?: number;
}

export interface AutoMatchProposal {
  caseId: string;
  referenceCode: string;
  childName: string;
  discipline: Discipline;
  effectiveWaitDays: number;
  priorityFactors: PriorityFactor[];
  town: string;
  suggestion?: MatchSuggestionDto;
  exclusions: Record<string, number>;
}

export interface AutoMatchResponse {
  proposals: AutoMatchProposal[];
  matched: number;
  unmatched: number;
  travelSource: TravelSource;
  /** Driving minutes saved versus giving every child their own route day. */
  estimatedMinutesSaved: number;
}

export interface ConfirmBookingsRequest {
  bookings: ({ caseId: string } & BookRequest)[];
}

export interface ConfirmBookingsResponse {
  results: { caseId: string; ok: boolean; error?: string }[];
}

// ---------- Therapists ----------

export interface TherapistSummary {
  id: string;
  name: string;
  credential: string;
  discipline: Discipline;
  homeBaseLabel: string;
  settings: SessionSetting[];
  languages: string[];
  weeklyCapacity: number;
  sessionsBooked: number;
  maxOneWayTravelMinutes: number;
  availability: WeeklyWindow[];
  active: boolean;
  weeklyDriveMinutes: number;
}

export interface TherapistDetail extends TherapistSummary {
  email: string;
  appointments: AppointmentDto[];
}

export interface UpdateTherapistRequest {
  weeklyCapacity?: number;
  maxOneWayTravelMinutes?: number;
  settings?: SessionSetting[];
  languages?: string[];
  availability?: WeeklyWindow[];
  active?: boolean;
}

export interface RouteStop {
  appointmentId: string;
  start: number;
  end: number;
  label: string;
  setting: SessionSetting;
  referenceCode: string;
  childLabel: string;
  fromLabel: string;
  driveMinutes: number;
  driveMiles: number;
}

export interface DayRoute {
  therapistId: string;
  therapistName: string;
  date: string;
  day: number;
  stops: RouteStop[];
  returnHomeMinutes: number;
  totalDriveMinutes: number;
  totalDriveMiles: number;
  travelSource: TravelSource;
}

// ---------- Dashboard ----------

export interface DashboardDto {
  generatedAt: string;
  openCases: number;
  readyToSchedule: number;
  pendingDocuments: number;
  needsReview: number;
  scheduledLast7Days: number;
  intakesLast7Days: number;
  medianWaitDaysReady: number;
  oldestWaitDaysReady: number;
  slaAtRisk: number;
  slaBreached: number;
  byDiscipline: {
    discipline: Discipline;
    ready: number;
    pendingDocuments: number;
    needsReview: number;
    scheduled: number;
    booked: number;
    capacity: number;
  }[];
  waitBuckets: { label: string; speech: number; ot: number }[];
  intakeTrend: { date: string; count: number }[];
}

// ---------- Session ----------

export interface MeDto {
  name: string;
  email: string;
  roles: Role[];
  authMode: 'demo' | 'entra';
  therapistId?: string;
  familyKey?: string;
  via: 'microsoft' | 'demo';
}

// ---------- Portals ----------

export interface FamilyCaseDto {
  id: string;
  referenceCode: string;
  discipline: Discipline;
  status: CaseStatus;
  receivedAt: string;
  fundingSource: FundingSource;
  preferredSetting: SessionSetting;
  targetStartBy: string;
  journey: JourneySummary;
  therapist?: { name: string; languages: string[] };
  sessions: { day: number; start: number; end: number; startsOn: string; setting: SessionSetting; locationLabel: string }[];
  documents: DocumentDto[];
}

export interface FamilyPortalDto {
  guardianName: string;
  familyKey: string;
  children: { id: string; firstName: string; lastName: string; ageMonths: number; cases: FamilyCaseDto[] }[];
}

export interface CaseloadItemDto {
  caseId: string;
  referenceCode: string;
  childName: string;
  ageMonths: number;
  discipline: Discipline;
  preferredLanguage: string;
  setting: SessionSetting;
  locationLabel: string;
  homeAddress: string;
  guardian: { name: string; relationship: string; phone: string; email?: string };
  concerns: string;
  urgentConcern: boolean;
  fundingSource: FundingSource;
  sessions: AppointmentDto[];
  journey: { done: number; total: number };
  documents: DocumentDto[];
}

export interface TherapistPortalDto {
  therapist: TherapistDetail;
  caseload: CaseloadItemDto[];
}

export interface PersonaDto {
  kind: 'admin' | 'therapist' | 'parent';
  key: string;
  name: string;
  subtitle: string;
}

export interface DemoPersonasDto {
  admin: PersonaDto;
  therapists: PersonaDto[];
  families: PersonaDto[];
}

/** Public, unauthenticated runtime config for the SPA, so one build works in every environment. */
export interface PublicConfigDto {
  authMode: 'demo' | 'entra';
  /** Present whenever Microsoft sign-in is configured (also alongside demo accounts). */
  entra?: { clientId: string; tenantId: string; apiScope: string; authority: string };
  travelSource: TravelSource;
  calendarSync: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  issues?: { path: string; message: string }[];
}
