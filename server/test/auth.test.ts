import { beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import type { Request, Response } from 'express';
import { createAuth, createEntraVerifier, type IdentityLookup } from '../src/auth.ts';
import type { AppConfig } from '../src/config.ts';
import { HttpError } from '../src/errors.ts';

const TENANT = '11111111-2222-3333-4444-555555555555';
const API_CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const AUDIENCE = `api://${API_CLIENT}`;

let privateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const pub: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  jwks = createLocalJWKSet({ keys: [pub] });
});

function config(over: Partial<AppConfig['auth']> = {}): AppConfig {
  return {
    auth: { mode: 'entra', tenantId: TENANT, audience: AUDIENCE, clientId: API_CLIENT, spaClientId: 'spa', apiScope: `${AUDIENCE}/access_as_user`, entraEnabled: true, ...over },
  } as AppConfig;
}

const lookup: IdentityLookup = {
  therapistIdByEmail: async (e) => (e === 'dana.whitfield@seeds.example' ? 'therapist-1' : null),
  familyKeyByEmail: async (e) => (e === 'ana.parent@example.com' ? '5165550142' : null),
};

async function token(claims: Record<string, unknown>, opts: { tenant?: string; aud?: string; exp?: string; iss?: string } = {}) {
  const tid = opts.tenant ?? TENANT;
  return new SignJWT({ tid, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(opts.iss ?? `https://login.microsoftonline.com/${tid}/v2.0`)
    .setAudience(opts.aud ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(privateKey);
}

describe('Microsoft Entra ID token validation', () => {
  it('accepts a valid staff token and maps app roles', async () => {
    const verify = createEntraVerifier(config(), jwks, lookup);
    const user = await verify(await token({ name: 'Front Desk', preferred_username: 'frontdesk@seeds.example', roles: ['Intake.Coordinator', 'Practice.Admin'] }));
    expect(user).toMatchObject({ name: 'Front Desk', roles: ['coordinator', 'admin'], via: 'microsoft' });
  });

  it('rejects expired, wrong-audience and wrong-issuer tokens', async () => {
    const verify = createEntraVerifier(config(), jwks, lookup);
    await expect(verify(await token({ roles: [] }, { exp: '-10m' }))).rejects.toThrow();
    await expect(verify(await token({ roles: [] }, { aud: 'api://someone-else' }))).rejects.toThrow();
    await expect(verify(await token({ roles: [] }, { iss: 'https://evil.example/v2.0' }))).rejects.toThrow(/issuer/);
    // a token from another tenant is refused when the app is single-tenant
    await expect(verify(await token({ roles: [] }, { tenant: '99999999-0000-0000-0000-000000000000' }))).rejects.toThrow(/issuer/);
  });

  it('accepts any tenant (incl. personal Microsoft accounts) when configured as "common"', async () => {
    const verify = createEntraVerifier(config({ tenantId: 'common' }), jwks, lookup);
    const msa = '9188040d-6c67-4c5b-b112-36a304b66dad';
    const user = await verify(await token({ preferred_username: 'ana.parent@example.com', name: 'Ana' }, { tenant: msa }));
    expect(user.roles).toEqual(['parent']);
  });

  it('links therapists by Microsoft 365 email and parents by guardian email', async () => {
    const verify = createEntraVerifier(config(), jwks, lookup);
    const therapist = await verify(await token({ preferred_username: 'Dana.Whitfield@seeds.example', name: 'Dana' }));
    expect(therapist).toMatchObject({ roles: ['therapist'], therapistId: 'therapist-1' });
    const parent = await verify(await token({ preferred_username: 'ana.parent@example.com', name: 'Ana' }));
    expect(parent).toMatchObject({ roles: ['parent'], familyKey: '5165550142' });
    const stranger = await verify(await token({ preferred_username: 'nobody@example.com' }));
    expect(stranger.roles).toEqual([]);
  });

  it('only applies the default role in demo mode', async () => {
    const demo = createEntraVerifier(config({ mode: 'demo', defaultRole: 'admin' }), jwks, lookup);
    expect((await demo(await token({ preferred_username: 'reviewer@example.com' }))).roles).toEqual(['coordinator', 'admin']);
    const prod = createEntraVerifier(config({ mode: 'entra', defaultRole: 'admin' }), jwks, lookup);
    expect((await prod(await token({ preferred_username: 'reviewer@example.com' }))).roles).toEqual([]);
  });
});

describe('authenticate middleware', () => {
  const run = async (mw: ReturnType<typeof createAuth>['authenticate'], headers: Record<string, string>) => {
    const req = { headers } as unknown as Request;
    let error: unknown;
    await mw(req, {} as Response, (e?: unknown) => (error = e));
    return { req, error };
  };

  it('uses the Microsoft token when present and requires sign-in in entra mode', async () => {
    const { authenticate } = createAuth(config(), { jwks, lookup });
    const ok = await run(authenticate, { authorization: `Bearer ${await token({ name: 'Front Desk', roles: ['Practice.Admin'] })}` });
    expect(ok.error).toBeUndefined();
    expect(ok.req.user?.roles).toEqual(['admin']);

    const none = await run(authenticate, {});
    expect(none.error).toBeInstanceOf(HttpError);
    expect((none.error as HttpError).status).toBe(401);

    const bad = await run(authenticate, { authorization: 'Bearer not-a-jwt' });
    expect((bad.error as HttpError).status).toBe(401);
  });

  it('demo mode without Entra settings ignores Microsoft tokens it cannot verify', async () => {
    const { authenticate } = createAuth(config({ mode: 'demo', entraEnabled: false }), { jwks, lookup });
    const res = await run(authenticate, { authorization: 'Bearer anything' });
    expect((res.error as HttpError).status).toBe(401);
  });
});
