import { ArrowRightRegular, CheckmarkRegular, DocumentTextRegular, PrintRegular, ShieldCheckmarkRegular } from '@fluentui/react-icons';
import { OFFICE_POLICY, PRACTICE } from '../../site/practice';
import { CtaLink } from '../../components/SiteLayout';
import { Reveal } from '../../components/motion';

const PREPARE = [
  'Your child’s insurance card (front and back), or CPSE/CSE paperwork',
  'Your pediatrician’s name and phone, plus a referral or prescription if your plan needs one',
  'Copies of any evaluations, IEPs or reports from the last 12 months',
  'A list of current medications and any diagnoses',
  'Times your family is usually free for weekly sessions',
];

export function NewPatientsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-3">New patients</p>
      <h1 className="max-w-3xl text-4xl font-black tracking-tight text-seed-950 sm:text-5xl">Everything you need for your first visit</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-500">
        No more printing and signing a stack of PDFs. The online intake form collects your child’s information, insurance and consent in one place,
        and goes straight to our intake coordinator.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <CtaLink className="px-6 py-3 text-base">Start the intake form <ArrowRightRegular /></CtaLink>
        <a href={PRACTICE.phoneHref} className="inline-flex items-center rounded-full border border-seed-300 bg-white px-6 py-3 font-bold text-seed-900 hover:border-seed-500">
          Not sure? Call for a free screening
        </a>
      </div>

      <div className="stagger mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-seed-950"><DocumentTextRegular className="text-seed-500" /> Have these handy</h2>
          <ul className="mt-5 space-y-3">
            {PREPARE.map((p) => (
              <li key={p} className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-seed-100 text-xs text-seed-700"><CheckmarkRegular /></span>
                <span className="text-ink-700">{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card card-pad bg-seed-50!">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-seed-950"><PrintRegular className="text-seed-500" /> What the form replaces</h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>Child intake / case history (ages 0–12)</li>
            <li>Insurance information form</li>
            <li>Consent to treat</li>
            <li>Office policy agreement</li>
          </ul>
          <p className="mt-4 text-xs text-ink-500">Detailed case history (birth, medical, developmental) can be shared before or at the evaluation.</p>
        </div>
      </div>

      <Reveal className="card card-pad mt-6">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-seed-950"><ShieldCheckmarkRegular className="text-seed-500" /> Office policy at a glance</h2>
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {OFFICE_POLICY.map((p) => (
            <li key={p} className="scroll-in rounded-xl bg-cream-50 p-4 text-sm text-ink-700">{p}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-500">Your information is kept in strict confidence and handled under our HIPAA privacy practices.</p>
      </Reveal>
    </div>
  );
}
