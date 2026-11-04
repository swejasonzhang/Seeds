import type { GeoPoint, TravelEstimator } from './travel.ts';

export interface RouteVisit {
  id: string;
  start: number;
  end: number;
  location: GeoPoint | null;
  label: string;
}

export interface RouteLeg<T extends RouteVisit> {
  visit: T;
  fromLabel: string;
  driveMinutes: number;
  driveMiles: number;
}

/** Ordered itinerary for one day: each in-person stop is reached from the therapist's last physical position. */
export function buildDayRoute<T extends RouteVisit>(
  home: GeoPoint,
  homeLabel: string,
  visits: readonly T[],
  travel: TravelEstimator,
) {
  const ordered = [...visits].sort((a, b) => a.start - b.start);
  let position = home;
  let positionLabel = homeLabel;
  let totalMinutes = 0;
  let totalMiles = 0;
  const legs: RouteLeg<T>[] = [];

  for (const visit of ordered) {
    if (!visit.location) {
      legs.push({ visit, fromLabel: positionLabel, driveMinutes: 0, driveMiles: 0 });
      continue;
    }
    const leg = travel.estimate(position, visit.location);
    legs.push({ visit, fromLabel: positionLabel, driveMinutes: Math.round(leg.minutes), driveMiles: Math.round(leg.miles * 10) / 10 });
    totalMinutes += leg.minutes;
    totalMiles += leg.miles;
    position = visit.location;
    positionLabel = visit.label;
  }

  const back = legs.some((l) => l.visit.location) ? travel.estimate(position, home) : { minutes: 0, miles: 0 };
  totalMinutes += back.minutes;
  totalMiles += back.miles;

  return {
    legs,
    returnHomeMinutes: Math.round(back.minutes),
    totalDriveMinutes: Math.round(totalMinutes),
    totalDriveMiles: Math.round(totalMiles * 10) / 10,
  };
}
