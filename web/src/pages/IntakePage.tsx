import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowLeftRegular,
  ArrowRightRegular,
  BackpackRegular,
  BuildingRegular,
  CallRegular,
  ChatRegular,
  CheckmarkCircle48Filled,
  CheckmarkRegular,
  EditRegular,
  HandLeftRegular,
  HomeRegular,
  SparkleRegular,
  VideoRegular,
} from '@fluentui/react-icons';
import {
  DAY_SHORT,
  DISCIPLINE_LABEL,
  FUNDING_LABEL,
  REFERRAL_LABEL,
  REFERRAL_SOURCES,
  SETTING_LABEL,
  TIME_BANDS,
  intakeSchema,
  type Discipline,
  type FundingSource,
  type IntakeResult,
  type IntakeSubmission,
  type ReferralSource,
  type SessionSetting,
} from '@seeds/shared';
import { ApiRequestError, errorMessage, usePublicConfig, useSubmitIntake } from '../api';
import { ConceptNotice, Wordmark } from '../components/ui';
import { Alert, BirthDatePicker, Button, Checkbox, Field, Input, Select, Textarea, cn } from '../components/kit';
import { setPersona } from '../session';
import { INSURANCE, PRACTICE } from '../site/practice';

const LANGUAGES = ['English', 'Spanish', 'Mandarin', 'Cantonese', 'Haitian Creole', 'Farsi', 'Korean', 'Hebrew', 'Russian', 'Other'];
const DAYS = [1, 2, 3, 4, 5, 6];
// Information.txt §8: offer only funding the practice lists publicly (EI and Medicaid pending confirmation).
const FUNDING_OPTIONS: { id: FundingSource; hint: string }[] = [
  { id: 'insurance', hint: 'Blue Cross Blue Shield, UnitedHealthcare, Oxford, EmblemHealth, GHI and more' },
  { id: 'cpse', hint: 'Nassau County preschool special education, ages 3–5' },
  { id: 'private', hint: 'Pay per session' },
];
const OTHER_PLAN = 'Other plan';

const STEPS = [
  { id: 'child', title: 'Your child', prefixes: ['child'] },
  { id: 'family', title: 'You & your home', prefixes: ['guardian', 'address'] },
  { id: 'needs', title: 'What brings you here', prefixes: ['services', 'concerns', 'urgentConcern'] },
  { id: 'coverage', title: 'Referral & coverage', prefixes: ['referralSource', 'referringProvider', 'fundingSource', 'insurance'] },
  { id: 'schedule', title: 'Where & when', prefixes: ['preferredSetting', 'communityLocation', 'acceptsTelehealth', 'availability'] },
  { id: 'review', title: 'Review & sign', prefixes: ['consent'] },
] as const;

interface FormState {
  child: { firstName: string; lastName: string; dateOfBirth: string; preferredLanguage: string };
  guardian: { firstName: string; lastName: string; relationship: string; phone: string; email: string };
  address: { line1: string; city: string; state: string; postalCode: string };
  services: Discipline[];
  concerns: string;
  urgentConcern: boolean;
  referralSource: ReferralSource | '';
  referringProvider: string;
  fundingSource: FundingSource | '';
  plan: string;
  otherPlan: string;
  memberId: string;
  preferredSetting: SessionSetting;
  acceptsTelehealth: boolean;
  community: { name: string; line1: string; city: string; state: string; postalCode: string };
  bands: string[]; // `${day}:${bandId}`
  consent: { agreed: boolean; signatureName: string; hipaaAcknowledged: boolean; policyAgreed: boolean };
}

