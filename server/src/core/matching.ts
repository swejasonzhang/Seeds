import { DAY_SHORT, formatMinute, isTravelSetting, type Discipline, type SessionSetting, type WeeklyWindow } from '@seeds/shared';
import { ZERO_TRAVEL, type GeoPoint, type TravelEstimate, type TravelEstimator } from './travel.ts';

export interface MatchingOptions {
  slotGranularityMinutes: number;
  /** Buffer between sessions for notes / hand-off, on top of drive time. */
  minGapMinutes: number;
  maxSuggestions: number;
  clinic: GeoPoint;
  clinicLabel: string;
  /** Cost (in drive-minute equivalents) of a therapist at 100% caseload; spreads load across staff. */
  utilizationWeight: number;
  languageMatchBonus: number;
  continuityBonus: number;
  telehealthFallbackPenalty: number;
}

export const DEFAULT_MATCHING: MatchingOptions = {
  slotGranularityMinutes: 15,
  minGapMinutes: 10,
  maxSuggestions: 5,
  clinic: { lat: 40.7577, lon: -73.6446 },
  clinicLabel: 'Williston Park clinic',
  utilizationWeight: 25,
  languageMatchBonus: 20,
  continuityBonus: 15,
  telehealthFallbackPenalty: 15,
};

export interface MatchRequest {
  caseId: string;
  discipline: Discipline;
  setting: SessionSetting;
  acceptsTelehealth: boolean;
  location: GeoPoint | null;
  locationLabel: string;
  familyWindows: readonly WeeklyWindow[];
  sessionsPerWeek: number;
  sessionMinutes: number;
  preferredLanguage: string;
  /** Therapist already treating a sibling, if any. */
  continuityTherapistId?: string;
}

/** An existing (or tentatively planned) standing weekly visit. location null = telehealth. */
export interface BookedVisit {
  day: number;
  start: number;
  end: number;
  location: GeoPoint | null;
  label: string;
  caseId?: string;
  tentative?: boolean;
}

/** A therapist's week as the engine sees it. `visits` is mutable so queue planning can reserve slots. */
export interface TherapistSchedule {
  therapistId: string;
  name: string;
  discipline: Discipline;
  homeBase: GeoPoint;
  maxOneWayTravelMinutes: number;
  weeklyCapacity: number;
  settings: readonly SessionSetting[];
  languages: readonly string[];
  availability: readonly WeeklyWindow[];
  visits: BookedVisit[];
}

export interface ProposedSlot {
  day: number;
  start: number;
  end: number;
  addedTravelMinutes: number;
  addedMiles: number;
  /** Label of the in-person stop before / after this slot that day, if any. */
  after?: string;
  before?: string;
}

export interface MatchSuggestion {
  therapistId: string;
  therapistName: string;
  setting: SessionSetting;
  visitLocation: GeoPoint | null;
  slots: ProposedSlot[];
  score: number;
  addedTravelMinutes: number;
  addedMiles: number;
  caseloadAfter: number;
  weeklyCapacity: number;
  reasons: string[];
}

export interface MatchResult {
  suggestions: MatchSuggestion[];
  /** Why therapists of the right discipline were ruled out, with counts. Tells coordinators what to change. */
  exclusions: Record<string, number>;
}

export interface QueuePlanEntry {
  request: MatchRequest;
  proposal: MatchSuggestion | null;
  exclusions: Record<string, number>;
  /** Drive minutes if this child were given a dedicated round trip from the therapist's home base. */
  standaloneMinutes: number;
}

export const cloneSchedule = (t: TherapistSchedule): TherapistSchedule => ({ ...t, visits: [...t.visits] });

const dayIndex = (d: number) => (d === 0 ? 7 : d); // Monday-first ordering
const roundUp = (minute: number, step: number) => Math.ceil(minute / step) * step;
const round1 = (n: number) => Math.round(n * 10) / 10;
const add = (a: TravelEstimate, b: TravelEstimate): TravelEstimate => ({ minutes: a.minutes + b.minutes, miles: a.miles + b.miles });
const sub = (a: TravelEstimate, b: TravelEstimate): TravelEstimate => ({ minutes: a.minutes - b.minutes, miles: a.miles - b.miles });

export function intersectWindows(a: readonly WeeklyWindow[], b: readonly WeeklyWindow[]): Array<[number, number]> {
  const raw: Array<[number, number]> = [];
  for (const x of a)
    for (const y of b) {
      const s = Math.max(x.start, y.start);
      const e = Math.min(x.end, y.end);
      if (e > s) raw.push([s, e]);
    }
  raw.sort((p, q) => p[0] - q[0]);
  const merged: Array<[number, number]> = [];
  for (const w of raw) {
    const last = merged.at(-1);
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push([w[0], w[1]]);
  }
  return merged;
}

