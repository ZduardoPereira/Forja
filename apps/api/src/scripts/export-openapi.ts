import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry, openApiDocument } from '../app';
import { loadConfig } from '../config';
import type { Deps } from '../deps';
import { createLogger } from '../logger';
import { noopRealtime } from '../services/realtime';
import { createStravaApi } from '../services/strava-api';

// Gera docs/openapi.json sem banco (só a declaração das rotas).
const config = loadConfig({ ...process.env, NODE_ENV: 'development', SECRET: 'x'.repeat(32) });
const deps = { config, logger: createLogger('silent'), db: null, realtime: noopRealtime, strava: createStravaApi(null), now: () => new Date() } as unknown as Deps;
const { registry } = buildRegistry(deps);
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/openapi.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(openApiDocument(registry), null, 2));
console.log(`OpenAPI: ${out} (${registry.ops.length} operações)`);
