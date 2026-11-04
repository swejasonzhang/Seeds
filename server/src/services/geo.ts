import type { TravelSource } from '@seeds/shared';
import {
  matrixEstimator,
  pairKey,
  straightLineEstimator,
  type GeoPoint,
  type TravelEstimate,
  type TravelEstimator,
  type TravelModelOptions,
} from '../core/travel.ts';
import { AzureMapsClient, uniquePoints, type AzureMapsAuth } from './azureMaps.ts';
import { ZIP_CENTROIDS } from './zipCentroids.ts';
import type { Logger } from 'pino';

export interface Address {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface GeocodeResult {
  point: GeoPoint;
  precision: string;
}

export interface Geocoder {
  geocode(address: Address): Promise<GeocodeResult | null>;
}

/** Deterministic 32-bit string hash (FNV-1a). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Offline fallback: ZIP centroid, spread deterministically by street address (≈ ±0.6 mi) so different families in
 * the same ZIP don't collapse onto one point. Labeled "zip-approx" so coordinators know estimates are rough.
 */
export const zipGeocoder: Geocoder = {
  async geocode(address) {
    const zip = ZIP_CENTROIDS[address.postalCode];
    if (!zip) return null;
    const h = hash(address.line1.trim().toLowerCase());
    const dLat = (((h & 0xffff) / 0xffff) * 2 - 1) * 0.008;
    const dLon = ((((h >>> 16) & 0xffff) / 0xffff) * 2 - 1) * 0.011;
    return { point: { lat: zip.lat + dLat, lon: zip.lon + dLon }, precision: 'zip-approx' };
  },
};

export function createGeocoder(maps: AzureMapsAuth, log: Logger): Geocoder {
  if (!AzureMapsClient.isConfigured(maps)) return zipGeocoder;
  const client = new AzureMapsClient(maps);
  return {
    async geocode(address) {
      try {
        const hit = await client.geocode(address);
        if (hit) return { point: hit.point, precision: hit.precision };
      } catch (err) {
        log.warn({ err }, 'Azure Maps geocode failed; falling back to ZIP centroid');
      }
      return zipGeocoder.geocode(address);
    },
  };
}

export interface TravelService {
  source: TravelSource;
  /** Cheap heuristic for screening every therapist. */
  screening: TravelEstimator;
  /** Real drive times among a small set of points (≤ 50). Falls back to screening on any failure. */
  refine(points: Iterable<GeoPoint>): Promise<TravelEstimator>;
}

const MAX_MATRIX_POINTS = 50; // 50 × 50 = 2,500 cells: the sync Route Matrix limit
const CACHE_TTL_MS = 24 * 3600 * 1000;
const CACHE_MAX = 50_000;

export function createTravelService(maps: AzureMapsAuth, model: TravelModelOptions, log: Logger, client?: AzureMapsClient): TravelService {
  const screening = straightLineEstimator(model);
  if (!client && !AzureMapsClient.isConfigured(maps)) {
    return { source: 'estimate', screening, refine: async () => screening };
  }
  const maps$ = client ?? new AzureMapsClient(maps);
  // Drive times between fixed addresses barely change day to day; caching keeps Azure Maps cost and latency flat
  // as the caseload grows. (Per instance; swap for Render Key Value / Azure Cache for Redis when running many.)
  const cache = new Map<string, { value: TravelEstimate; expires: number }>();

  return {
    source: 'azure-maps',
    screening,
    async refine(input) {
      const points = uniquePoints(input).slice(0, MAX_MATRIX_POINTS);
      const now = Date.now();
      const known = new Map<string, TravelEstimate>();
      let missing = false;
      for (const a of points)
        for (const b of points) {
          if (a === b) continue;
          const hit = cache.get(pairKey(a, b));
          if (hit && hit.expires > now) known.set(pairKey(a, b), hit.value);
          else missing = true;
        }
      if (missing && points.length > 1) {
        try {
          const fresh = await maps$.routeMatrix(points, points);
          for (const [k, v] of fresh) {
            known.set(k, v);
            cache.set(k, { value: v, expires: now + CACHE_TTL_MS });
          }
          while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
        } catch (err) {
          log.warn({ err }, 'Azure Maps route matrix failed; using estimates');
        }
      }
      return matrixEstimator(known, screening);
    },
  };
}