export function matchCase(
  request: MatchRequest,
  therapists: readonly TherapistSchedule[],
  travel: TravelEstimator,
  options: MatchingOptions = DEFAULT_MATCHING,
): MatchResult {
  const suggestions: MatchSuggestion[] = [];
  const exclusions: Record<string, number> = {};

  for (const therapist of therapists) {
    if (therapist.discipline !== request.discipline) continue;

    let outcome = evaluate(request, therapist, travel, request.setting, false, options);
    if (!outcome.suggestion && request.acceptsTelehealth && request.setting !== 'telehealth') {
      const tele = evaluate(request, therapist, travel, 'telehealth', true, options);
      if (tele.suggestion) outcome = tele;
    }
    if (outcome.suggestion) suggestions.push(outcome.suggestion);
    else if (outcome.exclusion) exclusions[outcome.exclusion] = (exclusions[outcome.exclusion] ?? 0) + 1;
  }

  suggestions.sort(
    (a, b) => b.score - a.score || a.addedTravelMinutes - b.addedTravelMinutes || a.therapistName.localeCompare(b.therapistName),
  );
  return { suggestions: suggestions.slice(0, options.maxSuggestions), exclusions };
}

/**
 * Greedy queue planning: walk the waitlist in priority order and reserve each child's best slot before moving on.
 * The highest-priority children get first pick, and later proposals route around (and cluster with) earlier ones.
 * Mutates the therapists' visit lists: pass clones if the caller needs the originals.
 */
export function planQueue(
  requestsInPriorityOrder: Iterable<MatchRequest>,
  therapists: TherapistSchedule[],
  travel: TravelEstimator,
  options: MatchingOptions = DEFAULT_MATCHING,
): QueuePlanEntry[] {
  const byId = new Map(therapists.map((t) => [t.therapistId, t]));
  const plan: QueuePlanEntry[] = [];
  for (const request of requestsInPriorityOrder) {
    const result = matchCase(request, therapists, travel, options);
    const best = result.suggestions[0] ?? null;
    let standaloneMinutes = 0;
    if (best) {
      const t = byId.get(best.therapistId)!;
      for (const slot of best.slots) {
        t.visits.push({
          day: slot.day,
          start: slot.start,
          end: slot.end,
          location: best.visitLocation,
          label: request.locationLabel,
          caseId: request.caseId,
          tentative: true,
        });
      }
      if (best.visitLocation && isTravelSetting(best.setting)) {
        const oneWay = travel.estimate(t.homeBase, best.visitLocation).minutes;
        standaloneMinutes = oneWay * 2 * best.slots.length;
      }
    }
    plan.push({ request, proposal: best, exclusions: result.exclusions, standaloneMinutes });
  }
  return plan;
}

function evaluate(
  request: MatchRequest,
  therapist: TherapistSchedule,
  travel: TravelEstimator,
  setting: SessionSetting,
  telehealthFallback: boolean,
  options: MatchingOptions,
): { suggestion?: MatchSuggestion; exclusion?: string } {
  if (!therapist.settings.includes(setting)) return { exclusion: `Doesn't offer ${settingNoun(setting)}` };

  const travels = isTravelSetting(setting);
  const location: GeoPoint | null = travels ? request.location : setting === 'clinic' ? options.clinic : null;
  if (travels && !location) return { exclusion: 'Session address not located' };
  if (travels && travel.estimate(therapist.homeBase, location!).minutes > therapist.maxOneWayTravelMinutes) {
    return { exclusion: 'Outside travel range' };
  }
  if (therapist.weeklyCapacity - therapist.visits.length < request.sessionsPerWeek) return { exclusion: 'Caseload full' };

  const bestPerDay: Array<{ slot: ProposedSlot; cost: number }> = [];
  for (const day of new Set(request.familyWindows.map((w) => w.day))) {
    const best = bestSlotOnDay(request, therapist, travel, day, location, options);
    if (best) bestPerDay.push(best);
  }
  if (bestPerDay.length === 0) return { exclusion: 'No overlapping availability' };
  if (bestPerDay.length < request.sessionsPerWeek) return { exclusion: 'Not enough open days' };

  const chosen = bestPerDay
    .sort((a, b) => a.cost - b.cost || dayIndex(a.slot.day) - dayIndex(b.slot.day))
    .slice(0, request.sessionsPerWeek)
    .map((x) => x.slot)
    .sort((a, b) => dayIndex(a.day) - dayIndex(b.day));

  const addedMinutes = chosen.reduce((s, x) => s + x.addedTravelMinutes, 0);
  const addedMiles = chosen.reduce((s, x) => s + x.addedMiles, 0);
  const caseloadAfter = therapist.visits.length + request.sessionsPerWeek;
  const utilization = caseloadAfter / Math.max(1, therapist.weeklyCapacity);

  const reasons = chosen.map((s) => describeSlot(s, setting));
  let cost = addedMinutes / request.sessionsPerWeek + options.utilizationWeight * utilization;

  const lang = request.preferredLanguage.trim();
  if (lang && lang.toLowerCase() !== 'english' && therapist.languages.some((l) => l.toLowerCase() === lang.toLowerCase())) {
    cost -= options.languageMatchBonus;
    reasons.push(`Speaks ${lang}`);
  }
  if (request.continuityTherapistId === therapist.therapistId) {
    cost -= options.continuityBonus;
    reasons.push('Already treats a sibling (continuity of care)');
  }
  if (telehealthFallback) {
    cost += options.telehealthFallbackPenalty;
    reasons.push('In-person not possible; offered as telehealth');
  }
  reasons.push(`Caseload ${caseloadAfter}/${therapist.weeklyCapacity} after booking`);

  return {
    suggestion: {
      therapistId: therapist.therapistId,
      therapistName: therapist.name,
      setting,
      visitLocation: location,
      slots: chosen,
      score: Math.round(Math.min(100, Math.max(1, 100 - cost))),
      addedTravelMinutes: round1(addedMinutes),
      addedMiles: round1(addedMiles),
      caseloadAfter,
      weeklyCapacity: therapist.weeklyCapacity,
      reasons,
    },
  };
}

