import { useSyncExternalStore } from 'react';
import type { PersonaDto } from '@seeds/shared';

// Demo sign-in: which persona the browser is acting as. In production this is replaced by Microsoft Entra ID
// (staff, therapists) and Entra External ID (parents); the API scopes every request to the signed-in identity.

export type Persona = Pick<PersonaDto, 'kind' | 'key' | 'name'>;

const KEY = 'seeds.persona';
const read = (): Persona | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};

let current: Persona | null = read();
const listeners = new Set<() => void>();
let onChange: (() => void) | null = null;

export const getPersona = () => current;

export function setPersona(p: Persona | null) {
  current = p;
  if (p) localStorage.setItem(KEY, JSON.stringify(p));
  else localStorage.removeItem(KEY);
  onChange?.();
  listeners.forEach((l) => l());
}

/** Lets the API layer clear cached data whenever the persona changes. */
export const onPersonaChange = (fn: () => void) => (onChange = fn);

export function usePersona() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export const HOME_FOR: Record<Persona['kind'], string> = { admin: '/staff/queue', therapist: '/therapist', parent: '/family' };
