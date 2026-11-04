import { describe, expect, it } from 'vitest';
import { intersectWindows, matchCase, planQueue, cloneSchedule, type MatchRequest, type TherapistSchedule } from '../src/core/matching.ts';
import { straightLineEstimator, milesBetween, type GeoPoint } from '../src/core/travel.ts';
import { buildDayRoute } from '../src/core/route.ts';

const travel = straightLineEstimator();
const H = (h: number, m = 0) => h * 60 + m;

const MINEOLA: GeoPoint = { lat: 40.749, lon: -73.6407 };
const GARDEN_CITY: GeoPoint = { lat: 40.7268, lon: -73.6343 };
const ALBERTSON: GeoPoint = { lat: 40.7701, lon: -73.6468 };
const GLEN_COVE: GeoPoint = { lat: 40.8623, lon: -73.6337 };
const HICKSVILLE: GeoPoint = { lat: 40.7684, lon: -73.5251 };

function therapist(overrides: Partial<TherapistSchedule> = {}): TherapistSchedule {
  return {
    therapistId: 't1',
    name: 'Test SLP',
    discipline: 'speech',
    homeBase: MINEOLA,
    maxOneWayTravelMinutes: 30,
    weeklyCapacity: 20,
    settings: ['home', 'community', 'telehealth'],
    languages: ['English'],
    availability: [1, 2, 3, 4, 5].map((day) => ({ day, start: H(8), end: H(17) })),
    visits: [],
    ...overrides,
  };
}

function request(overrides: Partial<MatchRequest> = {}): MatchRequest {
  return {
    caseId: 'c1',
    discipline: 'speech',
    setting: 'home',
    acceptsTelehealth: false,
    location: GARDEN_CITY,
    locationLabel: 'Garden City',
    familyWindows: [{ day: 2, start: H(9), end: H(12) }],
    sessionsPerWeek: 1,
    sessionMinutes: 45,
    preferredLanguage: 'English',
    ...overrides,
  };
}

describe('travel estimator', () => {
  it('estimates short suburban hops in single-digit minutes and treats same address as zero', () => {
    const est = travel.estimate(MINEOLA, GARDEN_CITY);
    expect(milesBetween(MINEOLA, GARDEN_CITY)).toBeGreaterThan(1.4);
    expect(est.minutes).toBeGreaterThan(5);
    expect(est.minutes).toBeLessThan(15);
    expect(travel.estimate(MINEOLA, { ...MINEOLA }).minutes).toBe(0);
  });
});

describe('intersectWindows', () => {
  it('intersects and merges overlapping windows', () => {
    const r = intersectWindows(
      [{ day: 1, start: H(8), end: H(12) }, { day: 1, start: H(13), end: H(17) }],
      [{ day: 1, start: H(11), end: H(14) }, { day: 1, start: H(11, 30), end: H(13, 30) }],
    );
    expect(r).toEqual([[H(11), H(12)], [H(13), H(14)]]);
  });
});

