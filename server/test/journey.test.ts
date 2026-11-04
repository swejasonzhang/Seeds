import { describe, expect, it } from 'vitest';
import { buildJourney } from '../src/services/journey.ts';
import { journeyFor, requiredChecklist } from '@seeds/shared';

describe('family journey', () => {
  it('gives a K-12 CSE family the district special-education steps in order', () => {
    const steps = journeyFor('cse').flatMap((p) => p.steps);
    expect(steps).toEqual([
      'consent', 'hipaa-ack', 'office-policy', 'prior-reports',
      'district-referral', 'evaluation-consent', 'district-evaluation', 'iep-meeting', 'district-authorization',
    ]);
    expect(requiredChecklist('cse')).toContain('district-authorization');
  });

  it('gives an insurance family the coverage steps and no district steps', () => {
    const ids = journeyFor('insurance').flatMap((p) => p.steps);
    expect(ids).toContain('physician-referral');
    expect(ids).not.toContain('iep-meeting');
  });

  it('reports progress, who completed each step, what blocks scheduling and the family’s next action', () => {
    const at = new Date('2026-11-01T15:00:00Z');
    const j = buildJourney({
      fundingSource: 'cpse',
      completedChecklist: ['consent', 'hipaa-ack', 'district-referral'],
      checklistLog: [{ item: 'district-referral', at, by: 'Ana Lopez (parent)' }],
    });
    expect(j.total).toBe(8); // prior-reports is optional and not counted
    expect(j.done).toBe(3);
    expect(j.blocking.map((s) => s.id)).toEqual(['office-policy', 'district-authorization']);
    expect(j.nextForFamily?.id).toBe('office-policy');
    const referral = j.phases.flatMap((p) => p.steps).find((s) => s.id === 'district-referral')!;
    expect(referral.completedBy).toBe('Ana Lopez (parent)');
    expect(referral.title).toMatch(/CPSE/);
    const evaluation = j.phases.flatMap((p) => p.steps).find((s) => s.id === 'district-evaluation')!;
    expect(evaluation.status).toBe('waiting'); // on the district, not the family
    expect(evaluation.timeline).toMatch(/60 calendar days/);
  });
});
