import type { ReactNode } from 'react';
import { Toaster as Sonner, toast } from 'sonner';
import { CheckmarkCircleRegular, ErrorCircleRegular, InfoRegular, WarningRegular } from '@fluentui/react-icons';
import { cn } from './core';

const ALERT = {
  info: { cls: 'bg-seed-50 text-seed-900 ring-seed-200', icon: <InfoRegular /> },
  success: { cls: 'bg-seed-50 text-seed-900 ring-seed-300', icon: <CheckmarkCircleRegular /> },
  warning: { cls: 'bg-amber-50 text-amber-900 ring-amber-200', icon: <WarningRegular /> },
  error: { cls: 'bg-red-50 text-red-900 ring-red-200', icon: <ErrorCircleRegular /> },
} as const;

export function Alert({ tone = 'info', title, children, className, action }: { tone?: keyof typeof ALERT; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-2xl p-4 text-sm ring-1', ALERT[tone].cls, className)}>
      <span className="mt-0.5 text-lg">{ALERT[tone].icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-extrabold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-10 text-sm font-semibold text-ink-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-seed-200 border-t-seed-500" />
      {label}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-lg bg-cream-200', className)} />;

export const initialsOf = (name: string) =>
  name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

export function Avatar({ name, size = 'md', tone = 'seed' }: { name: string; size?: 'sm' | 'md' | 'lg'; tone?: 'seed' | 'olive' | 'clay' | 'dark' }) {
  const sizes = { sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-lg' }[size];
  const tones = { seed: 'bg-seed-100 text-seed-800', olive: 'bg-olive-200 text-seed-950', clay: 'bg-clay-100 text-clay-700', dark: 'bg-seed-950 text-cream-50' }[tone];
  return <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full font-black', sizes, tones)}>{initialsOf(name)}</span>;
}

/** Branded toasts (Sonner). */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'flex w-[360px] items-start gap-3 rounded-2xl border border-cream-200 bg-white p-4 shadow-lift',
          title: 'text-sm font-extrabold text-ink-900',
          description: 'text-xs text-ink-500 mt-0.5',
          icon: 'mt-0.5',
          success: '[&_[data-icon]]:text-seed-500',
          error: '[&_[data-icon]]:text-red-600',
          warning: '[&_[data-icon]]:text-amber-600',
        },
      }}
    />
  );
}

export { toast };
