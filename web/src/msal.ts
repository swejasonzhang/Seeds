// Microsoft Entra ID sign-in (MSAL.js, redirect flow). Active whenever the server publishes Entra settings in
// /api/config; the API validates every token it receives. Demo personas keep working alongside it in demo mode.
import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import type { MeDto, PublicConfigDto } from '@seeds/shared';
import { setTokenProvider } from './api';
import { setPersona, type Persona } from './session';

let pca: PublicClientApplication | null = null;
let scopes: string[] = [];

export const msalEnabled = () => pca !== null;
export const msalAccount = (): AccountInfo | null => pca?.getActiveAccount() ?? null;

async function getToken(): Promise<string | null> {
  const account = msalAccount();
  if (!pca || !account) return null;
  try {
    return (await pca.acquireTokenSilent({ scopes, account })).accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) await pca.acquireTokenRedirect({ scopes, account });
    return null;
  }
}

export function personaFromMe(me: MeDto): Persona | null {
  const kind = me.roles.some((r) => r === 'admin' || r === 'coordinator') ? 'admin' : me.roles.includes('therapist') ? 'therapist' : me.roles.includes('parent') ? 'parent' : null;
  return kind ? { kind, key: 'microsoft', name: me.name } : null;
}

/** Called once at startup: finishes a sign-in redirect if we're returning from Microsoft, and wires tokens into the API. */
export async function initMicrosoftSignIn(entra: NonNullable<PublicConfigDto['entra']>) {
  pca = new PublicClientApplication({
    auth: {
      clientId: entra.clientId,
      authority: entra.authority,
      redirectUri: `${window.location.origin}/sign-in`,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });
  scopes = [entra.apiScope];
  await pca.initialize();
  const result = await pca.handleRedirectPromise().catch(() => null);
  const account = result?.account ?? pca.getAllAccounts()[0] ?? null;
  if (account) pca.setActiveAccount(account);
  setTokenProvider(getToken);

  if (account) {
    // Map the Microsoft identity to a SEEDS portal (roles come from the API, which validated the token).
    try {
      const token = await getToken();
      const res = await fetch('/api/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        const persona = personaFromMe((await res.json()) as MeDto);
        setPersona(persona ?? { kind: 'parent', key: 'microsoft-unlinked', name: account.name ?? account.username });
      }
    } catch {
      /* network hiccup: the sign-in page will offer to retry */
    }
  }
}

export const signInWithMicrosoft = () => pca?.loginRedirect({ scopes, prompt: 'select_account' });

export async function signOut() {
  const account = msalAccount();
  setPersona(null);
  if (pca && account) await pca.logoutRedirect({ account });
}
