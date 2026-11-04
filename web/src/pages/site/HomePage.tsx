import type { ReactNode } from 'react';
import { Accordion } from '../../components/kit';
import {
  ArrowRightRegular,
  BackpackRegular,
  BuildingRegular,
  CallRegular,
  ChatRegular,
  CheckmarkCircleRegular,
  ClockRegular,
  HandLeftRegular,
  HomeRegular,
  LocationRegular,
  MailRegular,
  PaintBrushRegular,
  PeopleCommunityRegular,
  ShieldCheckmarkRegular,
  VideoRegular,
} from '@fluentui/react-icons';
import { FAQ, INSURANCE, PRACTICE, SERVICES, SETTINGS_OFFERED, TEAM } from '../../site/practice';
import { CtaLink } from '../../components/SiteLayout';
import { Reveal } from '../../components/motion';

const SERVICE_ICON: Record<string, ReactNode> = {
  speech: <ChatRegular />,
  ot: <HandLeftRegular />,
  art: <PaintBrushRegular />,
  playgroups: <PeopleCommunityRegular />,
};
const SETTING_ICON: Record<string, ReactNode> = {
  clinic: <BuildingRegular />,
  home: <HomeRegular />,
  school: <BackpackRegular />,
  telehealth: <VideoRegular />,
};

