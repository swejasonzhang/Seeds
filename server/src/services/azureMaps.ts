import { DefaultAzureCredential, type TokenCredential } from '@azure/identity';
import { pairKey, pointKey, type GeoPoint, type TravelEstimate } from '../core/travel.ts';

const ATLAS = 'https://atlas.microsoft.com';
const API_VERSION = '2025-01-01';

export interface AzureMapsAuth {
  key?: string;
  /** Azure Maps account client ID, for Microsoft Entra (keyless) auth via managed identity / service principal. */
  clientId?: string;
}

export interface GeocodeHit {
  point: GeoPoint;
  precision: string;
  confidence: string;
  formatted?: string;
}

/** Thin client for the two Azure Maps REST APIs we use. Accepts an injectable fetch for tests. */
export class AzureMapsClient {
  private readonly credential?: TokenCredential;

  constructor(
    private readonly auth: AzureMapsAuth,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!auth.key && auth.clientId) this.credential = new DefaultAzureCredential();
  }

  static isConfigured(auth: AzureMapsAuth) {
    return Boolean(auth.key || auth.clientId);
  }

  private async headers(): Promise<Record<string, string>> {
    if (this.auth.key) return { 'subscription-key': this.auth.key };
    const token = await this.credential!.getToken('https://atlas.microsoft.com/.default');
    return { Authorization: `Bearer ${token!.token}`, 'x-ms-client-id': this.auth.clientId! };
  }

  /** Get Geocoding (2025-01-01). Returns null for no/low-confidence matches. */
  async geocode(address: { line1: string; city: string; state: string; postalCode: string }): Promise<GeocodeHit | null> {
    const params = new URLSearchParams({
      'api-version': API_VERSION,
      addressLine: address.line1,
      locality: address.city,
      adminDistrict: address.state,
      postalCode: address.postalCode,
      countryRegion: 'US',
      top: '1',
    });
    const res = await this.fetchImpl(`${ATLAS}/geocode?${params}`, { headers: await this.headers() });
    if (!res.ok) throw new Error(`Azure Maps geocode failed: HTTP ${res.status}`);
    const body = (await res.json()) as GeocodingResponse;
    const feature = body.features?.[0];
    if (!feature || feature.properties?.confidence === 'Low') return null;
    // Prefer the "Route" geocode point (e.g. the driveway, not the middle of a parcel) for drive-time math.
    const routePoint = feature.properties?.geocodePoints?.find((g) => g.usageTypes?.includes('Route'));
    const coords = routePoint?.geometry?.coordinates ?? feature.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    return {
      point: { lat: coords[1]!, lon: coords[0]! },
      precision: routePoint?.calculationMethod ?? feature.properties?.type ?? 'Unknown',
      confidence: feature.properties?.confidence ?? 'Unknown',
      formatted: feature.properties?.address?.formattedAddress,
    };
  }

  /**
   * Post Route Matrix (sync, 2025-01-01). Historical traffic with departAt=any allows up to 2,500 cells per call.
   * Returns a map keyed by pairKey(origin, destination).
   */
  async routeMatrix(origins: GeoPoint[], destinations: GeoPoint[]): Promise<Map<string, TravelEstimate>> {
    if (origins.length * destinations.length > 2500) throw new Error('Route matrix exceeds 2,500 cells');
    const body = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: origins.map((p) => [p.lon, p.lat]) }, properties: { pointType: 'origins' } },
        { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: destinations.map((p) => [p.lon, p.lat]) }, properties: { pointType: 'destinations' } },
      ],
      travelMode: 'driving',
      traffic: 'historical',
    };
    const res = await this.fetchImpl(`${ATLAS}/route/matrix?api-version=${API_VERSION}`, {
      method: 'POST',
      headers: { ...(await this.headers()), 'Content-Type': 'application/geo+json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Azure Maps route matrix failed: HTTP ${res.status}`);
    const json = (await res.json()) as RouteMatrixResponse;
    const out = new Map<string, TravelEstimate>();
    for (const cell of json.properties?.matrix ?? []) {
      if (cell.statusCode !== 200 || cell.durationInSeconds == null) continue;
      const o = origins[cell.originIndex];
      const d = destinations[cell.destinationIndex];
      if (!o || !d) continue;
      out.set(pairKey(o, d), {
        minutes: (cell.durationTrafficInSeconds ?? cell.durationInSeconds) / 60,
        miles: (cell.distanceInMeters ?? 0) / 1609.344,
      });
    }
    return out;
  }
}

export const uniquePoints = (points: Iterable<GeoPoint>) => [...new Map([...points].map((p) => [pointKey(p), p])).values()];

interface GeocodingResponse {
  features?: {
    geometry?: { coordinates?: number[] };
    properties?: {
      type?: string;
      confidence?: string;
      address?: { formattedAddress?: string };
      geocodePoints?: { calculationMethod?: string; usageTypes?: string[]; geometry?: { coordinates?: number[] } }[];
    };
  }[];
}

interface RouteMatrixResponse {
  properties?: {
    matrix?: {
      originIndex: number;
      destinationIndex: number;
      statusCode: number;
      durationInSeconds?: number;
      durationTrafficInSeconds?: number;
      distanceInMeters?: number;
    }[];
  };
}
