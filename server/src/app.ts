import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { intakeSchema, type MeDto, type PublicConfigDto } from '@seeds/shared';
import type { Services } from './context.ts';
import { createAuth } from './auth.ts';
import { errorHandler, notFound } from './errors.ts';
import { isDbConnected } from './db/models.ts';
import { submitIntake } from './services/intakeService.ts';
import { caseRoutes } from './routes/cases.ts';
import { staffRoutes } from './routes/staff.ts';
import { demoRoutes, documentRoutes, familyRoutes, therapistPortalRoutes } from './routes/portal.ts';

function resolveStaticDir(configured?: string): string | null {
  const candidates = configured ? [configured] : [path.resolve('public'), path.resolve('../web/dist'), path.resolve('web/dist')];
  return candidates.find((d) => fs.existsSync(path.join(d, 'index.html'))) ?? null;
}

export function createApp(s: Services) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render / Azure front ends: use the client IP from X-Forwarded-For for rate limiting

  app.use(
    pinoHttp({
      logger: s.log,
      // Never log bodies (PHI) or credentials.
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/healthz' || !req.url?.startsWith('/api') },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Fluent UI injects atomic CSS at runtime
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'https://login.microsoftonline.com', 'https://*.ciamlogin.com'],
          frameSrc: ['https://login.microsoftonline.com', 'https://*.ciamlogin.com'],
        },
      },
    }),
  );
  // Unofficial concept for a real practice: keep every page and API response out of search engines.
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.use(compression());
  // Small JSON bodies everywhere except document uploads, which parse their own (larger) body.
  const json = express.json({ limit: '100kb' });
  app.use((req, res, next) => (req.method === 'POST' && req.path.endsWith('/documents') ? next() : json(req, res, next)));

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/readyz', (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ ok: up });
  });

  const api = express.Router();

  // While MongoDB is (re)connecting, fail fast with a clear 503 instead of hanging on Mongoose's command buffer.
  api.use((req, res, next) => {
    if (req.path === '/config' || isDbConnected()) return next();
    res.status(503).json({ error: 'unavailable', message: 'The database is starting up or unreachable. Please try again shortly.' });
  });

  // ----- public -----
  api.get('/config', (_req, res) => {
    const { auth } = s.config;
    const body: PublicConfigDto = {
      authMode: auth.mode,
      entra: auth.entraEnabled ? { clientId: auth.spaClientId!, tenantId: auth.tenantId!, apiScope: auth.apiScope!, authority: auth.authority! } : undefined,
      travelSource: s.travel.source,
      calendarSync: s.calendar.enabled,
    };
    res.json(body);
  });

  const intakeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: s.config.intakeRateLimitPerHour,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many submissions from this network. Please call our office.' },
  });
  api.post('/intake', intakeLimiter, async (req, res) => {
    const input = intakeSchema.parse(req.body);
    res.status(201).json(await submitIntake(input, s));
  });

  if (s.config.auth.mode === 'demo') api.use(demoRoutes());

  // ----- signed in: every role -----
  const { authenticate, requireRole } = createAuth(s.config);
  api.use(authenticate);
  api.get('/me', (req, res) => {
    const u = req.user!;
    const body: MeDto = { name: u.name, email: u.email, roles: u.roles, authMode: s.config.auth.mode, therapistId: u.therapistId, familyKey: u.familyKey, via: u.via };
    res.json(body);
  });
  api.use(documentRoutes());

  // ----- role portals -----
  api.use('/portal/family', requireRole('parent'), familyRoutes(s));
  api.use('/portal/therapist', requireRole('therapist'), therapistPortalRoutes(s));

  // ----- staff console (front desk / admin) -----
  const requireCoordinator = requireRole('coordinator', 'admin');
  const requireAdmin = requireRole('admin');
  api.use(requireCoordinator);
  const cases = caseRoutes(s, requireCoordinator);
  api.use(cases.router);
  api.use(staffRoutes(s, { requireCoordinator, requireAdmin }, cases.bookBody));
  api.use((_req, _res, next) => next(notFound('Endpoint')));
  app.use('/api', api);

  // ----- the React app (single service: one URL, no CORS) -----
  const dir = resolveStaticDir(s.config.staticDir);
  if (dir) {
    app.use('/assets', express.static(path.join(dir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
