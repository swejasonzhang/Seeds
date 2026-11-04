import {
  CHECKLIST_LABEL,
  DISCIPLINE_LABEL,
  DISCIPLINE_SHORT,
  STATUS_LABEL,
  type ChecklistItem,
  type Discipline,
  type IntakeResult,
  type ValidIntake,
} from '@seeds/shared';
import { Child, IntakeCase, type CaseDoc } from '../db/models.ts';
import { toPoint } from '../db/models.ts';
import { assessPriority, deriveStatus, missingChecklist } from '../core/policies.ts';
import { isoDateInZone } from '../core/dates.ts';
import type { Services } from '../context.ts';
import { newSubmissionCode } from './codes.ts';
import { event } from './mappers.ts';

const key = (s: string) => s.trim().toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');
export const householdKeyFor = (phone: string) => phone.replace(/\D/g, '').slice(-10);

/**
 * Turn a family's online submission into queue-ready cases:
 * dedupe against existing clients → geocode → detect siblings → score priority → auto-route by paperwork status.
 * Most submissions need no coordinator touch before they're matchable.
 */
export async function submitIntake(input: ValidIntake, s: Services): Promise<IntakeResult> {
  const now = s.now();
  const receivedDate = isoDateInZone(now, s.config.timeZone);
  const householdKey = householdKeyFor(input.guardian.phone);
  const guardian = {
    firstName: input.guardian.firstName,
    lastName: input.guardian.lastName,
    relationship: input.guardian.relationship,
    phone: input.guardian.phone,
    email: input.guardian.email || undefined,
    isPrimary: true,
  };

  const home = await s.geocoder.geocode(input.address);

  // 1. Same child already on file? Reuse the record (families re-apply, or ask for a second service later).
  let child = await Child.findOne({
    firstNameKey: key(input.child.firstName),
    lastNameKey: key(input.child.lastName),
    dateOfBirth: input.child.dateOfBirth,
  });
  const existingChild = Boolean(child);
  if (child) {
    child.address = input.address;
    child.location = home ? toPoint(home.point) : undefined;
    child.geocodePrecision = home?.precision;
    child.preferredLanguage = input.child.preferredLanguage;
    child.householdKey = householdKey;
    if (!child.guardians.some((g) => householdKeyFor(g.phone ?? '') === householdKey)) child.guardians.push(guardian);
    await child.save();
  } else {
    child = await Child.create({
      firstName: input.child.firstName,
      lastName: input.child.lastName,
      firstNameKey: key(input.child.firstName),
      lastNameKey: key(input.child.lastName),
      dateOfBirth: input.child.dateOfBirth,
      preferredLanguage: input.child.preferredLanguage,
      address: input.address,
      location: home ? toPoint(home.point) : undefined,
      geocodePrecision: home?.precision,
      householdKey,
      guardians: [guardian],
    });
  }

  // 2. Skip services this child already has an open case for.
  const open = await IntakeCase.find({ childId: child._id, status: { $ne: 'closed' } }, { discipline: 1 }).lean();
  const alreadyOpen = input.services.filter((d) => open.some((o) => o.discipline === d));
  const toCreate = input.services.filter((d) => !alreadyOpen.includes(d));
  const submissionCode = await newSubmissionCode();
  if (toCreate.length === 0) return { submissionCode, cases: [], alreadyOpen };

  // 3. Where will sessions happen?
  let sessionLocation: CaseDoc['sessionLocation'];
  let reviewReason: string | undefined;
  if (input.preferredSetting === 'home') {
    sessionLocation = { label: input.address.city, point: home ? toPoint(home.point) : undefined };
    if (!home) reviewReason = 'Home address could not be located. Confirm it with the family.';
  } else if (input.preferredSetting === 'community' && input.communityLocation) {
    const site = await s.geocoder.geocode(input.communityLocation);
    sessionLocation = { label: `${input.communityLocation.name}, ${input.communityLocation.city}`, point: site ? toPoint(site.point) : undefined };
    if (!site) reviewReason = 'School/daycare address could not be located. Confirm it with the family.';
  } else if (input.preferredSetting === 'clinic') {
    sessionLocation = { label: s.config.matching.clinicLabel, point: toPoint(s.config.matching.clinic) };
  }
  // A 'zip-approx' location is not a blocker: travel estimates are just rougher until Azure Maps geocodes it.

  // 4. Sibling already in care? Boost priority and prefer the same therapist for one-stop visits.
  const siblingActive = Boolean(
    await IntakeCase.exists({ householdKey, childId: { $ne: child._id }, status: 'scheduled' }),
  );

  const childName = `${input.child.firstName} ${input.child.lastName}`;
  const actor = 'Family (online intake)';
  const docs = toCreate.map((discipline: Discipline) => {
    const priority = assessPriority(
      {
        receivedAt: now,
        receivedDate,
        dateOfBirth: input.child.dateOfBirth,
        fundingSource: input.fundingSource,
        urgentConcern: input.urgentConcern,
        siblingActive,
      },
      s.config.priority,
    );
    const completedChecklist: ChecklistItem[] = ['consent']; // e-signed on the form
    const status = deriveStatus({ status: 'pending-documents', reviewReason, fundingSource: input.fundingSource, completedChecklist });
    const missing = missingChecklist(input.fundingSource, completedChecklist);
    const referenceCode = `${submissionCode}-${DISCIPLINE_SHORT[discipline]}`;

    const events = [
      event(actor, 'submitted', `${DISCIPLINE_LABEL[discipline]} referral submitted by ${guardian.firstName} ${guardian.lastName}`, now),
      event(actor, 'consent', `Consent to treat e-signed by "${input.consent.signatureName}"`, now),
    ];
    if (existingChild) events.push(event('System', 'dedupe', 'Matched an existing client record (same name and date of birth)', now));
    events.push(
      event(
        'System',
        'routed',
        status === 'pending-documents'
          ? `Auto-routed to ${STATUS_LABEL[status]}: waiting on ${missing.map((m) => CHECKLIST_LABEL[m]).join(', ')}`
          : status === 'needs-review'
            ? `Flagged for review: ${reviewReason}`
            : `Auto-routed to ${STATUS_LABEL[status]}: paperwork complete`,
        now,
      ),
    );

    return {
      submissionCode,
      referenceCode,
      childId: child._id,
      childName,
      childDob: input.child.dateOfBirth,
      town: input.address.city,
      householdKey,
      preferredLanguage: input.child.preferredLanguage,
      searchKey: `${childName} ${referenceCode} ${guardian.lastName}`.toLowerCase(),
      discipline,
      status,
      reviewReason,
      receivedAt: now,
      queueSortKey: priority.queueSortKey,
      priorityBoostDays: priority.boostDays,
      priorityFactors: priority.factors,
      targetStartBy: priority.targetStartBy,
      fundingSource: input.fundingSource,
      referralSource: input.referralSource,
      referringProvider: input.referringProvider,
      concerns: input.concerns,
      urgentConcern: input.urgentConcern,
      insurance: input.insurance,
      preferredSetting: input.preferredSetting,
      acceptsTelehealth: input.acceptsTelehealth || input.preferredSetting === 'telehealth',
      sessionLocation,
      availability: input.availability,
      completedChecklist,
      consent: { signedBy: input.consent.signatureName, signedAt: now },
      events,
    };
  });

  const created = await IntakeCase.insertMany(docs);
  s.log.info({ submissionCode, cases: created.length }, 'Intake submitted');
  return {
    submissionCode,
    cases: created.map((c) => ({ referenceCode: c.referenceCode, discipline: c.discipline, status: c.status })),
    alreadyOpen,
  };
}
