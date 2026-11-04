// npm run seed            → seed if empty
// npm run seed -- --reset → wipe the SEEDS collections and reseed fictional demo data
import mongoose from 'mongoose';
import { pino } from 'pino';
import { loadConfig } from '../config.ts';
import { connectDb } from '../db/models.ts';
import { createCalendarSync } from '../services/calendarSync.ts';
import { createGeocoder, createTravelService } from '../services/geo.ts';
import { DEMO_SEED_VERSION, resetDatabase, seedDemoData, seedIfEmpty } from './demoData.ts';
import { Meta } from '../db/models.ts';
import type { Services } from '../context.ts';

const config = loadConfig();
const log = pino({ transport: { target: 'pino-pretty' } });
await connectDb(config.mongoUri);
const s: Services = {
  config,
  log,
  geocoder: createGeocoder(config.azureMaps, log),
  travel: createTravelService({}, config.travel, log), // seed with the offline estimator: deterministic, free
  calendar: createCalendarSync({ ...config, graph: { ...config.graph, enabled: false } }, log),
  now: () => new Date(),
};
if (process.argv.includes('--reset')) {
  await resetDatabase();
  log.info(await seedDemoData(s), 'Reset and seeded demo data');
  await Meta.updateOne({ _id: 'demo-seed' }, { $set: { version: DEMO_SEED_VERSION, at: new Date() } }, { upsert: true });
} else {
  await seedIfEmpty(s);
}
await mongoose.disconnect();