function Section({ id, eyebrow, title, intro, children, tone = 'cream' }: { id?: string; eyebrow: string; title: string; intro?: string; children: ReactNode; tone?: 'cream' | 'white' }) {
  return (
    <section id={id} className={`scroll-mt-28 ${tone === 'white' ? 'bg-white' : ''}`}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <Reveal>
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight text-seed-950 sm:text-4xl">{title}</h2>
          {intro && <p className="mt-3 max-w-2xl text-lg text-ink-500">{intro}</p>}
        </Reveal>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <>
      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] animate-drift rounded-full bg-seed-100/70 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/3 h-[420px] w-[420px] animate-drift rounded-full bg-clay-100/70 blur-3xl [animation-delay:-9s]" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="stagger">
            <p className="eyebrow mb-4">Speech · Occupational · Art therapy · Williston Park, NY</p>
            <h1 className="text-[2.5rem] font-black leading-[1.05] tracking-tight text-seed-950 sm:text-6xl">
              Helping every child find their words, <span className="text-clay-600">and their way.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-700">
              Warm, evidence-based therapy for children from 12 months up, in our office, at home, at school or by video. {PRACTICE.tagline}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaLink className="px-6 py-3 text-base">
                Request services <ArrowRightRegular />
              </CtaLink>
              <a href={PRACTICE.phoneHref} className="focus-ring inline-flex items-center gap-2 rounded-full border border-seed-300 bg-white px-6 py-3 text-base font-bold text-seed-900 hover:border-seed-500">
                <CallRegular /> Free 15-minute screening
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-ink-700">
              {['Nassau County CPSE & CSE approved', 'Most major insurance plans', 'NYS-licensed SLPs & OTs'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckmarkCircleRegular className="text-seed-500" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative animate-rise [animation-delay:250ms]">
            <div className="card relative animate-float p-6 shadow-lift sm:p-8">
              <p className="eyebrow mb-4">Getting started takes three steps</p>
              <ol className="space-y-5">
                {[
                  ['Tell us about your child', 'One short online form replaces the printed intake packet.'],
                  ['We find the right therapist', 'Matched to your schedule, setting and location, so care starts sooner.'],
                  ['Evaluation & plan', 'A licensed therapist evaluates and builds a plan with you.'],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-seed-950 text-sm font-black text-cream-50">{i + 1}</span>
                    <span>
                      <span className="block font-bold text-ink-900">{t}</span>
                      <span className="text-sm text-ink-500">{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <CtaLink className="mt-6 w-full">Start the intake form</CtaLink>
            </div>
            <div className="card absolute -bottom-6 -left-4 hidden -rotate-2 animate-rise items-center gap-3 px-4 py-3 shadow-lift [animation-delay:700ms] sm:flex">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-clay-100 text-clay-700"><ClockRegular /></span>
              <span className="text-sm">
                <span className="block font-bold text-ink-900">About 10 minutes</span>
                <span className="text-ink-500">on your phone or computer</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- services ---------- */}
      <Section id="services" eyebrow="What we do" title="Therapy that meets your child where they are" intro="Every plan is individualized, evidence-based and built together with your family." tone="white">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s, i) => (
            <Reveal key={s.id} delay={i * 90} as="article" className="group lift rounded-2xl border border-cream-200 bg-cream-50 p-6 hover:border-seed-200 hover:bg-white">
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-seed-950 text-2xl text-cream-50 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">{SERVICE_ICON[s.id]}</div>
              <h3 className="text-lg font-extrabold text-seed-950">{s.title}</h3>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-clay-600">{s.ages}</p>
              <p className="mt-3 text-sm text-ink-700">{s.body}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------- settings ---------- */}
      <Section eyebrow="Where we work" title="In the office, at home, at school, or online">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SETTINGS_OFFERED.map((s, i) => (
            <Reveal key={s.id} delay={i * 90} className="card card-pad lift">
              <div className="mb-3 text-2xl text-seed-500">{SETTING_ICON[s.id]}</div>
              <h3 className="font-extrabold text-ink-900">{s.title}</h3>
              <p className="mt-1 text-sm text-ink-500">{s.body}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------- insurance ---------- */}
      <Section id="insurance" eyebrow="Insurance & funding" title="One of the few Long Island practices that takes most major plans" tone="white">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Reveal className="rounded-2xl bg-seed-950 p-6 text-cream-50 sm:p-8">
            <ShieldCheckmarkRegular className="text-3xl text-clay-300" />
            <h3 className="mt-4 text-xl font-extrabold">Insurance plans we accept</h3>
            <ul className="mt-5 flex flex-wrap gap-2">
              {INSURANCE.plans.map((p) => (
                <li key={p} className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold">{p}</li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-seed-200">
              Coverage for speech therapy varies by plan. Call your insurer to confirm your benefits, or ask our front desk to help.
            </p>
          </Reveal>
          <div className="grid gap-4">
            {INSURANCE.programs.map((p, i) => (
              <Reveal key={p.name} delay={120 + i * 90} className="card card-pad lift flex items-start gap-4">
                <CheckmarkCircleRegular className="mt-0.5 shrink-0 text-2xl text-seed-500" />
                <div>
                  <p className="font-extrabold text-ink-900">{p.name}</p>
                  <p className="text-sm text-ink-500">{p.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* ---------- team ---------- */}
      <Section id="team" eyebrow="Our team" title="Led by speech-language pathologists with decades of experience" intro="Our NYS-licensed speech-language pathologists and occupational therapists focus on kindness, compassion and real progress.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {TEAM.map((m, i) => (
            <Reveal key={m.name} delay={i * 110} className="card card-pad lift flex items-center gap-5">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-olive-200 text-xl font-black text-seed-950">
                {m.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
              </div>
              <div>
                <p className="text-lg font-extrabold text-seed-950">{m.name}, <span className="font-semibold text-ink-500">{m.credential}</span></p>
                <p className="text-sm font-bold uppercase tracking-wider text-clay-600">{m.role}</p>
                <p className="mt-1 text-sm text-ink-700">{m.note}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------- FAQ ---------- */}
      <Section id="faq" eyebrow="FAQ" title="Questions parents ask us" tone="white">
        <Reveal className="card overflow-hidden">
          <Accordion items={FAQ.map((f, i) => ({ id: String(i), title: f.q, body: <p>{f.a}</p> }))} />
        </Reveal>
      </Section>

      {/* ---------- contact ---------- */}
      <Section id="contact" eyebrow="Visit or call" title="We’re on Hillside Avenue in Williston Park">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="scroll-in card card-pad lift">
            <LocationRegular className="text-2xl text-seed-500" />
            <p className="mt-3 font-extrabold text-ink-900">{PRACTICE.address.line1}</p>
            <p className="text-ink-700">{PRACTICE.address.city}, {PRACTICE.address.state} {PRACTICE.address.zip}</p>
            <a className="mt-3 inline-block text-sm font-bold text-seed-600 underline underline-offset-4" href={PRACTICE.mapsUrl} target="_blank" rel="noreferrer">
              Directions (Bing Maps)
            </a>
          </div>
          <div className="scroll-in card card-pad lift">
            <ClockRegular className="text-2xl text-seed-500" />
            <ul className="mt-3 space-y-1.5">
              {PRACTICE.hours.map((h) => (
                <li key={h.days} className="flex justify-between gap-4 text-sm">
                  <span className="font-semibold text-ink-900">{h.days}</span>
                  <span className="text-ink-700">{h.time}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="scroll-in card card-pad lift">
            <CallRegular className="text-2xl text-seed-500" />
            <a href={PRACTICE.phoneHref} className="mt-3 block text-lg font-extrabold text-ink-900">{PRACTICE.phone}</a>
            <a href={`mailto:${PRACTICE.email}`} className="mt-1 flex items-center gap-1.5 break-all text-sm text-ink-700">
              <MailRegular /> {PRACTICE.email}
            </a>
            <p className="mt-2 text-sm text-ink-500">Fax {PRACTICE.fax}</p>
          </div>
        </div>
      </Section>

      {/* ---------- careers + final CTA ---------- */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <Reveal className="relative overflow-hidden rounded-3xl bg-seed-950 px-6 py-12 text-cream-50 sm:px-12">
          <div aria-hidden className="absolute -right-20 -top-20 h-72 w-72 animate-drift rounded-full bg-clay-500/30 blur-3xl" />
          <div className="relative grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight">Ready when you are.</h2>
              <p className="mt-2 max-w-xl text-seed-200">
                Start the online intake form, and we’ll reach out to schedule an evaluation. Therapists can send their resume to{' '}
                <a href={`mailto:${PRACTICE.email}`} className="font-semibold text-white underline underline-offset-4">our front desk</a>; we review current resumes first when a position opens.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <CtaLink variant="light">Request services <ArrowRightRegular /></CtaLink>
              <CtaLink to="/new-patients" variant="secondary" className="border-white/30 bg-transparent text-cream-50 hover:bg-white/10">New patient info</CtaLink>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
