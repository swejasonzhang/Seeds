import fs from 'node:fs';
import { DEFAULT_PRIORITY, type PriorityOptions } from './core/policies.ts';
import { DEFAULT_MATCHING, type MatchingOptions } from './core/matching.ts';
import { DEFAULT_TRAVEL_MODEL, type TravelModelOptions } from './core/travel.ts';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const env = process.env;
const isProduction = env.NODE_ENV === 'production';
const num = (v: string | undefined, fallback: number) => (v !== undefined && v !== '' && !Number.isNaN(+v) ? +v : fallback);

export type AuthMode = 'demo' | 'entra';

export interface AppConfig {
  isProduction: boolean;
  port: number;
  mongoUri: string;
  timeZone: string;
  staticDir?: string;
  seedDemoData: boolean;
  auth: { mode: AuthMode; tenantId?: string; audience?: string; clientId?: string; spaClientId?: string; apiScope?: string };
  azureMaps: { key?: string; clientId?: string };
  graph: { enabled: boolean; tenantId?: string; clientId?: string; clientSecret?: string; windowsTimeZone: string };
  appInsightsConnectionString?: string;
  intakeRateLimitPerHour: number;
  priority: PriorityOptions;
  matching: MatchingOptions;
  travel: TravelModelOptions;
}

export function loadConfig(): AppConfig {
  const authMode = (env.AUTH_MODE ?? (isProduction ? 'entra' : 'demo')) as AuthMode;
  const cfg: AppConfig = {
    isProduction,
    port: num(env.PORT, 5080),
    mongoUri: env.MONGODB_URI ?? 'mongodb://localhost:27017/seeds',
    timeZone: env.PRACTICE_TIME_ZONE ?? 'America/New_York',
    staticDir: env.STATIC_DIR,
    seedDemoData: env.SEED_DEMO_DATA === 'true',
    auth: {
      mode: authMode,
      tenantId: env.ENTRA_TENANT_ID,
      audience: env.ENTRA_API_AUDIENCE, // e.g. api://<api-app-client-id>
      clientId: env.ENTRA_API_CLIENT_ID,
      spaClientId: env.ENTRA_SPA_CLIENT_ID,
      apiScope: env.ENTRA_API_SCOPE, // e.g. api://<api-app-client-id>/access_as_user
    },
    azureMaps: { key: env.AZURE_MAPS_KEY, clientId: env.AZURE_MAPS_CLIENT_ID },
    graph: {
      enabled: env.GRAPH_CALENDAR_SYNC === 'true',
      tenantId: env.GRAPH_TENANT_ID ?? env.ENTRA_TENANT_ID,
      clientId: env.GRAPH_CLIENT_ID,
      clientSecret: env.GRAPH_CLIENT_SECRET,
      windowsTimeZone: env.GRAPH_TIME_ZONE ?? 'Eastern Standard Time',
    },
    appInsightsConnectionString: env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    intakeRateLimitPerHour: num(env.INTAKE_RATE_LIMIT_PER_HOUR, 20),
    priority: {
      ...DEFAULT_PRIORITY,
      underThreeBoostDays: num(env.PRIORITY_UNDER_THREE_DAYS, DEFAULT_PRIORITY.underThreeBoostDays),
      urgentBoostDays: num(env.PRIORITY_URGENT_DAYS, DEFAULT_PRIORITY.urgentBoostDays),
      siblingActiveBoostDays: num(env.PRIORITY_SIBLING_DAYS, DEFAULT_PRIORITY.siblingActiveBoostDays),
      mandatedBoostDays: num(env.PRIORITY_MANDATED_DAYS, DEFAULT_PRIORITY.mandatedBoostDays),
    },
    matching: {
      ...DEFAULT_MATCHING,
      minGapMinutes: num(env.MATCH_MIN_GAP_MINUTES, DEFAULT_MATCHING.minGapMinutes),
      clinic: {
        lat: num(env.CLINIC_LAT, DEFAULT_MATCHING.clinic.lat),
        lon: num(env.CLINIC_LON, DEFAULT_MATCHING.clinic.lon),
      },
    },
    travel: {
      ...DEFAULT_TRAVEL_MODEL,
      averageMph: num(env.TRAVEL_AVERAGE_MPH, DEFAULT_TRAVEL_MODEL.averageMph),
    },
  };

  if (cfg.auth.mode === 'entra' && (!cfg.auth.tenantId || !cfg.auth.audience || !cfg.auth.spaClientId || !cfg.auth.apiScope)) {
    throw new Error(
      'AUTH_MODE=entra requires ENTRA_TENANT_ID, ENTRA_API_AUDIENCE, ENTRA_SPA_CLIENT_ID and ENTRA_API_SCOPE. ' +
        'Use AUTH_MODE=demo only with fictional demo data.',
    );
  }
  if (cfg.auth.mode !== 'entra' && cfg.auth.mode !== 'demo') {
    throw new Error(`Unknown AUTH_MODE "${cfg.auth.mode}"`);
  }
  return cfg;
}
