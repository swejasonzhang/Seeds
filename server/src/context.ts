import type { Logger } from 'pino';
import type { AppConfig } from './config.ts';
import type { Geocoder, TravelService } from './services/geo.ts';
import type { CalendarSync } from './services/calendarSync.ts';
import { isoDateInZone } from './core/dates.ts';

/** Everything route handlers need, injected so tests can swap any piece. */
export interface Services {
  config: AppConfig;
  log: Logger;
  geocoder: Geocoder;
  travel: TravelService;
  calendar: CalendarSync;
  now: () => Date;
}

export const today = (s: Services) => isoDateInZone(s.now(), s.config.timeZone);
