import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import * as schema from './schema';

/**
 * PGlite (PostgreSQL em WASM, um processo) serve bem a um grupo pequeno e não exige
 * instalar nada. Com DATABASE_URL usa-se um PostgreSQL de verdade. Mesmas migrações.
 */
export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  driver: 'postgres' | 'pglite';
  migrate(): Promise<void>;
  close(): Promise<void>;
}

// Fonte: src/db/client.ts → ../../drizzle ; bundle: dist/*.js → ../drizzle.
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder =
  process.env.MIGRATIONS_DIR ??
  [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle')].find((p) => existsSync(path.join(p, 'meta', '_journal.json'))) ??
  path.resolve(here, '../../drizzle');

export function createDb(opts: { databaseUrl?: string; pgliteDir: string | null }): DbHandle {
  if (opts.databaseUrl) {
    const pool = new pg.Pool({ connectionString: opts.databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
    const db = drizzlePg(pool, { schema });
    return { db, driver: 'postgres', migrate: () => migratePg(db, { migrationsFolder }), close: () => pool.end() };
  }
  if (opts.pgliteDir) mkdirSync(opts.pgliteDir, { recursive: true });
  const client = opts.pgliteDir ? new PGlite(opts.pgliteDir) : new PGlite();
  const db = drizzlePglite(client, { schema }) as PgliteDatabase<typeof schema>;
  return { db: db as unknown as Db, driver: 'pglite', migrate: () => migratePglite(db, { migrationsFolder }), close: () => client.close() };
}
