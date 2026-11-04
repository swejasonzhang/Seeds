import { useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Radio,
  RadioGroup,
  Select,
  Text,
  Textarea,
  Title2,
  Title3,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { CheckmarkCircle48Filled } from '@fluentui/react-icons';
import {
  DAY_SHORT,
  DISCIPLINE_LABEL,
  FUNDING_LABEL,
  FUNDING_SOURCES,
  REFERRAL_LABEL,
  REFERRAL_SOURCES,
  SETTING_LABEL,
  SETTINGS,
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
import { DemoBanner } from '../components/Layout';

const LANGUAGES = ['English', 'Spanish', 'Mandarin', 'Cantonese', 'Haitian Creole', 'Farsi', 'Korean', 'Hebrew', 'Russian', 'Other'];
const DAYS = [1, 2, 3, 4, 5, 6];

const useStyles = makeStyles({
  page: { minHeight: '100vh', backgroundColor: tokens.colorNeutralBackground2 },
  hero: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalXL}`,
    textAlign: 'center',
  },
  form: { maxWidth: '820px', margin: '0 auto', padding: tokens.spacingHorizontalL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  card: { padding: tokens.spacingHorizontalXL, gap: tokens.spacingVerticalM },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: tokens.spacingHorizontalM },
  grid: { borderCollapse: 'collapse', width: '100%', '& td, & th': { padding: '6px', textAlign: 'center' } },
  done: { maxWidth: '640px', margin: '48px auto', padding: tokens.spacingHorizontalXL, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' },
  code: { fontSize: tokens.fontSizeHero800, fontWeight: tokens.fontWeightBold, letterSpacing: '2px', color: tokens.colorBrandForeground1 },
});

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
  insurance: { payer: string; memberId: string };
  preferredSetting: SessionSetting;
  acceptsTelehealth: boolean;
  community: { name: string; line1: string; city: string; state: string; postalCode: string };
  bands: Set<string>; // `${day}:${bandId}`
  consent: { agreed: boolean; signatureName: string };
}

const initial: FormState = {
  child: { firstName: '', lastName: '', dateOfBirth: '', preferredLanguage: 'English' },
  guardian: { firstName: '', lastName: '', relationship: 'Mother', phone: '', email: '' },
  address: { line1: '', city: '', state: 'NY', postalCode: '' },
  services: [],
  concerns: '',
  urgentConcern: false,
  referralSource: '',
  referringProvider: '',
  fundingSource: '',
  insurance: { payer: '', memberId: '' },
  preferredSetting: 'home',
  acceptsTelehealth: false,
  community: { name: '', line1: '', city: '', state: 'NY', postalCode: '' },
  bands: new Set(),
  consent: { agreed: false, signatureName: '' },
};

function toSubmission(f: FormState): IntakeSubmission {
  const availability = [...f.bands].map((k) => {
    const [day, id] = k.split(':');
    const band = TIME_BANDS.find((b) => b.id === id)!;
    return { day: Number(day), start: band.start, end: band.end };
  });
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
    insurance: insured ? f.insurance : undefined,
    preferredSetting: f.preferredSetting,
    acceptsTelehealth: f.acceptsTelehealth,
    communityLocation: f.preferredSetting === 'community' ? f.community : undefined,
    availability,
    consent: { agreed: f.consent.agreed as true, signatureName: f.consent.signatureName },
  };
}

export function IntakePage() {
  const s = useStyles();
  const config = usePublicConfig();
  const submit = useSubmitIntake();
  const [f, setF] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<IntakeResult | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const setIn = <K extends 'child' | 'guardian' | 'address' | 'insurance' | 'community' | 'consent'>(k: K, field: keyof FormState[K], v: unknown) =>
    setF((p) => ({ ...p, [k]: { ...p[k], [field]: v } }));
  const err = (path: string) => errors[path];
  const insured = f.fundingSource === 'insurance' || f.fundingSource === 'medicaid';

  const toggleBand = (key: string) =>
    setF((p) => {
      const bands = new Set(p.bands);
      if (bands.has(key)) bands.delete(key);
      else bands.add(key);
      return { ...p, bands };
    });

  async function onSubmit() {
    const parsed = intakeSchema.safeParse(toSubmission(f));
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[i.path.join('.')] ??= i.message;
      setErrors(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErrors({});
    try {
      setResult(await submit.mutateAsync(toSubmission(f)));
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiRequestError && e.body?.issues) {
        setErrors(Object.fromEntries(e.body.issues.map((i) => [i.path, i.message])));
      }
    }
  }

  const errorCount = Object.keys(errors).length;

  if (result) {
    return (
      <div className={s.page}>
        <div className={s.done}>
          <CheckmarkCircle48Filled primaryFill={tokens.colorPaletteGreenForeground1} />
          <Title2>Thank you, we've received your request</Title2>
          <Text>Your reference number is</Text>
          <div className={s.code}>{result.submissionCode}</div>
          <Text>
            {result.cases.length > 0
              ? `We opened ${result.cases.map((c) => DISCIPLINE_LABEL[c.discipline].toLowerCase()).join(' and ')} for your child. Our intake coordinator will contact you within 2 business days.`
              : 'Your child already has an open request with us for these services. Our coordinator will follow up.'}
          </Text>
          {result.alreadyOpen.length > 0 && result.cases.length > 0 && (
            <Text size={200}>Already open: {result.alreadyOpen.map((d) => DISCIPLINE_LABEL[d]).join(', ')}</Text>
          )}
          <Button appearance="secondary" onClick={() => { setF(initial); setResult(null); }}>
            Submit another child
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      {config.data?.authMode === 'demo' && <DemoBanner />}
      <div className={s.hero}>
        <Title2 as="h1">SEEDS of the Willistons</Title2>
        <Text as="p" size={400}>
          Speech &amp; occupational therapy for children · Request services
        </Text>
      </div>
      <div className={s.form}>
        {errorCount > 0 && (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Please fix {errorCount} highlighted {errorCount === 1 ? 'field' : 'fields'}</MessageBarTitle>
            </MessageBarBody>
          </MessageBar>
        )}
        {submit.isError && !(submit.error instanceof ApiRequestError && submit.error.body?.issues) && (
          <MessageBar intent="error">
            <MessageBarBody>{errorMessage(submit.error)}</MessageBarBody>
          </MessageBar>
        )}

        <Section title="About your child">
          <div className={s.row}>
            <Field label="First name" required validationMessage={err('child.firstName')}>
              <Input value={f.child.firstName} onChange={(_, d) => setIn('child', 'firstName', d.value)} />
            </Field>
            <Field label="Last name" required validationMessage={err('child.lastName')}>
              <Input value={f.child.lastName} onChange={(_, d) => setIn('child', 'lastName', d.value)} />
            </Field>
            <Field label="Date of birth" required validationMessage={err('child.dateOfBirth')}>
              <Input type="date" value={f.child.dateOfBirth} onChange={(_, d) => setIn('child', 'dateOfBirth', d.value)} />
            </Field>
            <Field label="Language spoken at home">
              <Select value={f.child.preferredLanguage} onChange={(_, d) => setIn('child', 'preferredLanguage', d.value)}>
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Parent or guardian">
          <div className={s.row}>
            <Field label="First name" required validationMessage={err('guardian.firstName')}>
              <Input value={f.guardian.firstName} onChange={(_, d) => setIn('guardian', 'firstName', d.value)} />
            </Field>
            <Field label="Last name" required validationMessage={err('guardian.lastName')}>
              <Input value={f.guardian.lastName} onChange={(_, d) => setIn('guardian', 'lastName', d.value)} />
            </Field>
            <Field label="Relationship">
              <Select value={f.guardian.relationship} onChange={(_, d) => setIn('guardian', 'relationship', d.value)}>
                {['Mother', 'Father', 'Guardian', 'Grandparent', 'Foster parent', 'Other'].map((r) => <option key={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label="Phone" required validationMessage={err('guardian.phone')}>
              <Input type="tel" value={f.guardian.phone} onChange={(_, d) => setIn('guardian', 'phone', d.value)} placeholder="(516) 555-0123" />
            </Field>
            <Field label="Email" validationMessage={err('guardian.email')}>
              <Input type="email" value={f.guardian.email} onChange={(_, d) => setIn('guardian', 'email', d.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Home address" hint="Our therapists travel to many families. Your address helps us find someone nearby.">
          <div className={s.row}>
            <Field label="Street address" required validationMessage={err('address.line1')}>
              <Input value={f.address.line1} onChange={(_, d) => setIn('address', 'line1', d.value)} />
            </Field>
            <Field label="City / town" required validationMessage={err('address.city')}>
              <Input value={f.address.city} onChange={(_, d) => setIn('address', 'city', d.value)} />
            </Field>
            <Field label="State" required validationMessage={err('address.state')}>
              <Input value={f.address.state} maxLength={2} onChange={(_, d) => setIn('address', 'state', d.value)} />
            </Field>
            <Field label="ZIP code" required validationMessage={err('address.postalCode')}>
              <Input value={f.address.postalCode} inputMode="numeric" maxLength={5} onChange={(_, d) => setIn('address', 'postalCode', d.value)} />
            </Field>
          </div>
        </Section>

        <Section title="What services are you looking for?">
          <Field required validationMessage={err('services')}>
            <div style={{ display: 'flex', gap: 24 }}>
              {(['speech', 'ot'] as Discipline[]).map((d) => (
                <Checkbox
                  key={d}
                  label={DISCIPLINE_LABEL[d]}
                  checked={f.services.includes(d)}
                  onChange={(_, data) => set('services', data.checked ? [...f.services, d] : f.services.filter((x) => x !== d))}
                />
              ))}
            </div>
          </Field>
          <Field label="Tell us about your concerns" required validationMessage={err('concerns')}>
            <Textarea rows={4} value={f.concerns} onChange={(_, d) => set('concerns', d.value)} placeholder="What have you noticed? Has a doctor or teacher mentioned anything?" />
          </Field>
          <Checkbox
            checked={f.urgentConcern}
            onChange={(_, d) => set('urgentConcern', Boolean(d.checked))}
            label="My child has feeding, swallowing, or safety concerns (we'll prioritize this)"
          />
        </Section>

        <Section title="Referral and funding">
          <div className={s.row}>
            <Field label="Who referred you?" required validationMessage={err('referralSource')}>
              <Select value={f.referralSource} onChange={(_, d) => set('referralSource', d.value as ReferralSource)}>
                <option value="">Choose…</option>
                {REFERRAL_SOURCES.map((r) => <option key={r} value={r}>{REFERRAL_LABEL[r]}</option>)}
              </Select>
            </Field>
            <Field label="Referring doctor / office (optional)">
              <Input value={f.referringProvider} onChange={(_, d) => set('referringProvider', d.value)} />
            </Field>
            <Field label="How will services be paid for?" required validationMessage={err('fundingSource')}>
              <Select value={f.fundingSource} onChange={(_, d) => set('fundingSource', d.value as FundingSource)}>
                <option value="">Choose…</option>
                {FUNDING_SOURCES.map((x) => <option key={x} value={x}>{FUNDING_LABEL[x]}</option>)}
              </Select>
            </Field>
          </div>
          {insured && (
            <div className={s.row}>
              <Field label="Insurance plan">
                <Input value={f.insurance.payer} onChange={(_, d) => setIn('insurance', 'payer', d.value)} />
              </Field>
              <Field label="Member ID" required validationMessage={err('insurance.memberId')}>
                <Input value={f.insurance.memberId} onChange={(_, d) => setIn('insurance', 'memberId', d.value)} />
              </Field>
            </div>
          )}
        </Section>

        <Section title="Where and when" hint="The more times you can offer, the sooner we can match you with a therapist.">
          <Field label="Where would you like sessions?">
            <RadioGroup layout="horizontal" value={f.preferredSetting} onChange={(_, d) => set('preferredSetting', d.value as SessionSetting)}>
              {SETTINGS.map((x) => <Radio key={x} value={x} label={SETTING_LABEL[x]} />)}
            </RadioGroup>
          </Field>
          {f.preferredSetting === 'community' && (
            <div className={s.row}>
              <Field label="School / daycare name" required validationMessage={err('communityLocation.name') ?? err('communityLocation')}>
                <Input value={f.community.name} onChange={(_, d) => setIn('community', 'name', d.value)} />
              </Field>
              <Field label="Street address" required validationMessage={err('communityLocation.line1')}>
                <Input value={f.community.line1} onChange={(_, d) => setIn('community', 'line1', d.value)} />
              </Field>
              <Field label="City / town" required validationMessage={err('communityLocation.city')}>
                <Input value={f.community.city} onChange={(_, d) => setIn('community', 'city', d.value)} />
              </Field>
              <Field label="ZIP" required validationMessage={err('communityLocation.postalCode')}>
                <Input value={f.community.postalCode} maxLength={5} onChange={(_, d) => setIn('community', 'postalCode', d.value)} />
              </Field>
            </div>
          )}
          {f.preferredSetting !== 'telehealth' && (
            <Checkbox checked={f.acceptsTelehealth} onChange={(_, d) => set('acceptsTelehealth', Boolean(d.checked))} label="Telehealth is OK if it means starting sooner" />
          )}
          <Field label="When is your child available? (check all that work)" required validationMessage={err('availability')}>
            <AvailabilityGrid bands={f.bands} onToggle={toggleBand} className={s.grid} />
          </Field>
        </Section>

        <Section title="Consent">
          <Checkbox
            checked={f.consent.agreed}
            onChange={(_, d) => setIn('consent', 'agreed', Boolean(d.checked))}
            label="I am the child's parent or legal guardian, and I consent to SEEDS of the Willistons contacting me and providing evaluation and therapy services."
          />
          {err('consent.agreed') && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{err('consent.agreed')}</Text>}
          <Field label="Type your full name to sign" required validationMessage={err('consent.signatureName')}>
            <Input value={f.consent.signatureName} onChange={(_, d) => setIn('consent', 'signatureName', d.value)} />
          </Field>
        </Section>

        <Button appearance="primary" size="large" onClick={onSubmit} disabled={submit.isPending}>
          {submit.isPending ? 'Submitting…' : 'Submit request'}
        </Button>
        <Text size={200} align="center" style={{ paddingBottom: 32 }}>
          Questions? Call our office. Your information is kept private and used only to arrange your child's care.
        </Text>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <Card className={s.card}>
      <Title3 as="h2">{title}</Title3>
      {hint && <Text>{hint}</Text>}
      {children}
    </Card>
  );
}

function AvailabilityGrid({ bands, onToggle, className }: { bands: Set<string>; onToggle: (key: string) => void; className: string }) {
  const header = useMemo(() => DAYS.map((d) => <th key={d}>{DAY_SHORT[d]}</th>), []);
  return (
    <table className={className}>
      <thead>
        <tr>
          <th />
          {header}
        </tr>
      </thead>
      <tbody>
        {TIME_BANDS.map((b) => (
          <tr key={b.id}>
            <td style={{ textAlign: 'left' }}>
              <Text weight="semibold">{b.label}</Text> <Text size={200}>{b.hint}</Text>
            </td>
            {DAYS.map((d) => {
              const key = `${d}:${b.id}`;
              return (
                <td key={key}>
                  <Checkbox aria-label={`${DAY_SHORT[d]} ${b.label}`} checked={bands.has(key)} onChange={() => onToggle(key)} />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
