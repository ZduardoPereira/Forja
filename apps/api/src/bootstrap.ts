import { type AppConfig, loadConfig } from './config';
import { createDb, type DbHandle } from './db/client';
import { seedReference } from './db/seed';
import type { Deps } from './deps';
import { createLogger } from './logger';
import { noopRealtime } from './services/realtime';
import { createStravaApi } from './services/strava-api';

export async function bootstrap(config: AppConfig = loadConfig()): Promise<{ deps: Deps; handle: DbHandle }> {
  const logger = createLogger(config.LOG_LEVEL);
  const handle = createDb({ databaseUrl: config.DATABASE_URL, pgliteDir: config.pgliteDir });
  logger.info({ driver: handle.driver }, handle.driver === 'pglite' ? `Banco PGlite em ${config.pgliteDir}` : 'Banco PostgreSQL');
  await handle.migrate();
  await seedReference(handle.db, logger);
  const deps: Deps = { db: handle.db, config, logger, realtime: noopRealtime, strava: createStravaApi(config.strava), now: () => new Date() };
  return { deps, handle };
}
