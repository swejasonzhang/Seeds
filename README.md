# SEEDS Intake

Client intake, waitlist queue and **travel-aware therapist matching** for **SEEDS of the Willistons**, a pediatric
speech and occupational therapy practice in Williston Park, NY (Nassau County).

The two bottlenecks it targets:

1. **Intake is slow.** Families fill out one online form. It deduplicates against existing clients, detects siblings,
   geocodes the address, scores priority and routes the case automatically: straight into the matching queue when
   paperwork is complete, or to *Pending documents* with exactly what's missing.
2. **Travel and therapist availability.** The matching engine finds, for each child, the therapist and weekly time
   slot that **adds the least driving to that therapist's existing route**, within both the family's and the
   therapist's availability, with drive time and buffers between visits. One click proposes a schedule for the
   whole waitlist in priority order.

> **Demo data only.** The deployed demo runs with `AUTH_MODE=demo` and seeded fictional children, families and
> therapists. Turn on Microsoft Entra ID sign-in before any real family information is entered.

## What's in the MVP

| Area | What it does |
| --- | --- |
| **Family intake form** (`/intake`) | Public, mobile-friendly. Child, guardian, address, services (speech / OT), concerns + urgent flag, referral & funding (EI, CPSE, insurance, Medicaid, private), setting (home, school/daycare, clinic, telehealth), weekly availability grid, e-signed consent. Same validation in the browser and API (shared Zod schema). Rate-limited. |
| **Priority queue** (`/queue`) | Sorted by *effective wait* = days waiting + boosts (under 3, urgent, sibling in care, mandated EI/CPSE). Status tabs with counts, search, service and SLA filters, target-start-date tracking. |
| **Case page** | Child/family/referral details, funding-specific paperwork checklist (completing it auto-advances the case), care plan (sessions/week, length, setting), ranked match suggestions with plain-English reasons, one-click booking, return-to-queue, hold/close/discharge, full audit trail. |
| **Auto-match** (`/auto-match`) | Plans the top N waiting children at once. Each child's best slot is reserved before moving to the next, so higher-priority children get first pick and later visits cluster onto routes already planned. Reports driving time saved. Review, then book selected. |
| **Therapists** (`/therapists`) | Caseload vs. capacity, languages, settings, weekly drive time; per-therapist standing schedule and a daily **route sheet** with drive legs. |

### How matching works

For each therapist of the right discipline, the engine (`server/src/core/matching.ts`) checks the setting, travel
range (one-way minutes from home base) and remaining caseload. Then, for every day the family is available, it
tries every 15-minute start time inside the overlap of both availabilities and keeps the cheapest *feasible* one:

- **Feasible:** finish the previous visit → buffer → drive here → session → buffer → still reach the next in-person
  visit on time. Telehealth sessions happen wherever the therapist currently is.
- **Cost:** marginal driving `d(prev→here) + d(here→next) − d(prev→next)`, with home base at either end of the day,
  so a child next door to an existing visit costs ~0 and a child who needs a brand-new route day costs a round trip.
- **Score:** drive cost + caseload balance − language match − sibling continuity (+ penalty for telehealth fallback).
- **No match?** It says why (e.g. "Outside travel range: 3, No overlapping availability: 2"), so coordinators know
  whether to widen availability, allow telehealth or reduce frequency.

Priority uses a **virtual timestamp**: `queueSortKey = receivedAt − boostDays`. Sorting by it gives priority order,
and aging is free: no nightly re-scoring job, and the queue is served straight from a compound index.

## Architecture (MERN on Microsoft services)

```
web/      React 19 + TypeScript + Fluent UI v9 (Microsoft's design system) + TanStack Query
server/   Node + Express 5 + TypeScript + Mongoose (MongoDB)
  core/       pure domain logic: matching engine, priority/SLA policies, routes (unit-tested)
  services/   intake, scheduling/booking, Azure Maps, Microsoft Graph calendar outbox
shared/   domain vocabulary, API contracts and the intake Zod schema, used by both sides
```

