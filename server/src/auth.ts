import type { NextFunction, Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { Role } from '@seeds/shared';
import type { AppConfig } from './config.ts';
import { HttpError } from './errors.ts';
import { Child, Therapist } from './db/models.ts';

export interface Principal {
  name: string;
  email: string;
  roles: Role[];
  /** Set for therapists: their own schedule and caseload only. */
  therapistId?: string;
  /** Set for parents: the household (primary guardian phone) whose children they can see. */
  familyKey?: string;
  via: 'microsoft' | 'demo';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: Principal;
    }
  }
}

/** Entra ID app roles (defined on the API app registration) → application roles. */
const ENTRA_ROLE_MAP: Record<string, Role> = {
  'Intake.Coordinator': 'coordinator',
  'Clinical.Therapist': 'therapist',
  'Practice.Admin': 'admin',
};

const MULTI_TENANT = new Set(['common', 'organizations', 'consumers']);

const DEMO_ADMIN: Principal = { name: 'Front Desk (demo)', email: 'frontdesk@demo.seeds.local', roles: ['coordinator', 'admin'], via: 'demo' };

/** How a signed-in Microsoft identity is linked to SEEDS records (injectable for tests). */
export interface IdentityLookup {
  therapistIdByEmail(email: string): Promise<string | null>;
  familyKeyByEmail(email: string): Promise<string | null>;
}

const exactEmail = (email: string) => new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

export const mongoLookup: IdentityLookup = {
  async therapistIdByEmail(email) {
    const t = await Therapist.findOne({ email: exactEmail(email), active: true }, { _id: 1 }).lean();
    return t?._id.toString() ?? null;
  },
  async familyKeyByEmail(email) {
    const c = await Child.findOne({ 'guardians.email': exactEmail(email) }, { householdKey: 1 }).lean();
    return c?.householdKey ?? null;
  },
};

/** Demo mode: the browser picks a persona ("admin", "therapist:<id>", "parent:<familyKey>") via X-Demo-Persona. */
async function demoPrincipal(persona: string): Promise<Principal | null> {
  if (persona.startsWith('therapist:')) {
    const id = persona.slice('therapist:'.length);
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const t = await Therapist.findById(id, { firstName: 1, lastName: 1, email: 1 }).lean();
    return t ? { name: `${t.firstName} ${t.lastName}`, email: t.email, roles: ['therapist'], therapistId: id, via: 'demo' } : null;
  }
  if (persona.startsWith('parent:')) {
    const key = persona.slice('parent:'.length).replace(/[^a-z0-9-]/gi, '').toLowerCase();
    const child = key ? await Child.findOne({ householdKey: key }, { guardians: 1 }).lean() : null;
    const g = child?.guardians.find((x) => x.isPrimary) ?? child?.guardians[0];
    return g ? { name: `${g.firstName} ${g.lastName}`, email: g.email ?? '', roles: ['parent'], familyKey: key, via: 'demo' } : null;
  }
  return DEMO_ADMIN;
}

/**
 * Validates Microsoft Entra ID access tokens: signature (tenant JWKS), audience, and issuer. Supports a single tenant
 * (tenant GUID) or multi-tenant + personal Microsoft accounts ("common"), where the issuer must match the token's tid.
 */
export function createEntraVerifier(config: AppConfig, jwks?: JWTVerifyGetKey, lookup: IdentityLookup = mongoLookup) {
  const { tenantId, audience, clientId, defaultRole } = config.auth;
  const tenant = tenantId!;
  const multi = MULTI_TENANT.has(tenant.toLowerCase());
  const keys = jwks ?? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`));
  const audiences = [audience!, clientId].filter((a): a is string => Boolean(a));

  return async function verify(token: string): Promise<Principal> {
    const { payload } = await jwtVerify(token, keys, { audience: audiences, clockTolerance: 60 });
    const claims = payload as JWTPayload & { tid?: string; name?: string; preferred_username?: string; upn?: string; email?: string; roles?: string[] };
    const tid = multi ? claims.tid : tenant;
    const issuers = [`https://login.microsoftonline.com/${tid}/v2.0`, `https://sts.windows.net/${tid}/`];
    if (!tid || !issuers.includes(String(claims.iss))) throw new Error('Untrusted token issuer');

    const email = (claims.preferred_username ?? claims.email ?? claims.upn ?? '').toLowerCase();
    const roles = (claims.roles ?? []).map((r) => ENTRA_ROLE_MAP[r]).filter((r): r is Role => Boolean(r));
    const user: Principal = { name: claims.name ?? (email || 'Microsoft user'), email, roles, via: 'microsoft' };

    // Link to SEEDS records: app roles win; otherwise therapist by Microsoft 365 email, then parent by guardian email.
    if (email) {
      const therapistId = await lookup.therapistIdByEmail(email);
      if (therapistId && (roles.length === 0 || roles.includes('therapist'))) {
        user.therapistId = therapistId;
        if (!roles.includes('therapist')) user.roles = [...user.roles, 'therapist'];
      }
      if (user.roles.length === 0) {
        const familyKey = await lookup.familyKeyByEmail(email);
        if (familyKey) {
          user.familyKey = familyKey;
          user.roles = ['parent'];
        }
      }
    }
    // Demo deployments only: let reviewers explore with their own Microsoft account.
    if (user.roles.length === 0 && config.auth.mode === 'demo' && defaultRole) user.roles = defaultRole === 'admin' ? ['coordinator', 'admin'] : [defaultRole];
    return user;
  };
}

export function createAuth(config: AppConfig, deps: { jwks?: JWTVerifyGetKey; lookup?: IdentityLookup } = {}) {
  const verify = config.auth.entraEnabled ? createEntraVerifier(config, deps.jwks, deps.lookup) : null;

  const authenticate: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      if (!verify) return next(new HttpError(401, 'Microsoft sign-in is not configured on this server', 'unauthenticated'));
      try {
        req.user = await verify(header.slice(7));
        return next();
      } catch {
        return next(new HttpError(401, 'Your Microsoft sign-in has expired. Please sign in again.', 'unauthenticated'));
      }
    }
    if (config.auth.mode === 'demo') {
      const user = await demoPrincipal(String(req.headers['x-demo-persona'] ?? 'admin'));
      if (!user) return next(new HttpError(401, 'That demo account no longer exists. Pick another on the sign-in page.', 'unauthenticated'));
      req.user = user;
      return next();
    }
    next(new HttpError(401, 'Sign in with Microsoft to continue', 'unauthenticated'));
  };

  const requireRole =
    (...roles: Role[]): RequestHandler =>
    (req, _res, next) => {
      if (!req.user) return next(new HttpError(401, 'Sign in required', 'unauthenticated'));
      if (roles.length && !req.user.roles.some((r) => roles.includes(r))) {
        return next(new HttpError(403, 'You do not have access to this area', 'forbidden'));
      }
      next();
    };

  return { authenticate, requireRole };
}

export const isStaff = (u?: Principal) => Boolean(u?.roles.some((r) => r === 'coordinator' || r === 'admin'));
