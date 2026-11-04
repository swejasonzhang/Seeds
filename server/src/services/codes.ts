import { randomInt } from 'node:crypto';
import { IntakeCase } from '../db/models.ts';

// No 0/O, 1/I/L: codes get read aloud over the phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length = 6): string {
  let s = '';
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** 31^6 ≈ 887M codes; the existence check makes a collision practically impossible, the unique index makes it safe. */
export async function newSubmissionCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `SEED-${randomCode()}`;
    if (!(await IntakeCase.exists({ submissionCode: code }))) return code;
  }
  throw new Error('Could not allocate a submission code');
}
