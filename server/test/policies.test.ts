import { describe, expect, it } from 'vitest';
import { assessPriority, deriveStatus, slaState } from '../src/core/policies.ts';
import { addDays, ageInMonths, nextOccurrence, isoDateInZone } from '../src/core/dates.ts';
import { intakeSchema } from '@seeds/shared';

describe('assessPriority', () => {
  const receivedAt = new Date('2026-11-02T15:00:00Z');

  it('stacks boosts and moves the sort key earlier by the boost', () => {
    const r = assessPriority({
      receivedAt,
      receivedDate: '2026-11-02',
      dateOfBirth: '2024-06-01',
      fundingSource: 'ei',
      urgentConcern: true,
      siblingActive: false,
    });
    expect(r.factors).toEqual(['under-three', 'urgent', 'mandated']);
    expect(r.boostDays).toBe(10 + 21 + 7);
    expect(r.queueSortKey.getTime()).toBe(receivedAt.getTime() - 38 * 86_400_000);
    expect(r.targetStartBy).toBe('2026-12-02');
  });

  it('gives no boost to a 6-year-old private-pay referral', () => {
    const r = assessPriority({
      receivedAt,
      receivedDate: '2026-11-02',
      dateOfBirth: '2020-03-15',
      fundingSource: 'private',
      urgentConcern: false,
      siblingActive: false,
    });
    expect(r.boostDays).toBe(0);
    expect(r.targetStartBy).toBe(addDays('2026-11-02', 45));
  });

  it('orders an urgent newer referral ahead of an older routine one', () => {
    const older = assessPriority({ receivedAt: new Date('2026-10-20T12:00:00Z'), receivedDate: '2026-10-20', dateOfBirth: '2019-01-01', fundingSource: 'private', urgentConcern: false, siblingActive: false });
    const newer = assessPriority({ receivedAt: new Date('2026-11-01T12:00:00Z'), receivedDate: '2026-11-01', dateOfBirth: '2019-01-01', fundingSource: 'private', urgentConcern: true, siblingActive: false });
    expect(newer.queueSortKey < older.queueSortKey).toBe(true);
  });
});

describe('deriveStatus', () => {
  it('moves to ready only when funding-specific paperwork is complete', () => {
    const base = { status: 'pending-documents' as const, fundingSource: 'insurance' as const, reviewReason: null };
    expect(deriveStatus({ ...base, completedChecklist: ['consent'] })).toBe('pending-documents');
    expect(deriveStatus({ ...base, completedChecklist: ['consent', 'insurance-verified', 'physician-referral'] })).toBe('pending-documents');
    expect(deriveStatus({ ...base, completedChecklist: ['consent', 'hipaa-ack', 'office-policy', 'insurance-verified', 'physician-referral'] })).toBe('ready');
  });
  it('never overrides a manual status and flags review reasons', () => {
    expect(deriveStatus({ status: 'on-hold', fundingSource: 'private', completedChecklist: ['consent'] })).toBe('on-hold');
    expect(deriveStatus({ status: 'ready', fundingSource: 'private', completedChecklist: ['consent', 'hipaa-ack', 'office-policy'], reviewReason: 'Address not found' })).toBe('needs-review');
  });
});

describe('slaState', () => {
  it('classifies time remaining', () => {
    expect(slaState('2026-12-01', '2026-11-01', 'ready')).toBe('on-track');
    expect(slaState('2026-11-05', '2026-11-01', 'ready')).toBe('at-risk');
    expect(slaState('2026-10-30', '2026-11-01', 'ready')).toBe('breached');
    expect(slaState('2026-10-30', '2026-11-01', 'scheduled')).toBe('met');
  });
});

describe('dates', () => {
  it('computes age in months and next weekday occurrence', () => {
    expect(ageInMonths('2024-11-05', '2026-11-04')).toBe(23);
    expect(ageInMonths('2024-11-04', '2026-11-04')).toBe(24);
    expect(nextOccurrence('2026-11-04', 3)).toBe('2026-11-04'); // Wednesday
    expect(nextOccurrence('2026-11-04', 1)).toBe('2026-11-09');
  });
  it('resolves "today" in the practice time zone, not UTC', () => {
    // 02:30 UTC on Nov 5 is still Nov 4 in New York
    expect(isoDateInZone(new Date('2026-11-05T02:30:00Z'), 'America/New_York')).toBe('2026-11-04');
  });
});

describe('intakeSchema (shared by browser and API)', () => {
  const valid = {
    child: { firstName: 'Mia', lastName: 'Lopez', dateOfBirth: '2023-04-10', preferredLanguage: 'Spanish' },
    guardian: { firstName: 'Ana', lastName: 'Lopez', relationship: 'Mother', phone: '(516) 555-0142', email: 'ana@example.com' },
    address: { line1: '12 Willis Ave', city: 'Mineola', state: 'ny', postalCode: '11501' },
    services: ['speech'],
    concerns: 'Only a few words at 2.5 years old.',
    referralSource: 'pediatrician',
    fundingSource: 'insurance',
    insurance: { payer: 'Aetna', memberId: 'W123456' },
    preferredSetting: 'home',
    acceptsTelehealth: true,
    availability: [{ day: 2, start: 540, end: 720 }],
    consent: { agreed: true, signatureName: 'Ana Lopez' },
  };

  it('accepts a complete submission and normalizes state code', () => {
    const r = intakeSchema.safeParse(valid);
    expect(r.success).toBe(true);
    expect(r.data!.address.state).toBe('NY');
  });

  it('rejects missing insurance member ID, missing consent and missing school address', () => {
    const r = intakeSchema.safeParse({
      ...valid,
      insurance: { payer: 'Aetna' },
      consent: { agreed: false, signatureName: 'A' },
      preferredSetting: 'community',
    });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['insurance.memberId', 'consent.agreed', 'communityLocation']));
  });
});
