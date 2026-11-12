import type { Logger } from 'pino';
import type { AppConfig } from './config';
import type { Db } from './db/client';
import type { Push } from './services/push';
import type { Realtime } from './services/realtime';
import type { StravaApi } from './services/strava-api';

/** Dependências injetadas nas rotas (facilita testes com dublês). */
export interface Deps {
  db: Db;
  config: AppConfig;
  logger: Logger;
  realtime: Realtime;
  push: Push;
  strava: StravaApi;
  now: () => Date;
}
