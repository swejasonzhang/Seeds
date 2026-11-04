import { useMemo, useState } from 'react';
import { CalendarLtrRegular, ChevronLeftRegular, ChevronRightRegular } from '@fluentui/react-icons';
import { cn, controlClass, useField } from './core';
import { Select } from './controls';
import { Popover } from './overlays';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const todayIso = () => new Date().toLocaleDateString('en-CA');

export function formatLong(value: string) {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Month grid calendar (value/onChange as YYYY-MM-DD). */
export function Calendar({ value, onChange, max }: { value: string; onChange: (v: string) => void; max?: string }) {
  const initial = value || todayIso();
  const [view, setView] = useState({ y: Number(initial.slice(0, 4)), m: Number(initial.slice(5, 7)) - 1 });
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    return [...Array<null>(first).fill(null), ...Array.from({ length: daysIn(view.y, view.m) }, (_, i) => i + 1)];
  }, [view]);
  const shift = (delta: number) => setView((v) => {
    const m = v.m + delta;
    return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  });
  const today = todayIso();

  return (
    <div className="w-[280px]">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-700 hover:bg-cream-200" aria-label="Previous month"><ChevronLeftRegular /></button>
        <p className="text-sm font-extrabold text-seed-950">{MONTHS[view.m]} {view.y}</p>
        <button type="button" onClick={() => shift(1)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-700 hover:bg-cream-200" aria-label="Next month"><ChevronRightRegular /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <span key={d} className="py-1 text-[11px] font-bold text-ink-500">{d}</span>)}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const v = iso(view.y, view.m, d);
          const disabled = Boolean(max && v > max);
          return (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => onChange(v)}
              aria-pressed={v === value}
              className={cn(
                'h-9 rounded-lg text-sm font-semibold transition disabled:opacity-30',
                v === value ? 'bg-seed-500 text-white' : 'text-ink-900 hover:bg-seed-50',
                v === today && v !== value && 'ring-1 ring-seed-300',
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date', max }: { value: string; onChange: (v: string) => void; placeholder?: string; max?: string }) {
  const [open, setOpen] = useState(false);
  const f = useField();
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" id={f?.id} aria-invalid={f?.invalid || undefined} className={cn(controlClass, 'flex h-10 items-center gap-2 text-left', !value && 'text-ink-500/80')}>
          <CalendarLtrRegular className="text-lg text-ink-500" />
          {value ? formatLong(value) : placeholder}
        </button>
      }
    >
      <Calendar value={value} max={max} onChange={(v) => { onChange(v); setOpen(false); }} />
    </Popover>
  );
}

/** Date of birth: month / day / year menus (much faster than paging a calendar back years). */
export function BirthDatePicker({ value, onChange, maxAgeYears = 21 }: { value: string; onChange: (v: string) => void; maxAgeYears?: number }) {
  const [y, m, d] = value ? (value.split('-').map(Number) as [number, number, number]) : [0, 0, 0];
  const [parts, setParts] = useState({ y: y || 0, m: m || 0, d: d || 0 });
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: maxAgeYears + 1 }, (_, i) => String(thisYear - i));
  const maxDay = parts.y && parts.m ? daysIn(parts.y, parts.m - 1) : 31;

  const update = (next: Partial<typeof parts>) => {
    const p = { ...parts, ...next };
    if (p.d > (p.y && p.m ? daysIn(p.y, p.m - 1) : 31)) p.d = 0;
    setParts(p);
    onChange(p.y && p.m && p.d ? iso(p.y, p.m - 1, p.d) : '');
  };

  return (
    <div className="grid grid-cols-[1.5fr_1fr_1.2fr] gap-2">
      <Select aria-label="Birth month" placeholder="Month" value={parts.m ? String(parts.m) : ''} onValueChange={(v) => update({ m: Number(v) })} options={MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))} size="lg" />
      <Select aria-label="Birth day" placeholder="Day" value={parts.d ? String(parts.d) : ''} onValueChange={(v) => update({ d: Number(v) })} options={Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} size="lg" />
      <Select aria-label="Birth year" placeholder="Year" value={parts.y ? String(parts.y) : ''} onValueChange={(v) => update({ y: Number(v) })} options={years.map((yy) => ({ value: yy, label: yy }))} size="lg" />
    </div>
  );
}
