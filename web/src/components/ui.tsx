import type { ReactNode } from 'react';
import { Skeleton, Tip, cn } from './kit';
import { CountUp } from './motion';
import { InfoRegular, WarningRegular } from '@fluentui/react-icons';
import { PRACTICE } from '../site/practice';

/** Our own sprout mark (not the practice's logo file). */
export function SproutMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="19" className="fill-seed-950" />
      <path d="M20 31V18" stroke="#f5f3ee" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M20 21c-6.5 0-10-3.6-10-9 6 0 10 3.4 10 9Z" className="fill-olive-200" />
      <path d="M20 18c0-5.6 3.8-9.5 10-9.5 0 5.8-4 9.5-10 9.5Z" className="fill-clay-300" />
    </svg>
  );
}

export function Wordmark({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <SproutMark className={compact ? 'h-7 w-7' : 'h-9 w-9'} />
      <span className="leading-none">
        <span className={`block text-[15px] font-black uppercase tracking-[0.22em] ${light ? 'text-cream-50' : 'text-seed-950'}`}>SEEDS</span>
        <span className={`block pt-1 text-[11px] font-semibold tracking-wide ${light ? 'text-seed-200' : 'text-ink-500'}`}>of the Willistons</span>
      </span>
    </span>
  );
}

/** Required on every page: this is an applicant's unofficial redesign of a real practice's site. */
export function ConceptNotice({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <div className={tone === 'dark' ? 'bg-seed-950 text-seed-100' : 'bg-clay-50 text-clay-700'}>
      <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-[11px] font-semibold sm:text-xs">
        <InfoRegular className="shrink-0" />
        <span className="sm:hidden">
          Unofficial concept · demo data · services: <a href={PRACTICE.phoneHref} className="underline underline-offset-2">{PRACTICE.phone}</a>
        </span>
        <span className="hidden sm:inline">
          Unofficial concept redesign, not affiliated with {PRACTICE.name}. Demo data only. To request services, call the office at{' '}
          <a href={PRACTICE.phoneHref} className="underline underline-offset-2">{PRACTICE.phone}</a>.
        </span>
      </p>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-2xl font-extrabold tracking-tight text-seed-950 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Status = 'neutral' | 'critical' | 'warning';

/** Stat tile: label · value · optional context. Status tiles carry an icon + words, never color alone. */
export function StatTile({ label, value, context, status = 'neutral', icon }: { label: string; value: ReactNode; context?: ReactNode; status?: Status; icon?: ReactNode }) {
  const statusIcon = status === 'critical' ? <WarningRegular className="text-red-700" /> : status === 'warning' ? <WarningRegular className="text-amber-700" /> : icon;
  return (
    <div className="card card-pad lift flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-500">
        {statusIcon && <span className="text-base">{statusIcon}</span>}
        {label}
      </div>
      <div className="text-3xl font-bold text-ink-900">{typeof value === 'number' ? <CountUp value={value} /> : value}</div>
      {context && <div className="text-xs text-ink-500">{context}</div>}
    </div>
  );
}

/**
 * Meter: a single ratio against a limit. The fill shows severity (brand → warning → danger) and the track is a
 * lighter step of the same ramp, so the state reads across the whole bar. Tooltip + ARIA carry the exact numbers.
 */
export function Meter({ value, max, label, size = 'md', kind = 'capacity' }: { value: number; max: number; label: string; size?: 'sm' | 'md'; kind?: 'capacity' | 'progress' }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 1;
  // Capacity: nearly full is a warning. Progress: nearly done is good, so it stays on the brand ramp.
  const level = kind === 'progress' ? 'ok' : ratio >= 1 ? 'full' : ratio >= 0.85 ? 'high' : 'ok';
  const fill = { ok: 'bg-seed-500', high: 'bg-amber-500', full: 'bg-red-600' }[level];
  const track = { ok: 'bg-seed-100', high: 'bg-amber-100', full: 'bg-red-100' }[level];
  return (
    <Tip content={`${label}: ${value} of ${max} (${Math.round(ratio * 100)}%)`}>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        tabIndex={0}
        className={`focus-ring w-full overflow-hidden rounded-full ${track} ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}
      >
        <div className={cn('h-full origin-left animate-grow-x rounded-full transition-[width] duration-700', fill)} style={{ width: `${ratio * 100}%` }} />
      </div>
    </Tip>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 grid h-12 w-12 place-items-center rounded-full bg-seed-50 text-2xl text-seed-500">{icon}</div>
      <p className="font-bold text-ink-900">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-500">{children}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-label="Loading" role="status" className="flex flex-col gap-4 p-5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function SectionTitle({ title, action, description }: { title: string; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-extrabold text-seed-950">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
