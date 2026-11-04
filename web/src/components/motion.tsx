import { createElement, useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { cn } from './kit';

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Eases content in as it scrolls into view (scroll-linked; see .scroll-in in index.css). */
export function Reveal({ children, delay = 0, as = 'div', className }: { children: ReactNode; delay?: number; as?: ElementType; className?: string }) {
  return createElement(as, { className: cn('scroll-in', className), style: { '--reveal-delay': `${delay}ms` } }, children);
}

/**
 * Fallback for browsers without CSS scroll timelines: watch every .scroll-in element (including ones rendered later)
 * and mark it shown the first time it enters the viewport.
 */
export function installScrollReveal() {
  if (typeof window === 'undefined') return;
  if (CSS.supports?.('animation-timeline: view()')) return;
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          (e.target as HTMLElement).dataset.shown = 'true';
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.08 },
  );
  const scan = (root: ParentNode) => root.querySelectorAll<HTMLElement>('.scroll-in:not([data-shown])').forEach((el) => io.observe(el));
  scan(document);
  new MutationObserver(() => scan(document)).observe(document.body, { childList: true, subtree: true });
}

/** Animates a number from 0 to its value (ease-out), e.g. stat tiles. */
export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) return setValue(target);
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(origin + (target - origin) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export function CountUp({ value }: { value: number }) {
  return <>{useCountUp(value).toLocaleString()}</>;
}

/** Branded loading placeholder shown while a lazily-loaded page chunk downloads. */
export function PageSkeleton({ variant = 'app' }: { variant?: 'app' | 'site' }) {
  return (
    <div className={cn('animate-rise-sm', variant === 'site' ? 'mx-auto max-w-7xl px-4 py-16 sm:px-6' : '')} role="status" aria-label="Loading">
      <div className="shimmer h-3 w-28 rounded-full" />
      <div className="shimmer mt-4 h-9 w-2/3 max-w-lg rounded-xl" />
      <div className="shimmer mt-3 h-4 w-1/2 max-w-md rounded-lg" />
      <div className="mt-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="shimmer h-28 rounded-2xl" />)}
      </div>
      <div className="shimmer mt-6 h-72 rounded-2xl" />
    </div>
  );
}
