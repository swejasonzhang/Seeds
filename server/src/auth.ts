import type { NextFunction, Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
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

const DEMO_ADMIN: Principal = { name: 'Front Desk (demo)', email: 'frontdesk@demo.seeds.local', roles: ['coordinator', 'admin'] };

/**
 * Demo mode: the browser picks a persona ("admin", "therapist:<id>", "parent:<familyKey>") and sends it as
 * X-Demo-Persona. Every portal endpoint is still scoped to that identity, exactly as it would be with real sign-in.
 */
async function demoPrincipal(persona: string): Promise<Principal | null> {
  if (persona.startsWith('therapist:')) {
    const id = persona.slice('therapist:'.length);
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const t = await Therapist.findById(id, { firstName: 1, lastName: 1, email: 1 }).lean();
    return t ? { name: `${t.firstName} ${t.lastName}`, email: t.email, roles: ['therapist'], therapistId: id } : null;
  }
  if (persona.startsWith('parent:')) {
    const key = persona.slice('parent:'.length).replace(/\D/g, '');
    const child = key ? await Child.findOne({ householdKey: key }, { guardians: 1 }).lean() : null;
    const g = child?.guardians.find((x) => x.isPrimary) ?? child?.guardians[0];
    return g ? { name: `${g.firstName} ${g.lastName}`, email: g.email ?? '', roles: ['parent'], familyKey: key } : null;
  }
  return DEMO_ADMIN;
}

export function createAuth(config: AppConfig) {
  let authenticate: RequestHandler;

  if (config.auth.mode === 'demo') {
    authenticate = async (req, _res, next) => {
      const persona = String(req.headers['x-demo-persona'] ?? 'admin');
      const user = await demoPrincipal(persona);
      if (!user) return next(new HttpError(401, 'That demo account no longer exists. Pick another on the sign-in page.', 'unauthenticated'));
      req.user = user;
      next();
    };
  } else {
    const { tenantId, audience, clientId } = config.auth;
    const jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`));
    const issuers = [`https://login.microsoftonline.com/${tenantId}/v2.0`, `https://sts.windows.net/${tenantId}/`];
    const audiences = [audience!, clientId].filter((a): a is string => Boolean(a));

    authenticate = async (req: Request, _res: Response, next: NextFunction) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) return next(new HttpError(401, 'Sign in required', 'unauthenticated'));
      try {
        const { payload } = await jwtVerify(header.slice(7), jwks, { issuer: issuers, audience: audiences });
        const user = toPrincipal(payload);
        if (user.roles.includes('therapist')) {
          // Therapists are linked to their profile by Microsoft 365 email.
          const t = await Therapist.findOne({ email: new RegExp(`^${user.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, { _id: 1 }).lean();
          if (t) user.therapistId = t._id.toString();
        }
        req.user = user;
        next();
      } catch {
        next(new HttpError(401, 'Invalid or expired token', 'unauthenticated'));
      }
    };
  }

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

function toPrincipal(payload: JWTPayload): Principal {
  const claims = payload as JWTPayload & { name?: string; preferred_username?: string; upn?: string; roles?: string[] };
  const roles = (claims.roles ?? []).map((r) => ENTRA_ROLE_MAP[r]).filter((r): r is Role => Boolean(r));
  return {
    name: claims.name ?? claims.preferred_username ?? 'Staff member',
    email: claims.preferred_username ?? claims.upn ?? '',
    roles,
  };
}