/**
 * Find the cheapest feasible start time on one weekday. The model: in-person visits happen at their address;
 * telehealth sessions happen wherever the therapist currently is. A slot is feasible when the therapist can finish
 * the previous visit, buffer, drive here, run the session, buffer, and still reach the next in-person visit on time.
 * Cost is marginal driving: d(prev→here) + d(here→next) − d(prev→next), with "home base" at either end of the day.
 */
function bestSlotOnDay(
  request: MatchRequest,
  therapist: TherapistSchedule,
  travel: TravelEstimator,
  day: number,
  here: GeoPoint | null,
  options: MatchingOptions,
): { slot: ProposedSlot; cost: number } | null {
  const duration = request.sessionMinutes;
  const gap = options.minGapMinutes;
  const step = options.slotGranularityMinutes;
  const visits = therapist.visits.filter((v) => v.day === day).sort((a, b) => a.start - b.start);
  const windows = intersectWindows(
    therapist.availability.filter((a) => a.day === day),
    request.familyWindows.filter((w) => w.day === day),
  );

  let best: { slot: ProposedSlot; cost: number } | null = null;
  for (const [windowStart, windowEnd] of windows) {
    for (let start = roundUp(windowStart, step); start + duration <= windowEnd; start += step) {
      const end = start + duration;
      if (visits.some((v) => v.start < end && v.end > start)) continue;

      const prev = visits.findLast((v) => v.end <= start);
      const next = visits.find((v) => v.start >= end);
      const prevPhysical = visits.findLast((v) => v.end <= start && v.location);
      const nextPhysical = visits.find((v) => v.start >= end && v.location);
      const posBefore = prevPhysical?.location ?? therapist.homeBase;
      const posAfter = nextPhysical?.location ?? therapist.homeBase;
      const newPosition = here ?? posBefore;

      const inbound = here ? travel.estimate(posBefore, here) : ZERO_TRAVEL;
      if (prev && prev.end + gap + inbound.minutes > start) continue;
      if (next && end + gap > next.start) continue;
      if (nextPhysical) {
        // After this session the therapist stays put through any telehealth visits, then drives on.
        const lastBusyEnd = Math.max(
          end,
          ...visits.filter((v) => v.start >= end && v.end <= nextPhysical.start && !v.location).map((v) => v.end),
        );
        const onward = travel.estimate(newPosition, nextPhysical.location!);
        if (lastBusyEnd + gap + onward.minutes > nextPhysical.start) continue;
      }

      const added = here
        ? sub(add(travel.estimate(posBefore, here), travel.estimate(here, posAfter)), travel.estimate(posBefore, posAfter))
        : ZERO_TRAVEL;
      const idle = (prev ? start - prev.end : 0) + (next ? next.start - end : 0);
      const cost = Math.max(0, added.minutes) + 0.01 * idle; // tiny idle penalty packs the day tighter on ties

      if (!best || cost < best.cost) {
        best = {
          cost,
          slot: {
            day,
            start,
            end,
            addedTravelMinutes: round1(Math.max(0, added.minutes)),
            addedMiles: round1(Math.max(0, added.miles)),
            after: prevPhysical?.label,
            before: nextPhysical?.label,
          },
        };
      }
    }
  }
  return best;
}

function describeSlot(s: ProposedSlot, setting: SessionSetting): string {
  const when = `${DAY_SHORT[s.day]} ${formatMinute(s.start)}`;
  if (setting === 'telehealth') return `${when}: telehealth, no drive time`;
  const drive = `+${Math.round(s.addedTravelMinutes)} min drive`;
  if (s.after && s.before) {
    return s.after === s.before
      ? `${when}: right next to an existing visit in ${s.after} (${drive})`
      : `${when}: fits between visits in ${s.after} and ${s.before} (${drive})`;
  }
  if (s.after) return `${when}: follows a visit in ${s.after} (${drive})`;
  if (s.before) return `${when}: before a visit in ${s.before} (${drive})`;
  return `${when}: opens a new route day (${drive} round trip)`;
}

function settingNoun(s: SessionSetting): string {
  switch (s) {
    case 'home':
      return 'home visits';
    case 'community':
      return 'school/daycare visits';
    case 'clinic':
      return 'clinic sessions';
    default:
      return 'telehealth';
  }
}
