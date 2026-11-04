// Domain vocabulary shared by the API and the web app. String unions (not TS enums) so values are
// readable in MongoDB documents, logs and JSON payloads.

export const DISCIPLINES = ['speech', 'ot'] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  speech: 'Speech therapy',
  ot: 'Occupational therapy',
};
export const DISCIPLINE_SHORT: Record<Discipline, string> = { speech: 'SP', ot: 'OT' };

/** Where sessions happen. Home and community (school/daycare) visits require the therapist to drive. */
export const SETTINGS = ['home', 'community', 'clinic', 'telehealth'] as const;
export type SessionSetting = (typeof SETTINGS)[number];
export const SETTING_LABEL: Record<SessionSetting, string> = {
  home: 'Home visit',
  community: 'School / daycare',
  clinic: 'Clinic (Williston Park)',
  telehealth: 'Telehealth',
};
export const isTravelSetting = (s: SessionSetting) => s === 'home' || s === 'community';

export const FUNDING_SOURCES = ['ei', 'cpse', 'insurance', 'medicaid', 'private'] as const;
export type FundingSource = (typeof FUNDING_SOURCES)[number];
export const FUNDING_LABEL: Record<FundingSource, string> = {
  ei: 'Early Intervention (county, birth–3)',
  cpse: 'CPSE (school district, ages 3–5)',
  insurance: 'Private insurance',
  medicaid: 'Medicaid',
  private: 'Private pay',
};

export const REFERRAL_SOURCES = ['parent', 'pediatrician', 'ei-official', 'school-district', 'other'] as const;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];
export const REFERRAL_LABEL: Record<ReferralSource, string> = {
  parent: 'Parent / guardian',
  pediatrician: 'Pediatrician',
  'ei-official': 'Early Intervention official',
  'school-district': 'School district',
  other: 'Other',
};

export const CASE_STATUSES = ['needs-review', 'pending-documents', 'ready', 'scheduled', 'on-hold', 'closed'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const STATUS_LABEL: Record<CaseStatus, string> = {
  'needs-review': 'Needs review',
  'pending-documents': 'Pending documents',
  ready: 'Ready to schedule',
  scheduled: 'Scheduled',
  'on-hold': 'On hold',
  closed: 'Closed',
};
/** Statuses a coordinator sets by hand; automation never overrides them. */
export const MANUAL_STATUSES: readonly CaseStatus[] = ['scheduled', 'on-hold', 'closed'];

export const CHECKLIST_ITEMS = [
  'consent',
  'insurance-verified',
  'physician-referral',
  'ei-authorization',
  'district-authorization',
] as const;
export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];
export const CHECKLIST_LABEL: Record<ChecklistItem, string> = {
  consent: 'Consent to treat',
  'insurance-verified': 'Insurance verified',
  'physician-referral': 'Physician referral / Rx',
  'ei-authorization': 'EI authorization (IFSP)',
  'district-authorization': 'District authorization (IEP)',
};

export function requiredChecklist(funding: FundingSource): ChecklistItem[] {
  switch (funding) {
    case 'ei':
      return ['consent', 'ei-authorization'];
    case 'cpse':
      return ['consent', 'district-authorization'];
    case 'insurance':
    case 'medicaid':
      return ['consent', 'insurance-verified', 'physician-referral'];
    default:
      return ['consent'];
  }
}

export const PRIORITY_FACTORS = ['under-three', 'urgent', 'sibling-active', 'mandated'] as const;
export type PriorityFactor = (typeof PRIORITY_FACTORS)[number];
export const PRIORITY_LABEL: Record<PriorityFactor, string> = {
  'under-three': 'Under 3',
  urgent: 'Urgent concern',
  'sibling-active': 'Sibling in care',
  mandated: 'Mandated (EI/CPSE)',
};

export const CALENDAR_SYNC_STATES = ['not-configured', 'pending', 'syncing', 'synced', 'failed'] as const;
export type CalendarSyncState = (typeof CALENDAR_SYNC_STATES)[number];

export const ROLES = ['coordinator', 'therapist', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** A recurring weekly window in practice-local time. day: 0=Sunday … 6=Saturday; start/end: minutes after midnight. */
export interface WeeklyWindow {
  day: number;
  start: number;
  end: number;
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

/** Family-friendly availability bands used by the intake form. */
export const TIME_BANDS = [
  { id: 'morning', label: 'Morning', hint: '8–12', start: 8 * 60, end: 12 * 60 },
  { id: 'midday', label: 'Midday', hint: '12–3', start: 12 * 60, end: 15 * 60 },
  { id: 'afterschool', label: 'After school', hint: '3–6', start: 15 * 60, end: 18 * 60 },
  { id: 'evening', label: 'Evening', hint: '6–7:30', start: 18 * 60, end: 19 * 60 + 30 },
] as const;
