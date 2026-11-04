import {
  MANUAL_STATUSES,
  requiredChecklist,
  type CaseStatus,
  type ChecklistItem,
  type FundingSource,
  type PriorityFactor,
  type SlaState,
} from '@seeds/shared';
import { addDays, ageInMonths, daysBetween } from './dates.ts';

/**
 * Tunable queue rules. These defaults are a starting point: the clinical director should own the numbers, and the
 * regulatory targets should be checked against current NYS DOH (Early Intervention) and NYSED (CPSE) requirements.
 */
export interface PriorityOptions {
  underThreeBoostDays: number;
  urgentBoostDays: number;
  siblingActiveBoostDays: number;
  mandatedBoostDays: number;
  targetDays: Record<'ei' | 'cpse' | 'default', number>;
  /** SLA turns "at risk" when this many days or fewer remain. */
  atRiskWithinDays: number;
}

export const DEFAULT_PRIORITY: PriorityOptions = {
  underThreeBoostDays: 10,
  urgentBoostDays: 21,
  siblingActiveBoostDays: 5,
  mandatedBoostDays: 7,
  targetDays: { ei: 30, cpse: 30, default: 45 },
  atRiskWithinDays: 7,
};

export interface PriorityInput {
  receivedAt: Date;
  receivedDate: string;
  dateOfBirth: string;
  fundingSource: FundingSource;
  urgentConcern: boolean;
  siblingActive: boolean;
}

export interface PriorityAssessment {
  /**
   * receivedAt minus boost days. Sorting the queue by this ascending gives priority order, and wait-time aging is
   * implicit, so there is no nightly re-scoring job and the sort is served directly from a compound index.
   */
  queueSortKey: Date;
  boostDays: number;
  factors: PriorityFactor[];
  targetStartBy: string;
}

export function assessPriority(input: PriorityInput, options: PriorityOptions = DEFAULT_PRIORITY): PriorityAssessment {
  const factors: PriorityFactor[] = [];
  let boost = 0;

  if (ageInMonths(input.dateOfBirth, input.receivedDate) < 36) {
    factors.push('under-three');
    boost += options.underThreeBoostDays;
  }
  if (input.urgentConcern) {
    factors.push('urgent');
    boost += options.urgentBoostDays;
  }
  if (input.siblingActive) {
    factors.push('sibling-active');
    boost += options.siblingActiveBoostDays;
  }
  if (input.fundingSource === 'ei' || input.fundingSource === 'cpse') {
    factors.push('mandated');
    boost += options.mandatedBoostDays;
  }

  const target =
    input.fundingSource === 'ei'
      ? options.targetDays.ei
      : input.fundingSource === 'cpse'
        ? options.targetDays.cpse
        : options.targetDays.default;

  return {
    queueSortKey: new Date(input.receivedAt.getTime() - boost * 24 * 3600 * 1000),
    boostDays: boost,
    factors,
    targetStartBy: addDays(input.receivedDate, target),
  };
}

export function missingChecklist(funding: FundingSource, completed: readonly string[]): ChecklistItem[] {
  return requiredChecklist(funding).filter((i) => !completed.includes(i));
}

/** Automatic pipeline status. Statuses a human chose (scheduled, on-hold, closed) are never overridden. */
export function deriveStatus(c: {
  status: CaseStatus;
  reviewReason?: string | null;
  fundingSource: FundingSource;
  completedChecklist: readonly string[];
}): CaseStatus {
  if (MANUAL_STATUSES.includes(c.status)) return c.status;
  if (c.reviewReason) return 'needs-review';
  return missingChecklist(c.fundingSource, c.completedChecklist).length > 0 ? 'pending-documents' : 'ready';
}

export function slaState(
  targetStartBy: string,
  today: string,
  status: CaseStatus,
  atRiskWithinDays = DEFAULT_PRIORITY.atRiskWithinDays,
): SlaState {
  if (status === 'scheduled' || status === 'closed') return 'met';
  const remaining = daysBetween(today, targetStartBy);
  if (remaining < 0) return 'breached';
  return remaining <= atRiskWithinDays ? 'at-risk' : 'on-track';
}
