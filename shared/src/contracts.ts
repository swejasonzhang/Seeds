import type {
  CalendarSyncState,
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
}

/** Public, unauthenticated runtime config for the SPA, so one build works in every environment. */
export interface PublicConfigDto {
  authMode: 'demo' | 'entra';
  entra?: { clientId: string; tenantId: string; apiScope: string };
  travelSource: TravelSource;
  calendarSync: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  issues?: { path: string; message: string }[];
}