const EMPTY: FormState = {
  child: { firstName: '', lastName: '', dateOfBirth: '', preferredLanguage: 'English' },
  guardian: { firstName: '', lastName: '', relationship: 'Mother', phone: '', email: '' },
  address: { line1: '', city: '', state: 'NY', postalCode: '' },
  services: [],
  concerns: '',
  urgentConcern: false,
  referralSource: '',
  referringProvider: '',
  fundingSource: '',
  plan: '',
  otherPlan: '',
  memberId: '',
  preferredSetting: 'home',
  acceptsTelehealth: false,
  community: { name: '', line1: '', city: '', state: 'NY', postalCode: '' },
  bands: [],
  consent: { agreed: false, signatureName: '', hipaaAcknowledged: false, policyAgreed: false },
};

/** Fictional family for reviewers trying the demo. */
const SAMPLE: FormState = {
  ...EMPTY,
  child: { firstName: 'Maya', lastName: 'Okafor', dateOfBirth: '2023-05-14', preferredLanguage: 'English' },
  guardian: { firstName: 'Grace', lastName: 'Okafor', relationship: 'Mother', phone: '(516) 555-0188', email: 'grace.okafor@example.com' },
  address: { line1: '48 Willis Ave', city: 'Mineola', state: 'NY', postalCode: '11501' },
  services: ['speech'],
  concerns: 'Maya uses about 15 words at 2½ and gets frustrated when we don’t understand her. Her pediatrician suggested an evaluation.',
  referralSource: 'pediatrician',
  referringProvider: 'Mineola Pediatrics',
  fundingSource: 'insurance',
  plan: 'UnitedHealthcare',
  memberId: 'DEMO-482913',
  preferredSetting: 'home',
  acceptsTelehealth: true,
  bands: ['2:morning', '4:morning', '1:midday'],
  consent: { agreed: true, signatureName: 'Grace Okafor', hipaaAcknowledged: true, policyAgreed: false },
};

function toSubmission(f: FormState): IntakeSubmission {
  const insured = f.fundingSource === 'insurance' || f.fundingSource === 'medicaid';
  return {
    child: f.child,
    guardian: f.guardian,
    address: f.address,
    services: f.services,
    concerns: f.concerns,
    urgentConcern: f.urgentConcern,
    referralSource: f.referralSource as ReferralSource,
    referringProvider: f.referringProvider || undefined,
    fundingSource: f.fundingSource as FundingSource,
    insurance: insured ? { payer: f.plan === OTHER_PLAN ? f.otherPlan : f.plan, memberId: f.memberId } : undefined,
    preferredSetting: f.preferredSetting,
    acceptsTelehealth: f.acceptsTelehealth,
    communityLocation: f.preferredSetting === 'community' ? f.community : undefined,
    availability: f.bands.map((k) => {
      const [day, id] = k.split(':');
      const band = TIME_BANDS.find((b) => b.id === id)!;
      return { day: Number(day), start: band.start, end: band.end };
    }),
    consent: { agreed: f.consent.agreed as true, signatureName: f.consent.signatureName, hipaaAcknowledged: f.consent.hipaaAcknowledged, policyAgreed: f.consent.policyAgreed },
  };
}

function validate(f: FormState): Record<string, string> {
  const parsed = intakeSchema.safeParse(toSubmission(f));
  const out: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) out[i.path.join('.')] ??= i.message;
  return out;
}

const stepOf = (path: string) => STEPS.findIndex((s) => s.prefixes.some((p) => path === p || path.startsWith(`${p}.`)));

