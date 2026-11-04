export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface TravelEstimate {
  minutes: number;
  miles: number;
}

export const ZERO_TRAVEL: TravelEstimate = Object.freeze({ minutes: 0, miles: 0 });

const EARTH_RADIUS_MILES = 3958.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function milesBetween(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** ~1 m precision key, stable for use as a Map key. */
export const pointKey = (p: GeoPoint) => `${Math.round(p.lat * 1e5)},${Math.round(p.lon * 1e5)}`;
export const pairKey = (from: GeoPoint, to: GeoPoint) => `${pointKey(from)}>${pointKey(to)}`;

/** Synchronous point-to-point estimate. Must be cheap: the matching engine calls it in tight loops. */
export interface TravelEstimator {
  estimate(from: GeoPoint, to: GeoPoint): TravelEstimate;
}

export interface TravelModelOptions {
  /** Road distance ÷ straight-line distance; ~1.3 for suburban street grids. */
  circuityFactor: number;
  /** Door-to-door average speed on Nassau County local roads during school-day traffic. */
  averageMph: number;
  /** Parking, walking to the door, check-in. */
  stopOverheadMinutes: number;
}

export const DEFAULT_TRAVEL_MODEL: TravelModelOptions = {
  circuityFactor: 1.3,
  averageMph: 22,
  stopOverheadMinutes: 4,
};

/**
 * Offline heuristic: haversine × circuity at an average speed. Used for coarse screening of all therapists,
 * and as the fallback whenever Azure Maps isn't configured or a matrix cell is missing.
 */
export function straightLineEstimator(options: TravelModelOptions = DEFAULT_TRAVEL_MODEL): TravelEstimator {
  return {
    estimate(from, to) {
      const straight = milesBetween(from, to);
      if (straight < 0.05) return ZERO_TRAVEL; // same address: siblings, back-to-back at one school
      const road = straight * options.circuityFactor;
      return { minutes: (road / options.averageMph) * 60 + options.stopOverheadMinutes, miles: road };
    },
  };
}

/** Estimator backed by a precomputed route matrix (Azure Maps), with a fallback for unknown pairs. */
export function matrixEstimator(
  matrix: ReadonlyMap<string, TravelEstimate>,
  fallback: TravelEstimator,
): TravelEstimator & { knownPairs: number } {
  return {
    knownPairs: matrix.size,
    estimate(from, to) {
      if (pointKey(from) === pointKey(to)) return ZERO_TRAVEL;
      return matrix.get(pairKey(from, to)) ?? fallback.estimate(from, to);
    },
  };
}