describe('matchCase', () => {
  it('only proposes slots inside both the therapist and family windows', () => {
    const { suggestions } = matchCase(request(), [therapist()], travel);
    expect(suggestions).toHaveLength(1);
    const [slot] = suggestions[0]!.slots;
    expect(slot!.day).toBe(2);
    expect(slot!.start).toBeGreaterThanOrEqual(H(9));
    expect(slot!.end).toBeLessThanOrEqual(H(12));
  });

  it('prefers the therapist already routing nearby over one opening a new route day', () => {
    const busyNearby = therapist({
      therapistId: 'near',
      name: 'Nearby',
      homeBase: HICKSVILLE,
      visits: [{ day: 2, start: H(9), end: H(9, 45), location: GARDEN_CITY, label: 'Garden City' }],
    });
    const idleFar = therapist({ therapistId: 'far', name: 'Idle', homeBase: HICKSVILLE });
    const { suggestions } = matchCase(request({ location: { lat: 40.7275, lon: -73.6352 } }), [idleFar, busyNearby], travel);
    expect(suggestions[0]!.therapistId).toBe('near');
    expect(suggestions[0]!.addedTravelMinutes).toBeLessThan(suggestions[1]!.addedTravelMinutes);
    expect(suggestions[0]!.reasons[0]).toMatch(/Garden City/);
  });

  it('respects drive time between back-to-back visits', () => {
    const t = therapist({
      visits: [{ day: 2, start: H(9), end: H(9, 45), location: GLEN_COVE, label: 'Glen Cove' }],
      maxOneWayTravelMinutes: 60,
    });
    const drive = travel.estimate(GLEN_COVE, GARDEN_CITY).minutes; // ~37 min
    // 9:45–11:00 is too tight once the drive and buffer are counted: the engine must refuse it.
    const tight = matchCase(request({ familyWindows: [{ day: 2, start: H(9, 45), end: H(11) }] }), [t], travel);
    expect(tight.suggestions).toHaveLength(0);

    const { suggestions } = matchCase(request({ familyWindows: [{ day: 2, start: H(9, 45), end: H(12) }] }), [t], travel);
    const slot = suggestions[0]!.slots[0]!;
    expect(slot.start).toBeGreaterThanOrEqual(H(9, 45) + 10 + drive);
    expect(slot.after).toBe('Glen Cove');
  });

  it('never double-books an occupied slot', () => {
    const t = therapist({
      availability: [{ day: 2, start: H(9), end: H(10) }],
      visits: [{ day: 2, start: H(9), end: H(9, 45), location: GARDEN_CITY, label: 'Garden City' }],
    });
    const result = matchCase(request(), [t], travel);
    expect(result.suggestions).toHaveLength(0);
    expect(result.exclusions['No overlapping availability']).toBe(1);
  });

  it('explains exclusions: travel range, caseload, setting', () => {
    const tooFar = therapist({ therapistId: 'a', homeBase: GLEN_COVE, maxOneWayTravelMinutes: 5 });
    const full = therapist({ therapistId: 'b', weeklyCapacity: 0 });
    const clinicOnly = therapist({ therapistId: 'c', settings: ['clinic'] });
    const { suggestions, exclusions } = matchCase(request(), [tooFar, full, clinicOnly], travel);
    expect(suggestions).toHaveLength(0);
    expect(exclusions).toEqual({ 'Outside travel range': 1, 'Caseload full': 1, "Doesn't offer home visits": 1 });
  });

  it('falls back to telehealth when the family accepts it and in-person is impossible', () => {
    const far = therapist({ homeBase: GLEN_COVE, maxOneWayTravelMinutes: 5 });
    const { suggestions } = matchCase(request({ acceptsTelehealth: true }), [far], travel);
    expect(suggestions[0]!.setting).toBe('telehealth');
    expect(suggestions[0]!.addedTravelMinutes).toBe(0);
    expect(suggestions[0]!.reasons.join(' ')).toMatch(/telehealth/);
  });

  it('books multiple sessions per week on distinct days', () => {
    const { suggestions } = matchCase(
      request({
        sessionsPerWeek: 2,
        familyWindows: [1, 2, 4].map((day) => ({ day, start: H(15), end: H(17) })),
      }),
      [therapist()],
      travel,
    );
    const days = suggestions[0]!.slots.map((s) => s.day);
    expect(new Set(days).size).toBe(2);
  });

  it('rewards a language match and sibling continuity', () => {
    const english = therapist({ therapistId: 'en', name: 'English only' });
    const spanish = therapist({ therapistId: 'es', name: 'Bilingual', languages: ['English', 'Spanish'] });
    const r1 = matchCase(request({ preferredLanguage: 'Spanish' }), [english, spanish], travel);
    expect(r1.suggestions[0]!.therapistId).toBe('es');

    const r2 = matchCase(request({ continuityTherapistId: 'en' }), [english, spanish], travel);
    expect(r2.suggestions[0]!.therapistId).toBe('en');
  });
});

describe('planQueue', () => {
  it('reserves slots so two children never get the same slot, and clusters nearby children', () => {
    const t = therapist({ availability: [{ day: 2, start: H(9), end: H(11) }] });
    const a = request({ caseId: 'a', location: GARDEN_CITY, familyWindows: [{ day: 2, start: H(9), end: H(11) }] });
    const b = request({ caseId: 'b', location: { lat: 40.7272, lon: -73.6339 }, familyWindows: [{ day: 2, start: H(9), end: H(11) }] });
    const plan = planQueue([a, b], [cloneSchedule(t)], travel);
    expect(plan.every((p) => p.proposal)).toBe(true);
    const [sa, sb] = plan.map((p) => p.proposal!.slots[0]!);
    expect(sa!.start === sb!.start).toBe(false);
    expect(Math.max(sa!.start, sb!.start)).toBeGreaterThanOrEqual(Math.min(sa!.end, sb!.end) + 10);
    // second child piggybacks on the first child's route: far less added driving than a dedicated trip
    expect(plan[1]!.proposal!.addedTravelMinutes).toBeLessThan(plan[1]!.standaloneMinutes / 2);
  });

  it('gives higher-priority children first pick when capacity is scarce', () => {
    const t = therapist({ weeklyCapacity: 1 });
    const plan = planQueue([request({ caseId: 'urgent' }), request({ caseId: 'later' })], [cloneSchedule(t)], travel);
    expect(plan[0]!.proposal).not.toBeNull();
    expect(plan[1]!.proposal).toBeNull();
    expect(plan[1]!.exclusions['Caseload full']).toBe(1);
  });
});

describe('buildDayRoute', () => {
  it('chains legs from the last physical position and skips drive time for telehealth', () => {
    const route = buildDayRoute(
      MINEOLA,
      'Home base',
      [
        { id: '2', start: H(11), end: H(11, 45), location: ALBERTSON, label: 'Albertson' },
        { id: '1', start: H(9), end: H(9, 45), location: GARDEN_CITY, label: 'Garden City' },
        { id: 't', start: H(10), end: H(10, 30), location: null, label: 'Telehealth' },
      ],
      travel,
    );
    expect(route.legs.map((l) => l.visit.id)).toEqual(['1', 't', '2']);
    expect(route.legs[1]!.driveMinutes).toBe(0);
    expect(route.legs[2]!.fromLabel).toBe('Garden City');
    expect(route.totalDriveMinutes).toBeGreaterThan(route.returnHomeMinutes);
  });
});
