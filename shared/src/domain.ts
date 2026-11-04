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

export const FUNDING_SOURCES = ['ei', 'cpse', 'cse', 'insurance', 'medicaid', 'private'] as const;
export type FundingSource = (typeof FUNDING_SOURCES)[number];
export const FUNDING_LABEL: Record<FundingSource, string> = {
  ei: 'Early Intervention (county, birth–3)',
  cpse: 'CPSE (school district, ages 3–5)',
  cse: 'CSE (school district, K–12)',
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

// ---------- the family's journey: one checklist for practice paperwork, coverage and the school district ----------

export const CHECKLIST_ITEMS = [
  'consent',
  'hipaa-ack',
  'office-policy',
  'prior-reports',
  'insurance-card',
  'physician-referral',
  'insurance-verified',
  'district-referral',
  'evaluation-consent',
  'district-evaluation',
  'iep-meeting',
  'district-authorization',
  'ei-authorization',
] as const;
export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

export type StepOwner = 'family' | 'seeds' | 'district' | 'doctor';
export const OWNER_LABEL: Record<StepOwner, string> = {
  family: 'You',
  seeds: 'SEEDS',
  district: 'School district',
  doctor: 'Your doctor',
};

export const DOCUMENT_KINDS = ['insurance-card', 'physician-referral', 'iep', 'evaluation', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  'insurance-card': 'Insurance card',
  'physician-referral': 'Doctor’s referral / prescription',
  iep: 'IEP or district authorization',
  evaluation: 'Prior evaluation or report',
  other: 'Other document',
};
/** Uploading one of these completes the matching checklist step automatically. */
export const DOCUMENT_COMPLETES: Partial<Record<DocumentKind, ChecklistItem>> = {
  'insurance-card': 'insurance-card',
  'physician-referral': 'physician-referral',
  iep: 'district-authorization',
  evaluation: 'prior-reports',
};

export interface StepDef {
  id: ChecklistItem;
  title: string;
  description: string;
  owner: StepOwner;
  /** What the parent can do in the portal (district steps: the parent reports progress we can't see). */
  familyAction?: 'sign' | 'upload' | 'confirm';
  documentKind?: DocumentKind;
  /** Typical New York State timeline, shown as guidance; families should confirm with their district. */
  timeline?: string;
  optional?: boolean;
}

type Committee = 'CSE' | 'CPSE';
const committeeFor = (f: FundingSource): Committee => (f === 'cpse' ? 'CPSE' : 'CSE');

export function stepDef(id: ChecklistItem, funding: FundingSource): StepDef {
  const c = committeeFor(funding);
  switch (id) {
    case 'consent':
      return { id, owner: 'family', familyAction: 'sign', title: 'Consent to treat', description: 'Signed with your online intake form.' };
    case 'hipaa-ack':
      return { id, owner: 'family', familyAction: 'sign', title: 'HIPAA privacy notice', description: 'Read how we protect your child’s health information and acknowledge it.' };
    case 'office-policy':
      return { id, owner: 'family', familyAction: 'sign', title: 'Office policy agreement', description: '24-hour cancellation notice, attendance and teletherapy rules.' };
    case 'prior-reports':
      return { id, owner: 'family', familyAction: 'upload', documentKind: 'evaluation', optional: true, title: 'Prior evaluations & reports', description: 'Evaluations or reports from the last 12 months help your therapist prepare.' };
    case 'insurance-card':
      return { id, owner: 'family', familyAction: 'upload', documentKind: 'insurance-card', title: 'Insurance card', description: 'A photo of the front and back of the card.' };
    case 'physician-referral':
      return { id, owner: 'doctor', familyAction: 'upload', documentKind: 'physician-referral', title: 'Doctor’s referral / prescription', description: 'Many plans require a prescription for therapy. Ask your pediatrician, then upload it here.' };
    case 'insurance-verified':
      return { id, owner: 'seeds', title: 'Benefits verified', description: 'Our front desk confirms your coverage, copays and any visit limits.', timeline: 'Usually 1–3 business days' };
    case 'district-referral':
      return {
        id,
        owner: 'family',
        familyAction: 'confirm',
        title: `Written referral to your district’s ${c}`,
        description:
          c === 'CPSE'
            ? 'Register your child with your school district, then send a dated, written request for an evaluation to the CPSE chairperson.'
            : 'Send a dated, written request for an evaluation to your school district’s CSE chairperson (a parent, teacher or doctor can refer).',
        timeline: c === 'CSE' ? 'District must respond within 10 school days' : 'District sends consent forms and a list of approved evaluators',
      };
    case 'evaluation-consent':
      return {
        id,
        owner: 'family',
        familyAction: 'confirm',
        title: 'Sign the district’s consent for evaluation',
        description: c === 'CPSE' ? 'Sign consent and choose a county-approved evaluator. The 60-day clock starts here.' : 'Nothing happens until you sign. The 60-day evaluation clock starts here.',
      };
    case 'district-evaluation':
      return { id, owner: 'district', familyAction: 'confirm', title: 'Evaluation completed', description: 'Speech, OT and other evaluations by the district or an approved evaluator.', timeline: 'Within 60 calendar days of your consent' };
    case 'iep-meeting':
      return {
        id,
        owner: 'district',
        familyAction: 'confirm',
        title: `${c} meeting & IEP`,
        description: `The ${c} decides eligibility and writes an IEP listing services. You’ll get notice at least 5 days before.`,
        timeline: c === 'CSE' ? 'IEP in place within 60 school days of consent' : 'Meeting within 60 calendar days of consent',
      };
    case 'district-authorization':
      return { id, owner: 'family', familyAction: 'upload', documentKind: 'iep', title: 'Share the IEP / authorization', description: `Upload the IEP or ${c} authorization naming speech or OT so we can schedule sessions.` };
    case 'ei-authorization':
      return { id, owner: 'family', familyAction: 'upload', documentKind: 'iep', title: 'Early Intervention authorization', description: 'The IFSP authorization from your county EI official.' };
  }
}

export type JourneyPhaseId = 'paperwork' | 'coverage' | 'district';

/** Which steps apply to a child, grouped into phases, based on how services are funded. */
export function journeyFor(funding: FundingSource): { id: JourneyPhaseId; title: string; steps: ChecklistItem[] }[] {
  const phases: { id: JourneyPhaseId; title: string; steps: ChecklistItem[] }[] = [
    { id: 'paperwork', title: 'Paperwork', steps: ['consent', 'hipaa-ack', 'office-policy', 'prior-reports'] },
  ];
  if (funding === 'insurance' || funding === 'medicaid') {
    phases.push({ id: 'coverage', title: 'Insurance', steps: ['insurance-card', 'physician-referral', 'insurance-verified'] });
  }
  if (funding === 'cpse' || funding === 'cse') {
    phases.push({
      id: 'district',
      title: funding === 'cpse' ? 'Preschool special education (CPSE)' : 'School district special education (CSE)',
      steps: ['district-referral', 'evaluation-consent', 'district-evaluation', 'iep-meeting', 'district-authorization'],
    });
  }
  if (funding === 'ei') phases.push({ id: 'coverage', title: 'Early Intervention', steps: ['ei-authorization'] });
  return phases;
}

/** The subset that must be complete before a child can be scheduled. */
export function requiredChecklist(funding: FundingSource): ChecklistItem[] {
  const base: ChecklistItem[] = ['consent', 'hipaa-ack', 'office-policy'];
  switch (funding) {
    case 'ei':
      return [...base, 'ei-authorization'];
    case 'cpse':
    case 'cse':
      return [...base, 'district-authorization'];
    case 'insurance':
    case 'medicaid':
      return [...base, 'physician-referral', 'insurance-verified'];
    default:
      return base;
  }
}

export const CHECKLIST_LABEL = Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i, stepDef(i, 'cse').title])) as Record<ChecklistItem, string>;
CHECKLIST_LABEL['district-referral'] = 'District referral';
CHECKLIST_LABEL['iep-meeting'] = 'CSE/CPSE meeting & IEP';
CHECKLIST_LABEL['district-authorization'] = 'IEP / authorization';

export const PRIORITY_FACTORS = ['under-three', 'urgent', 'sibling-active', 'mandated'] as const;
export type PriorityFactor = (typeof PRIORITY_FACTORS)[number];
export const PRIORITY_LABEL: Record<PriorityFactor, string> = {
  'under-three': 'Under 3',
  urgent: 'Urgent concern',
  'sibling-active': 'Sibling in care',
  mandated: 'Mandated (CPSE/CSE)',
};

export const CALENDAR_SYNC_STATES = ['not-configured', 'pending', 'syncing', 'synced', 'failed'] as const;
export type CalendarSyncState = (typeof CALENDAR_SYNC_STATES)[number];

export const ROLES = ['coordinator', 'therapist', 'admin', 'parent'] as const;
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
