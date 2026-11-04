import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { CallRegular, ClockRegular, DismissRegular, LocationRegular, MailRegular, NavigationRegular, PrintRegular } from '@fluentui/react-icons';
import { PRACTICE } from '../site/practice';
import { ConceptNotice, Wordmark } from './ui';
import { Button } from './kit';

const LINKS = [
  { to: '/#services', label: 'Services' },
  { to: '/new-patients', label: 'New patients' },
  { to: '/#insurance', label: 'Insurance' },
  { to: '/#team', label: 'Our team' },
  { to: '/#faq', label: 'FAQ' },
  { to: '/#contact', label: 'Contact' },
];

/** Hash links ("/#faq") don't scroll on their own in a SPA. */
function useScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);
}

export function CtaLink({ to = '/intake', children, variant = 'primary', className = '' }: { to?: string; children: React.ReactNode; variant?: 'primary' | 'secondary' | 'light'; className?: string }) {
  const styles = {
    primary: 'bg-seed-500 text-white hover:bg-seed-600 shadow-lift',
    secondary: 'border border-seed-300 bg-white text-seed-900 hover:border-seed-500 hover:bg-seed-50',
    light: 'bg-cream-50 text-seed-950 hover:bg-white',
  }[variant];
  return (
    <Link to={to} className={`focus-ring inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${styles} ${className}`}>
      {children}
    </Link>
  );
}

export function SiteLayout() {
  useScrollToHash();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col bg-cream-100">
      <ConceptNotice />
      <header className="sticky top-0 z-40 border-b border-cream-200 bg-cream-100/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link to="/" aria-label={`${PRACTICE.name} home`}>
            <Wordmark />
          </Link>
          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className="rounded-full px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-cream-200 hover:text-seed-950">
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-2">
            <Link to="/sign-in" className="hidden rounded-full px-3 py-2 text-sm font-bold text-seed-900 hover:bg-cream-200 md:inline-flex">Sign in</Link>
            <a href={PRACTICE.phoneHref} className="hidden items-center gap-1.5 text-sm font-bold text-seed-900 xl:flex">
              <CallRegular /> {PRACTICE.phone}
            </a>
            <CtaLink className="hidden sm:inline-flex">Request services</CtaLink>
            <Button className="lg:hidden" variant="ghost" size="icon" aria-label="Menu" onClick={() => setOpen(!open)}>
              {open ? <DismissRegular /> : <NavigationRegular />}
            </Button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-cream-200 px-4 pb-4 lg:hidden">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 font-semibold text-ink-700 hover:bg-cream-200">
                {l.label}
              </Link>
            ))}
            <Link to="/sign-in" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 font-semibold text-ink-700 hover:bg-cream-200">Sign in</Link>
            <CtaLink className="mt-2 w-full">Request services</CtaLink>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-seed-950 text-seed-100">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-1">
            <Wordmark light />
            <p className="mt-4 text-sm text-seed-200">{PRACTICE.tagline}</p>
          </div>
          <div>
            <p className="eyebrow mb-3 text-clay-300!">Visit</p>
            <p className="flex gap-2 text-sm">
              <LocationRegular className="mt-0.5 shrink-0" />
              <span>
                {PRACTICE.address.line1}
                <br />
                {PRACTICE.address.city}, {PRACTICE.address.state} {PRACTICE.address.zip}
              </span>
            </p>
          </div>
          <div>
            <p className="eyebrow mb-3 text-clay-300!">Contact</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><CallRegular /> <a href={PRACTICE.phoneHref} className="hover:text-white">{PRACTICE.phone}</a></li>
              <li className="flex items-center gap-2"><PrintRegular /> Fax {PRACTICE.fax}</li>
              <li className="flex items-center gap-2"><MailRegular /> <a href={`mailto:${PRACTICE.email}`} className="break-all hover:text-white">{PRACTICE.email}</a></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-3 text-clay-300!">Hours</p>
            <ul className="space-y-1.5 text-sm">
              {PRACTICE.hours.map((h) => (
                <li key={h.days} className="flex items-start gap-2">
                  <ClockRegular className="mt-0.5 shrink-0" />
                  <span><span className="font-semibold text-white">{h.days}</span><br />{h.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-seed-300 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              Unofficial concept redesign by an internship applicant. Not affiliated with or endorsed by {PRACTICE.legalName}. Official site:{' '}
              <a className="underline" href={PRACTICE.officialSite} rel="noreferrer" target="_blank">seedsofthewillistons.com</a>
            </p>
            <Link to="/sign-in" className="font-semibold text-seed-200 hover:text-white">Family, therapist &amp; staff sign-in →</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