| Concern | Microsoft service | Status |
| --- | --- | --- |
| Staff sign-in, roles | **Microsoft Entra ID** (app roles `Intake.Coordinator`, `Clinical.Therapist`, `Practice.Admin`; API validates JWTs via JWKS) | API done; SPA sign-in (MSAL) is next |
| Drive times, geocoding | **Azure Maps** Route Matrix + Geocoding (key or keyless Entra auth) | Done; falls back to an offline estimate when not configured |
| Therapist calendars | **Microsoft Graph**: standing sessions as recurring Outlook events, via a MongoDB outbox (idempotent `transactionId`, no PHI in subjects) | Done; enable with `GRAPH_*` |
| Telemetry | **Azure Monitor / Application Insights** (OpenTelemetry) | Done; enable with connection string |
| Database | **Azure Cosmos DB for MongoDB (vCore)** or MongoDB Atlas on Azure | Any MongoDB URI |
| Hosting | **Render** (one web service: API + SPA) | `render.yaml` |

## Run locally

Requires Node ≥ 20.19 and MongoDB (local `mongod` on 27017, or any URI in `server/.env`).

```bash
npm install
npm run seed -- --reset   # fictional demo data into the "seeds" database (wipes only SEEDS collections)
npm run dev               # API on :5080, web on :5173 (proxied)
```

Open http://localhost:5173. Family form: http://localhost:5173/intake

```bash
npm test          # engine, policy, date and schema tests (Vitest)
npm run typecheck
npm run build && npm start   # production bundle on :5080 (serves the web build too)
```

## Deploy on Render

1. **Database:** create a MongoDB (free MongoDB Atlas M0 on **Azure / East US 2**, or Azure Cosmos DB for MongoDB
   vCore). Allow network access from Render and copy the connection string, including a database name, e.g.
   `mongodb+srv://user:pass@cluster.example.mongodb.net/seeds`.
2. In Render: **New → Blueprint →** select this repo. Render reads `render.yaml` and asks for `MONGODB_URI`.
3. Deploy. On first boot the app seeds fictional demo data (`SEED_DEMO_DATA=true`, only if the DB is empty).
   Health check: `/readyz` (MongoDB connected).

The free plan sleeps when idle (first request takes ~1 minute). Use `starter` or above for always-on, and add
instances to scale out. The API is stateless, bookings use optimistic concurrency, and the calendar outbox uses
atomic claims, so multiple instances are safe.

## Scaling notes

- Queue reads are index-backed (`status, discipline, queueSortKey`) with denormalized child fields: no joins.
- Matching screens all therapists with a cheap estimate, then refines only the top few with one Azure Maps route
  matrix call (cached 24 h), so map cost stays flat as staff grows.
- Booking without multi-document transactions (works on standalone Mongo, Atlas and Cosmos DB): re-validate →
  insert → compare-and-swap the therapist's `scheduleVersion` → conditional case update, with rollback on a lost race.
- Next steps at higher volume: keyset pagination, Atlas Search / Cosmos text index for search, Redis-backed rate
  limiting and travel cache, move auto-match to a background job.

## Security & privacy (PHI)

- Children's records are PHI. Run production with `AUTH_MODE=entra`. The server refuses to start in production
  without Entra settings unless demo mode is explicitly chosen.
- Request bodies are never logged; auth headers are redacted. Calendar events contain initials + reference only.
- Append-only audit trail on every case. Helmet CSP, JSON size limits, rate-limited public intake.
- Use a database and host covered by a BAA for real data (Azure and MongoDB Atlas offer BAAs).

## Roadmap (after the MVP)

- MSAL sign-in in the SPA (backend already validates Entra tokens); role-specific views for therapists
- Dashboard with charts (API: `GET /api/dashboard` already returns KPIs, wait buckets, intake trend)
- Read therapist free/busy from Outlook (Graph `getSchedule`) so PTO blocks matching automatically
- Integration tests against an in-memory MongoDB; Playwright end-to-end tests
- Family notifications (SMS/email via Azure Communication Services); document uploads (Azure Blob Storage)
