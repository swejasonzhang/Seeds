import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Tip } from './kit';
import { LockClosedRegular, VideoRegular } from '@fluentui/react-icons';
import { DAY_LONG, DAY_SHORT, SETTING_LABEL, formatMinute, type AppointmentDto, type WeeklyWindow } from '@seeds/shared';

const START = 8 * 60;
const END = 19 * 60 + 30;
const PX_PER_MIN = 0.9;
const DAYS = [1, 2, 3, 4, 5, 6];
const HOURS = Array.from({ length: (END - START) / 60 + 1 }, (_, i) => START + i * 60).filter((m) => m <= END);

/**
 * Read-only week view: availability as a pale band, sessions as solid blocks (one hue; telehealth is lighter and
 * carries a video icon, so setting never relies on color alone). Each block has a tooltip and an accessible label.
 */
export function WeekGrid(props: { availability: WeeklyWindow[]; appointments: AppointmentDto[]; caseHref?: (a: AppointmentDto) => string }) {
  return (
    <>
      <div className="md:hidden"><WeekAgenda {...props} /></div>
      <div className="hidden md:block"><WeekCalendar {...props} /></div>
    </>
  );
}

/** Phones: a day-by-day agenda instead of a squeezed calendar. */
function WeekAgenda({ availability, appointments, caseHref }: { availability: WeeklyWindow[]; appointments: AppointmentDto[]; caseHref?: (a: AppointmentDto) => string }) {
  return (
    <ol className="space-y-4">
      {DAYS.map((d) => {
        const appts = appointments.filter((a) => a.day === d).sort((a, b) => a.start - b.start);
        const avail = availability.filter((w) => w.day === d);
        return (
          <li key={d} className="scroll-in">
            <p className="text-xs font-extrabold uppercase tracking-wider text-ink-500">
              {DAY_LONG[d]} <span className="font-semibold normal-case tracking-normal">{avail.length ? avail.map((w) => `${formatMinute(w.start)}–${formatMinute(w.end)}`).join(', ') : 'not available'}</span>
            </p>
            {appts.length === 0 ? (
              <p className="mt-1 text-sm text-ink-500">{avail.length ? 'Open' : '—'}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {appts.map((a) => {
                  const row = (
                    <div className={`flex items-center gap-3 rounded-xl p-3 ${a.setting === 'telehealth' ? 'bg-seed-50 ring-1 ring-seed-200' : 'bg-seed-500 text-white'}`}>
                      <span className="w-16 shrink-0 text-sm font-black">{formatMinute(a.start)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{a.childLabel}</span>
                        <span className="block text-xs opacity-80">{SETTING_LABEL[a.setting]} · {a.locationLabel}</span>
                      </span>
                      {a.setting === 'telehealth' && <VideoRegular className="shrink-0" />}
                    </div>
                  );
                  return <li key={a.id}>{caseHref ? <Link to={caseHref(a)} className="focus-ring block rounded-xl">{row}</Link> : row}</li>;
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function WeekCalendar({ availability, appointments, caseHref }: { availability: WeeklyWindow[]; appointments: AppointmentDto[]; caseHref?: (a: AppointmentDto) => string }) {
  const height = (END - START) * PX_PER_MIN;
  return (
    <div>
      <div className="grid grid-cols-[40px_repeat(6,minmax(0,1fr))] gap-x-1.5">
        <div />
        {DAYS.map((d) => (
          <div key={d} className="pb-2 text-center text-xs font-extrabold uppercase tracking-wider text-ink-500">{DAY_SHORT[d]}</div>
        ))}
        <div className="relative" style={{ height }}>
          {HOURS.map((m) => (
            <span key={m} className="absolute -translate-y-1/2 text-[10px] font-semibold text-ink-500" style={{ top: (m - START) * PX_PER_MIN }}>
              {formatMinute(m).replace(':00', '')}
            </span>
          ))}
        </div>
        {DAYS.map((d) => (
          <div key={d} className="relative rounded-xl bg-cream-50 ring-1 ring-cream-200" style={{ height }} aria-label={`${DAY_LONG[d]} schedule`}>
            {HOURS.map((m) => <div key={m} className="absolute inset-x-0 border-t border-cream-200" style={{ top: (m - START) * PX_PER_MIN }} />)}
            {availability.filter((w) => w.day === d).map((w, i) => (
              <div key={i} className="absolute inset-x-1 rounded-lg bg-seed-50 ring-1 ring-seed-100" style={{ top: (Math.max(w.start, START) - START) * PX_PER_MIN, height: (Math.min(w.end, END) - Math.max(w.start, START)) * PX_PER_MIN }} />
            ))}
            {appointments.filter((a) => a.day === d).map((a) => {
              const tele = a.setting === 'telehealth';
              const h = (a.end - a.start) * PX_PER_MIN - 2;
              const block = (
                <div
                  className={`absolute inset-x-1 flex flex-col justify-center rounded-lg px-1.5 text-[10px] leading-[1.15] shadow-card transition hover:z-10 hover:scale-[1.04] ${tele ? 'bg-seed-100 text-seed-900 ring-1 ring-seed-300' : 'bg-seed-500 text-white'}`}
                  style={{ top: (a.start - START) * PX_PER_MIN + 1, height: h }}
                >
                  <p className="font-black">{formatMinute(a.start).replace(':00', '').replace(' ', '')}</p>
                  {h >= 30 && <p className="flex items-center gap-0.5 font-semibold opacity-90">{tele && <VideoRegular className="shrink-0" />}{a.childLabel}</p>}
                </div>
              );
              return (
                <Tip key={a.id} content={`${a.childLabel} · ${formatMinute(a.start)}–${formatMinute(a.end)} · ${SETTING_LABEL[a.setting]} · ${a.locationLabel}`}>
                  {caseHref ? (
                    <Link to={caseHref(a)} aria-label={`${a.childLabel} ${formatMinute(a.start)}`} className="focus-ring">{block}</Link>
                  ) : (
                    <div tabIndex={0} aria-label={`${a.childLabel} ${formatMinute(a.start)}`}>{block}</div>
                  )}
                </Tip>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-seed-50 ring-1 ring-seed-100" /> Available</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-seed-500" /> In-person session</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-seed-100 ring-1 ring-seed-300" /> <VideoRegular /> Telehealth</span>
      </div>
    </div>
  );
}

// ---------------- availability editor ----------------

const SLOT = 30;
const SLOTS = Array.from({ length: (END - START) / SLOT }, (_, i) => START + i * SLOT);
const key = (d: number, m: number) => `${d}:${m}`;

export function windowsToCells(windows: WeeklyWindow[]) {
  const set = new Set<string>();
  for (const w of windows) for (const m of SLOTS) if (m >= w.start && m + SLOT <= w.end && w.day >= 0) set.add(key(w.day, m));
  return set;
}

export function cellsToWindows(cells: Set<string>): WeeklyWindow[] {
  const out: WeeklyWindow[] = [];
  for (const d of DAYS) {
    let run: number | null = null;
    for (const m of [...SLOTS, END]) {
      const on = m < END && cells.has(key(d, m));
      if (on && run === null) run = m;
      if (!on && run !== null) {
        out.push({ day: d, start: run, end: m });
        run = null;
      }
    }
  }
  return out;
}

/** Click or drag across 30-minute cells to paint availability. Booked sessions are shown locked. */
export function AvailabilityEditor({ value, onChange, booked }: { value: Set<string>; onChange: (s: Set<string>) => void; booked: AppointmentDto[] }) {
  const painting = useRef<null | boolean>(null);
  const [, force] = useState(0);
  const locked = useMemo(() => {
    const s = new Set<string>();
    for (const a of booked) for (const m of SLOTS) if (m < a.end && m + SLOT > a.start) s.add(key(a.day, m));
    return s;
  }, [booked]);

  const apply = (k: string) => {
    if (painting.current === null || locked.has(k)) return;
    const next = new Set(value);
    if (painting.current) next.add(k);
    else next.delete(k);
    onChange(next);
  };

  return (
    <div className="select-none" onPointerUp={() => { painting.current = null; force((x) => x + 1); }} onPointerLeave={() => (painting.current = null)}>
      <table className="w-full border-separate border-spacing-x-1 border-spacing-y-0.5 sm:border-spacing-x-1.5">
        <thead>
          <tr>
            <th className="w-12 sm:w-16" />
            {DAYS.map((d) => <th key={d} className="pb-2 text-xs font-extrabold uppercase tracking-wider text-ink-500">{DAY_SHORT[d]}</th>)}
          </tr>
        </thead>
        <tbody>
          {SLOTS.map((m) => (
            <tr key={m}>
              <th scope="row" className="whitespace-nowrap pr-1 text-right text-[10px] font-semibold text-ink-500 sm:pr-2">{m % 60 === 0 ? formatMinute(m).replace(':00', '') : ''}</th>
              {DAYS.map((d) => {
                const k = key(d, m);
                const isLocked = locked.has(k);
                const on = value.has(k) || isLocked;
                return (
                  <td key={k}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`${DAY_LONG[d]} ${formatMinute(m)}${isLocked ? ' (booked session)' : ''}`}
                      disabled={isLocked}
                      onPointerDown={(e) => { e.preventDefault(); painting.current = !value.has(k); apply(k); }}
                      onPointerEnter={() => apply(k)}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); painting.current = !value.has(k); apply(k); painting.current = null; } }}
                      className={`focus-ring grid h-6 w-full place-items-center rounded transition-colors sm:h-5 ${isLocked ? 'cursor-not-allowed bg-clay-300 text-[10px] text-seed-950' : on ? 'bg-seed-500 hover:bg-seed-600' : 'bg-cream-200 hover:bg-seed-100'}`}
                    >
                      {isLocked && m % 60 === 0 ? <LockClosedRegular /> : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-seed-500" /> Available</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-clay-300" /> <LockClosedRegular /> Booked session (ask the front desk to move it)</span>
      </div>
    </div>
  );
}
