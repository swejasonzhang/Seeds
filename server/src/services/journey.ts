import type mongoose from 'mongoose';
import {
  CHECKLIST_LABEL,
  STATUS_LABEL,
  journeyFor,
  requiredChecklist,
  stepDef,
  type ChecklistItem,
  type FundingSource,
  type JourneyStepDto,
  type JourneySummary,
} from '@seeds/shared';
import { IntakeCase, type CaseDoc } from '../db/models.ts';
import { deriveStatus } from '../core/policies.ts';
import { event } from './mappers.ts';

interface JourneyInput {
  fundingSource: FundingSource;
  completedChecklist: readonly string[];
  checklistLog?: readonly { item?: string | null; at?: Date | null; by?: string | null }[] | null;
}

/**
 * One checklist for everything a child needs before therapy can start: the practice's paperwork, insurance,
 * and (for CPSE/CSE) the school district's special-education steps. Parents, staff and therapists all see the
 * same list; each step says who it's waiting on.
 */
export function buildJourney(c: JourneyInput): JourneySummary {
  const required = new Set(requiredChecklist(c.fundingSource));
  const done = new Set(c.completedChecklist);
  const lastLog = new Map<string, { at?: Date | null; by?: string | null }>();
  for (const entry of c.checklistLog ?? []) if (entry.item) lastLog.set(entry.item, entry);

  const phases = journeyFor(c.fundingSource).map((phase) => ({
    id: phase.id,
    title: phase.title,
    steps: phase.steps.map((id): JourneyStepDto => {
      const def = stepDef(id, c.fundingSource);
      const isDone = done.has(id);
      const familyTurn = def.owner === 'family' || def.owner === 'doctor';
      const log = lastLog.get(id);
      return {
        ...def,
        optional: Boolean(def.optional),
        required: required.has(id),
        status: isDone ? 'done' : familyTurn ? 'todo' : 'waiting',
        completedAt: isDone ? log?.at?.toISOString() : undefined,
        completedBy: isDone ? (log?.by ?? undefined) : undefined,
      };
    }),
  }));

  const steps = phases.flatMap((p) => p.steps);
  const counted = steps.filter((x) => !x.optional);
  return {
    phases,
    done: counted.filter((x) => x.status === 'done').length,
    total: counted.length,
    blocking: steps.filter((x) => x.required && x.status !== 'done'),
    nextForFamily:
      steps.find((x) => x.status === 'todo' && !x.optional) ??
      steps.find((x) => x.status !== 'done' && x.familyAction && !x.optional) ??
      steps.find((x) => x.status !== 'done' && x.familyAction),
  };
}

/** Recompute the automatic pipeline status after any checklist change (e.g. paperwork complete → ready). */
export async function refreshCaseStatus(id: mongoose.Types.ObjectId, now: Date) {
  const c = await IntakeCase.findById(id).lean<CaseDoc>();
  if (!c) return;
  const next = deriveStatus(c);
  if (next !== c.status) {
    await IntakeCase.updateOne(
      { _id: id, status: c.status },
      {
        $set: { status: next },
        $push: {
          events: event(
            'System',
            'status',
            next === 'ready' ? `All required steps complete → ${STATUS_LABEL[next]}` : `${STATUS_LABEL[c.status]} → ${STATUS_LABEL[next]}`,
            now,
          ),
        },
      },
    );
  }
}

export async function setStep(
  caseId: mongoose.Types.ObjectId,
  item: ChecklistItem,
  completed: boolean,
  by: string,
  now: Date,
  note?: string,
) {
  const update = completed
    ? { $addToSet: { completedChecklist: item }, $push: { checklistLog: { item, at: now, by, note }, events: event(by, 'checklist', `${CHECKLIST_LABEL[item]} completed${note ? `: ${note}` : ''}`, now) } }
    : { $pull: { completedChecklist: item }, $push: { events: event(by, 'checklist', `${CHECKLIST_LABEL[item]} marked not done`, now) } };
  await IntakeCase.updateOne({ _id: caseId }, update);
  await refreshCaseStatus(caseId, now);
}
