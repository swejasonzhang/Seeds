import { z } from 'zod';
import { DISCIPLINES, FUNDING_SOURCES, REFERRAL_SOURCES, SETTINGS } from './domain.ts';

// One schema validates the parent-facing form in the browser AND the public API endpoint.

const name = z.string().trim().min(1, 'Required').max(60);
const state = z
  .string()
  .trim()
  .length(2, 'Use the 2-letter state code')
  .transform((s) => s.toUpperCase());
const zip = z.string().trim().regex(/^\d{5}$/, 'Enter a 5-digit ZIP code');

export const weeklyWindowSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    start: z.number().int().min(0).max(24 * 60),
    end: z.number().int().min(0).max(24 * 60),
  })
  .refine((w) => w.end > w.start, { message: 'End must be after start' });

export const addressSchema = z.object({
  line1: z.string().trim().min(3, 'Street address is required').max(120),
  city: z.string().trim().min(2, 'City is required').max(60),
  state,
  postalCode: zip,
});

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const dateOfBirth = z.iso
  .date('Use YYYY-MM-DD')
  .refine((d) => new Date(`${d}T00:00:00Z`).getTime() <= Date.now(), 'Date of birth is in the future')
  .refine(
    (d) => Date.now() - new Date(`${d}T00:00:00Z`).getTime() <= 21 * YEAR_MS,
    'Our programs serve children and young adults up to 21',
  );

const baseIntake = z.object({
    child: z.object({
      firstName: name,
      lastName: name,
      dateOfBirth,
      preferredLanguage: z.string().trim().min(2).max(40).default('English'),
    }),
    guardian: z.object({
      firstName: name,
      lastName: name,
      relationship: z.string().trim().min(2).max(40).default('Parent'),
      phone: z
        .string()
        .trim()
        .refine((p) => p.replace(/\D/g, '').length >= 10, 'Enter a 10-digit phone number'),
      email: z.union([z.email('Enter a valid email'), z.literal('')]).optional(),
    }),
    address: addressSchema,
    services: z
      .array(z.enum(DISCIPLINES))
      .min(1, 'Choose at least one service')
      .refine((s) => new Set(s).size === s.length, 'Duplicate service'),
    concerns: z.string().trim().min(10, 'Tell us a little about your concerns (10+ characters)').max(2000),
    urgentConcern: z.boolean().default(false),
    referralSource: z.enum(REFERRAL_SOURCES),
    referringProvider: z.string().trim().max(120).optional(),
    fundingSource: z.enum(FUNDING_SOURCES),
    insurance: z
      .object({
        payer: z.string().trim().max(80).optional(),
        memberId: z.string().trim().max(40).optional(),
      })
      .optional(),
    preferredSetting: z.enum(SETTINGS),
    acceptsTelehealth: z.boolean().default(false),
    communityLocation: addressSchema.extend({ name: z.string().trim().min(2).max(80) }).optional(),
    availability: z.array(weeklyWindowSchema).min(1, 'Pick at least one time that works for your family').max(42),
    consent: z.object({
      agreed: z.literal(true, 'Consent is required to submit'),
      signatureName: z.string().trim().min(2, 'Type your full name to sign'),
    }),
  });

// Cross-field rules. Each one runs as soon as the fields it depends on are valid (Zod's `when`), so a parent sees
// every problem in one pass instead of fixing errors one round-trip at a time.
const fieldsValid =
  (keys: { [K in keyof typeof baseIntake.shape]?: true }) =>
  (payload: { value: unknown }) =>
    baseIntake.pick(keys).safeParse(payload.value).success;

export const intakeSchema = baseIntake
  .refine((v) => !((v.fundingSource === 'insurance' || v.fundingSource === 'medicaid') && !v.insurance?.memberId), {
    path: ['insurance', 'memberId'],
    message: 'Member ID is required for insurance',
    when: fieldsValid({ fundingSource: true, insurance: true }),
  })
  .refine((v) => v.preferredSetting !== 'community' || !!v.communityLocation, {
    path: ['communityLocation'],
    message: 'Tell us the school or daycare address',
    when: fieldsValid({ preferredSetting: true, communityLocation: true }),
  });

export type IntakeSubmission = z.input<typeof intakeSchema>;
export type ValidIntake = z.output<typeof intakeSchema>;

export interface FieldIssue {
  path: string;
  message: string;
}

export function toFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}
