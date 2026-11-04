import './telemetry.ts';
import mongoose from 'mongoose';
import { pino } from 'pino';
import { loadConfig } from './config.ts';
import { connectDbWithRetry } from './db/models.ts';
import { createApp } from './app.ts';
import { createGeocoder, createTravelService } from './services/geo.ts';
import { createCalendarSync } from './services/calendarSync.ts';
import { seedIfEmpty } from './seed/demoData.ts';
import type { Services } from './context.ts';

async function main() {
  const config = loadConfig();
  const log = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    transport: config.isProduction ? undefined : { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } },
  });

  if (config.auth.mode === 'demo') log.warn('AUTH_MODE=demo: staff pages are open. Use only with fictional data.');

  const services: Services = {
    config,
    log,
    geocoder: createGeocoder(config.azureMaps, log),
    travel: createTravelService(config.azureMaps, config.travel, log),
    calendar: createCalendarSync(config, log),
    now: () => new Date(),
  };

  // Listen first so the platform detects the port and health checks work even while the database is unreachable.
  const server = createApp(services).listen(config.port, () =>
    log.info({ port: config.port, travel: services.travel.source, calendar: services.calendar.enabled }, 'SEEDS API listening'),
  );

  void connectDbWithRetry(config.mongoUri, log).then(async () => {
    log.info({ authMode: config.auth.mode }, 'Connected to MongoDB');
    if (config.seedDemoData) await seedIfEmpty(services).catch((err) => log.error({ err }, 'Demo seed failed'));
    services.calendar.start();
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down');
    server.close();
    await services.calendar.stop();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