export function IntakePage() {
  const config = usePublicConfig();
  const submit = useSubmitIntake();
  const [f, setF] = useState<FormState>(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [visited, setVisited] = useState(0);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const demo = config.data?.authMode === 'demo';

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const setIn = <K extends 'child' | 'guardian' | 'address' | 'community' | 'consent'>(k: K, field: keyof FormState[K], v: unknown) =>
    setF((p) => ({ ...p, [k]: { ...p[k], [field]: v } }));
  const err = (path: string) => errors[path];

  const go = (target: number) => {
    setStep(target);
    setVisited((v) => Math.max(v, target));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function next() {
    const all = validate(f);
    const mine = Object.fromEntries(Object.entries(all).filter(([p]) => stepOf(p) === step));
    setErrors(mine);
    if (Object.keys(mine).length === 0) go(step + 1);
  }

  async function onSubmit() {
    const all = validate(f);
    if (Object.keys(all).length) {
      const first = Math.min(...Object.keys(all).map(stepOf).filter((i) => i >= 0));
      setErrors(Object.fromEntries(Object.entries(all).filter(([p]) => stepOf(p) === first)));
      go(first);
      return;
    }
    setErrors({});
    try {
      setResult(await submit.mutateAsync(toSubmission(f)));
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiRequestError && e.body?.issues) setErrors(Object.fromEntries(e.body.issues.map((i) => [i.path, i.message])));
    }
  }

  if (result) return <Success result={result} onAgain={() => { setF(EMPTY); setResult(null); setStep(0); setVisited(0); }} />;

  const insured = f.fundingSource === 'insurance';
  const current = STEPS[step]!;

  return (
    <div className="min-h-screen bg-cream-100">
      <ConceptNotice />
      <header className="border-b border-cream-200 bg-cream-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/"><Wordmark /></Link>
          <a href={PRACTICE.phoneHref} className="flex items-center gap-1.5 text-sm font-bold text-seed-900">
            <CallRegular /> <span className="hidden sm:inline">Questions?</span> {PRACTICE.phone}
          </a>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[260px_1fr] lg:py-12">
        {/* step rail */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <p className="eyebrow mb-2">Request services</p>
          <h1 className="text-2xl font-black tracking-tight text-seed-950">New patient intake</h1>
          <p className="mt-1 text-sm text-ink-500">About 10 minutes. Replaces the printed intake packet.</p>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-seed-100 lg:hidden" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Form progress">
            <div className="h-full rounded-full bg-seed-500 transition-[width]" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <p className="mt-2 text-sm font-semibold text-ink-700 lg:hidden">Step {step + 1} of {STEPS.length}: {current.title}</p>
          <ol className="mt-6 hidden space-y-1 lg:block">
            {STEPS.map((s, i) => {
              const done = i < step || (i <= visited && i !== step);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={i > visited}
                    onClick={() => go(i)}
                    className={`focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:cursor-default ${
                      i === step ? 'bg-white text-seed-950 shadow-card' : i <= visited ? 'text-ink-700 hover:bg-white/60' : 'text-ink-500/70'
                    }`}
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${i === step ? 'bg-seed-500 text-white' : done ? 'bg-seed-100 text-seed-700' : 'bg-cream-200 text-ink-500'}`}>
                      {done ? <CheckmarkRegular /> : i + 1}
                    </span>
                    {s.title}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* step body */}
        <div className="min-w-0">
          {demo && step === 0 && (
            <Alert
              tone="warning"
              className="mb-4"
              title="Demo form"
              action={
                <Button variant="secondary" size="sm" onClick={() => { setF(SAMPLE); setErrors({}); }}>
                  <SparkleRegular /> Fill sample family
                </Button>
              }
            >
              Please don’t enter real information about a child. To request real services, call {PRACTICE.phone}.
            </Alert>
          )}

          <div className="card p-5 sm:p-8">
            <p className="eyebrow mb-1">Step {step + 1} of {STEPS.length}</p>
            <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-seed-950">{current.title}</h2>

            {current.id === 'child' && (
              <Grid>
                <Field label="Child’s first name" required error={err('child.firstName')}>
                  <Input inputSize="lg" autoComplete="off" value={f.child.firstName} onChange={(e) => setIn('child', 'firstName', e.target.value)} />
                </Field>
                <Field label="Child’s last name" required error={err('child.lastName')}>
                  <Input inputSize="lg" autoComplete="off" value={f.child.lastName} onChange={(e) => setIn('child', 'lastName', e.target.value)} />
                </Field>
                <Field label="Date of birth" required error={err('child.dateOfBirth')}>
                  <BirthDatePicker key={f.child.dateOfBirth ? 'set' : 'empty'} value={f.child.dateOfBirth} onChange={(v) => setIn('child', 'dateOfBirth', v)} />
                </Field>
                <Field label="Language spoken at home" hint="We’ll try to match a therapist who speaks it.">
                  <Select size="lg" value={f.child.preferredLanguage} onValueChange={(v) => setIn('child', 'preferredLanguage', v)} options={LANGUAGES.map((l) => ({ value: l, label: l }))} />
                </Field>
              </Grid>
            )}

            {current.id === 'family' && (
              <div className="space-y-8">
                <Grid>
                  <Field label="Your first name" required error={err('guardian.firstName')}>
                    <Input inputSize="lg" autoComplete="given-name" value={f.guardian.firstName} onChange={(e) => setIn('guardian', 'firstName', e.target.value)} />
                  </Field>
                  <Field label="Your last name" required error={err('guardian.lastName')}>
                    <Input inputSize="lg" autoComplete="family-name" value={f.guardian.lastName} onChange={(e) => setIn('guardian', 'lastName', e.target.value)} />
                  </Field>
                  <Field label="Relationship to child">
                    <Select size="lg" value={f.guardian.relationship} onValueChange={(v) => setIn('guardian', 'relationship', v)} options={['Mother', 'Father', 'Guardian', 'Grandparent', 'Foster parent', 'Other'].map((r) => ({ value: r, label: r }))} />
                  </Field>
                  <Field label="Mobile phone" required error={err('guardian.phone')}>
                    <Input inputSize="lg" type="tel" inputMode="tel" autoComplete="tel" placeholder="(516) 555-0123" value={f.guardian.phone} onChange={(e) => setIn('guardian', 'phone', e.target.value)} />
                  </Field>
                  <Field label="Email" hint="We’ll only email you about scheduling." error={err('guardian.email')} className="sm:col-span-2">
                    <Input inputSize="lg" type="email" autoComplete="email" placeholder="you@example.com" value={f.guardian.email} onChange={(e) => setIn('guardian', 'email', e.target.value)} />
                  </Field>
                </Grid>
                <div>
                  <h3 className="mb-1 font-extrabold text-ink-900">Home address</h3>
                  <p className="mb-4 text-sm text-ink-500">Many of our therapists travel to families. Your address helps us find someone nearby.</p>
                  <Grid>
                    <Field label="Street address" required error={err('address.line1')} className="sm:col-span-2">
                      <Input inputSize="lg" autoComplete="address-line1" placeholder="123 Main St" value={f.address.line1} onChange={(e) => setIn('address', 'line1', e.target.value)} />
                    </Field>
                    <Field label="City / town" required error={err('address.city')}>
                      <Input inputSize="lg" autoComplete="address-level2" value={f.address.city} onChange={(e) => setIn('address', 'city', e.target.value)} />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="State" required error={err('address.state')}>
                        <Input inputSize="lg" maxLength={2} autoComplete="address-level1" value={f.address.state} onChange={(e) => setIn('address', 'state', e.target.value.toUpperCase())} />
                      </Field>
                      <Field label="ZIP" required error={err('address.postalCode')}>
                        <Input inputSize="lg" inputMode="numeric" maxLength={5} autoComplete="postal-code" value={f.address.postalCode} onChange={(e) => setIn('address', 'postalCode', e.target.value.replace(/\D/g, ''))} />
                      </Field>
                    </div>
                  </Grid>
                </div>
              </div>
            )}

            {current.id === 'needs' && (
              <div className="space-y-6">
                <Field label="Which services are you looking for?" required error={err('services')}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([
                      ['speech', <ChatRegular key="i" />, 'Talking, understanding, sounds, stuttering, social communication'],
                      ['ot', <HandLeftRegular key="i" />, 'Fine motor, handwriting, sensory, self-care skills'],
                    ] as const).map(([d, icon, hint]) => (
                      <ChoiceCard
                        key={d}
                        multi
                        selected={f.services.includes(d)}
                        onClick={() => set('services', f.services.includes(d) ? f.services.filter((x) => x !== d) : [...f.services, d])}
                        icon={icon}
                        title={DISCIPLINE_LABEL[d]}
                        hint={hint}
                      />
                    ))}
                  </div>
                </Field>
                <Field label="Tell us about your concerns" required error={err('concerns')} hint="What have you noticed, and when? Has a doctor or teacher mentioned anything?">
                  <Textarea rows={5} value={f.concerns} onChange={(e) => set('concerns', e.target.value)} placeholder="For example: She uses about 15 words and gets frustrated when we don’t understand her…" />
                </Field>
                <div className="rounded-2xl border border-clay-200 bg-clay-50 p-4">
                  <Checkbox
                    checked={f.urgentConcern}
                    onCheckedChange={(v) => set('urgentConcern', v)}
                    label={<><strong className="text-ink-900">My child has feeding, swallowing or safety concerns.</strong> We’ll prioritize your request.</>}
                  />
                </div>
              </div>
            )}

            {current.id === 'coverage' && (
              <div className="space-y-6">
                <Grid>
                  <Field label="Who referred you?" required error={err('referralSource')}>
                    <Select size="lg" placeholder="Choose one" value={f.referralSource} onValueChange={(v) => set('referralSource', v)} options={REFERRAL_SOURCES.map((r) => ({ value: r, label: REFERRAL_LABEL[r] }))} />
                  </Field>
                  <Field label="Referring doctor, school or office" hint="Optional">
                    <Input inputSize="lg" placeholder="e.g. Mineola Pediatrics" value={f.referringProvider} onChange={(e) => set('referringProvider', e.target.value)} />
                  </Field>
                </Grid>
                <Field label="How will services be covered?" required error={err('fundingSource')}>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {FUNDING_OPTIONS.map((o) => (
                      <ChoiceCard key={o.id} selected={f.fundingSource === o.id} onClick={() => set('fundingSource', o.id)} title={FUNDING_LABEL[o.id]} hint={o.hint} />
                    ))}
                  </div>
                </Field>
                {insured && (
                  <Grid>
                    <Field label="Insurance plan" required>
                      <Select size="lg" placeholder="Choose your plan" value={f.plan} onValueChange={(v) => set('plan', v)} options={[...INSURANCE.plans, OTHER_PLAN].map((p) => ({ value: p, label: p }))} />
                    </Field>
                    <Field label="Member ID" required error={err('insurance.memberId')}>
                      <Input inputSize="lg" placeholder="As shown on the card" value={f.memberId} onChange={(e) => set('memberId', e.target.value)} />
                    </Field>
                    {f.plan === OTHER_PLAN && (
                      <Field label="Plan name" hint="Our front desk will check your benefits." className="sm:col-span-2">
                        <Input inputSize="lg" value={f.otherPlan} onChange={(e) => set('otherPlan', e.target.value)} />
                      </Field>
                    )}
                  </Grid>
                )}
              </div>
            )}

            {current.id === 'schedule' && (
              <div className="space-y-7">
                <Field label="Where would you like sessions?">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {([
                      ['home', <HomeRegular key="i" />, 'We come to you'],
                      ['community', <BackpackRegular key="i" />, 'At school or daycare'],
                      ['clinic', <BuildingRegular key="i" />, 'Hillside Ave office'],
                      ['telehealth', <VideoRegular key="i" />, 'Secure video'],
                    ] as const).map(([s, icon, hint]) => (
                      <ChoiceCard key={s} selected={f.preferredSetting === s} onClick={() => set('preferredSetting', s)} icon={icon} title={SETTING_LABEL[s]} hint={hint} />
                    ))}
                  </div>
                </Field>
                {f.preferredSetting === 'community' && (
                  <Grid>
                    <Field label="School or daycare name" required error={err('communityLocation.name') ?? err('communityLocation')} className="sm:col-span-2">
                      <Input inputSize="lg" value={f.community.name} onChange={(e) => setIn('community', 'name', e.target.value)} />
                    </Field>
                    <Field label="Street address" required error={err('communityLocation.line1')}>
                      <Input inputSize="lg" value={f.community.line1} onChange={(e) => setIn('community', 'line1', e.target.value)} />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="City" required error={err('communityLocation.city')}>
                        <Input inputSize="lg" value={f.community.city} onChange={(e) => setIn('community', 'city', e.target.value)} />
                      </Field>
                      <Field label="ZIP" required error={err('communityLocation.postalCode')}>
                        <Input inputSize="lg" inputMode="numeric" maxLength={5} value={f.community.postalCode} onChange={(e) => setIn('community', 'postalCode', e.target.value.replace(/\D/g, ''))} />
                      </Field>
                    </div>
                  </Grid>
                )}
                {f.preferredSetting !== 'telehealth' && (
                  <Checkbox checked={f.acceptsTelehealth} onCheckedChange={(v) => set('acceptsTelehealth', v)} label="Teletherapy is OK if it means starting sooner" />
                )}
                <Field label="When is your child usually free?" required error={err('availability')} hint="Tap every time that could work each week. More options usually means a faster start.">
                  <AvailabilityGrid bands={f.bands} onChange={(bands) => set('bands', bands)} />
                </Field>
              </div>
            )}

            {current.id === 'review' && <Review f={f} onEdit={go} insured={insured} />}

            {current.id === 'review' && (
              <div className="mt-8 space-y-4 rounded-2xl border border-seed-200 bg-seed-50 p-5">
                <Checkbox
                  checked={f.consent.agreed}
                  onCheckedChange={(v) => setIn('consent', 'agreed', v)}
                  label={<><strong className="text-ink-900">Consent to treat (required).</strong> I am this child’s parent or legal guardian, and I consent to {PRACTICE.name} contacting me and providing evaluation and therapy services.</>}
                />
                {err('consent.agreed') && <p className="text-xs font-semibold text-red-700">{err('consent.agreed')}</p>}
                <Checkbox
                  checked={f.consent.hipaaAcknowledged}
                  onCheckedChange={(v) => setIn('consent', 'hipaaAcknowledged', v)}
                  label={<><strong className="text-ink-900">HIPAA privacy notice.</strong> I acknowledge how my child’s health information is protected.</>}
                  description="Optional now; otherwise it’ll be waiting in your family portal."
                />
                <Checkbox
                  checked={f.consent.policyAgreed}
                  onCheckedChange={(v) => setIn('consent', 'policyAgreed', v)}
                  label={<><strong className="text-ink-900">Office policy.</strong> 24-hour cancellation notice, attendance and teletherapy rules.</>}
                  description="Optional now; otherwise it’ll be waiting in your family portal."
                />
                <Field label="Type your full name to sign" required error={err('consent.signatureName')}>
                  <Input inputSize="lg" value={f.consent.signatureName} onChange={(e) => setIn('consent', 'signatureName', e.target.value)} className="font-semibold" placeholder="Full name" />
                </Field>
                <p className="text-xs text-ink-500">
                  <Link to="/new-patients" className="font-semibold underline" target="_blank">Office policy</Link> · Your information is kept in strict confidence.
                </p>
              </div>
            )}

            {submit.isError && !(submit.error instanceof ApiRequestError && submit.error.body?.issues) && (
              <Alert tone="error" className="mt-6" title="We couldn’t send your request">{errorMessage(submit.error)}</Alert>
            )}

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-cream-200 pt-6">
              <Button size="lg" variant="ghost" disabled={step === 0} onClick={() => go(step - 1)}>
                <ArrowLeftRegular /> Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button size="lg" onClick={next}>
                  Continue <ArrowRightRegular />
                </Button>
              ) : (
                <Button size="lg" onClick={onSubmit} disabled={submit.isPending}>
                  {submit.isPending ? 'Sending…' : 'Submit request'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function ChoiceCard({ selected, onClick, icon, title, hint, multi }: { selected: boolean; onClick: () => void; icon?: ReactNode; title: string; hint?: string; multi?: boolean }) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'focus-ring relative flex h-full flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition',
        selected ? 'border-seed-500 bg-seed-50 shadow-card' : 'border-cream-200 bg-white hover:border-seed-200 hover:bg-cream-50',
      )}
    >
      <span className={`absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full border-2 text-[11px] ${selected ? 'border-seed-500 bg-seed-500 text-white' : 'border-cream-300'}`}>
        {selected && <CheckmarkRegular />}
      </span>
      {icon && <span className={`text-2xl ${selected ? 'text-seed-600' : 'text-ink-500'}`}>{icon}</span>}
      <span className="pr-6 font-extrabold text-ink-900">{title}</span>
      {hint && <span className="text-xs text-ink-500">{hint}</span>}
    </button>
  );
}

function AvailabilityGrid({ bands, onChange }: { bands: string[]; onChange: (b: string[]) => void }) {
  const has = useMemo(() => new Set(bands), [bands]);
  const toggle = (key: string) => onChange(has.has(key) ? bands.filter((b) => b !== key) : [...bands, key]);
  const preset = (ids: string[], days = [1, 2, 3, 4, 5]) => onChange([...new Set([...bands, ...days.flatMap((d) => ids.map((id) => `${d}:${id}`))])]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className="chip hover:border-seed-300" onClick={() => preset(['morning'])}>+ Weekday mornings</button>
        <button type="button" className="chip hover:border-seed-300" onClick={() => preset(['afterschool'])}>+ Weekdays after school</button>
        <button type="button" className="chip hover:border-seed-300" onClick={() => preset(['morning', 'midday'], [6])}>+ Saturday</button>
        {bands.length > 0 && <button type="button" className="chip text-clay-700!" onClick={() => onChange([])}>Clear</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1.5">
          <thead>
            <tr>
              <th />
              {DAYS.map((d) => <th key={d} className="text-xs font-bold uppercase tracking-wider text-ink-500">{DAY_SHORT[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {TIME_BANDS.map((b) => (
              <tr key={b.id}>
                <th scope="row" className="pr-2 text-left">
                  <span className="block text-sm font-bold text-ink-900">{b.label}</span>
                  <span className="text-xs text-ink-500">{b.hint}</span>
                </th>
                {DAYS.map((d) => {
                  const key = `${d}:${b.id}`;
                  const on = has.has(key);
                  return (
                    <td key={key}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${DAY_SHORT[d]} ${b.label}`}
                        onClick={() => toggle(key)}
                        className={`focus-ring grid h-11 w-full place-items-center rounded-xl border-2 text-sm transition ${on ? 'border-seed-500 bg-seed-500 text-white' : 'border-cream-200 bg-white text-transparent hover:border-seed-200 hover:text-seed-300'}`}
                      >
                        <CheckmarkRegular />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs font-semibold text-ink-500">{bands.length} time{bands.length === 1 ? '' : 's'} selected</p>
    </div>
  );
}

function Review({ f, onEdit, insured }: { f: FormState; onEdit: (step: number) => void; insured: boolean }) {
  const rows: { step: number; title: string; lines: string[] }[] = [
    { step: 0, title: 'Child', lines: [`${f.child.firstName} ${f.child.lastName}`, `Born ${f.child.dateOfBirth}`, `Language: ${f.child.preferredLanguage}`] },
    { step: 1, title: 'Parent / guardian', lines: [`${f.guardian.firstName} ${f.guardian.lastName} (${f.guardian.relationship})`, f.guardian.phone, f.guardian.email, `${f.address.line1}, ${f.address.city}, ${f.address.state} ${f.address.postalCode}`].filter(Boolean) },
    { step: 2, title: 'Services', lines: [f.services.map((s) => DISCIPLINE_LABEL[s]).join(' + '), f.urgentConcern ? 'Flagged: feeding/swallowing/safety concern' : '', f.concerns].filter(Boolean) },
    { step: 3, title: 'Coverage', lines: [f.fundingSource ? FUNDING_LABEL[f.fundingSource] : '', insured ? `${f.plan === OTHER_PLAN ? f.otherPlan : f.plan} · ${f.memberId}` : '', f.referralSource ? `Referred by: ${REFERRAL_LABEL[f.referralSource]}${f.referringProvider ? `, ${f.referringProvider}` : ''}` : ''].filter(Boolean) },
    { step: 4, title: 'Sessions', lines: [SETTING_LABEL[f.preferredSetting] + (f.acceptsTelehealth ? ' (teletherapy OK)' : ''), `${f.bands.length} weekly time${f.bands.length === 1 ? '' : 's'} available`] },
  ];
  return (
    <div className="divide-y divide-cream-200 rounded-2xl border border-cream-200">
      {rows.map((r) => (
        <div key={r.title} className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wider text-ink-500">{r.title}</p>
            {r.lines.map((l, i) => <p key={i} className={`text-sm ${i === 0 ? 'font-bold text-ink-900' : 'text-ink-700'} line-clamp-2`}>{l}</p>)}
          </div>
          <Button size="sm" variant="ghost" onClick={() => onEdit(r.step)}><EditRegular /> Edit</Button>
        </div>
      ))}
    </div>
  );
}

function Success({ result, onAgain }: { result: IntakeResult; onAgain: () => void }) {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-cream-100">
      <ConceptNotice />
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:py-24">
        <CheckmarkCircle48Filled className="mx-auto text-seed-500" />
        <h1 className="mt-4 text-3xl font-black tracking-tight text-seed-950">Thank you. We’ve got it.</h1>
        <p className="mt-2 text-ink-700">
          {result.cases.length > 0
            ? `We opened a request for ${result.cases.map((c) => DISCIPLINE_LABEL[c.discipline].toLowerCase()).join(' and ')}.`
            : 'Your child already has an open request for these services, so our coordinator will follow up on that one.'}
        </p>
        <div className="card mx-auto mt-8 max-w-sm p-6">
          <p className="eyebrow">Your reference number</p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-[0.15em] text-seed-950">{result.submissionCode}</p>
        </div>
        <ol className="mx-auto mt-10 max-w-md space-y-4 text-left">
          {[
            ['Your checklist', 'Your family portal shows what’s left: forms to sign, documents to upload and school-district steps.'],
            ['Within 2 business days', 'Our intake coordinator calls to confirm details and insurance.'],
            ['Matching', 'We pair you with a licensed therapist whose schedule and location fit yours.'],
            ['Evaluation', 'Your first session is an evaluation; your therapist then recommends a plan.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-seed-950 text-sm font-black text-cream-50">{i + 1}</span>
              <span><span className="block font-bold text-ink-900">{t}</span><span className="text-sm text-ink-500">{d}</span></span>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {result.familyKey && (
            <Button size="lg" onClick={() => { setPersona({ kind: 'parent', key: `parent:${result.familyKey}`, name: 'Your family' }); nav('/family'); }}>
              Open your family portal <ArrowRightRegular />
            </Button>
          )}
          <Link to="/" className="inline-flex h-12 items-center rounded-xl border border-cream-300 bg-white px-6 font-bold text-seed-900 hover:bg-seed-50">Back to home</Link>
          <Button size="lg" variant="ghost" onClick={onAgain}>Request for another child</Button>
        </div>
      </div>
    </div>
  );
}
