import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Role } from '@seeds/shared';
import type { AppConfig } from './config.ts';
import { HttpError } from './errors.ts';

export interface Principal {
  name: string;
  email: string;
  roles: Role[];
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

const DEMO_USER: Principal = { name: 'Demo Coordinator', email: 'coordinator@demo.seeds.local', roles: ['coordinator', 'therapist', 'admin'] };

export function createAuth(config: AppConfig) {
  let authenticate: RequestHandler;

  if (config.auth.mode === 'demo') {
    authenticate = (req, _res, next) => {
      req.user = DEMO_USER;
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
        req.user = toPrincipal(payload);
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
        return next(new HttpError(403, 'You do not have access to this action', 'forbidden'));
      }
      next();
    };

  return { authenticate, requireRole };
}

function toPrincipal(payload: JWTPayload): Principal {
  const claims = payload as JWTPayload & { name?: string; preferred_username?: string; upn?: string; roles?: string[] };
  const roles = (claims.roles ?? []).map((r) => ENTRA_ROLE_MAP[r]).filter((r): r is Role => Boolean(r));
  return {
    name: claims.name ?? claims.preferred_username ?? 'Staff member',
    email: claims.preferred_username ?? claims.upn ?? '',
    roles,
  };
}
