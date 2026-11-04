// Calendar dates are ISO 'YYYY-MM-DD' strings in the practice's time zone. Keeping them as strings avoids the
// classic "date of birth shifted by a day" bug that comes from storing midnight-UTC Date objects.

const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDateInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY_MS);
}

export function dayOfWeek(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay();
}

/** Next date on/after `fromIso` that falls on `day` (0=Sun). */
export function nextOccurrence(fromIso: string, day: number): string {
  const delta = (day - dayOfWeek(fromIso) + 7) % 7;
  return addDays(fromIso, delta);
}

export function ageInMonths(dobIso: string, onIso: string): number {
  const [y1, m1, d1] = dobIso.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = onIso.split('-').map(Number) as [number, number, number];
  let months = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) months--;
  return Math.max(0, months);
}

export function wholeDaysSince(instant: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - instant.getTime()) / DAY_MS));
}
