import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db/client';
import { seedReference } from '../src/db/seed';
import type { Deps } from '../src/deps';
import { createLogger } from '../src/logger';
import { memoryPush } from '../src/services/push';
import { noopRealtime, type Realtime } from '../src/services/realtime';
import type { StravaActivity, StravaApi, StravaDetailedActivity, StravaTokenResponse } from '../src/services/strava-api';

/** Strava falso: registra chamadas e devolve dados roteirizados. */
export class FakeStrava implements StravaApi {
  configured = true;
  calls: string[] = [];
  activities: StravaActivity[] = [];
  details: Record<number, StravaDetailedActivity> = {};
  revoked: string[] = [];
  nextToken: StravaTokenResponse = { access_token: 'acc-1', refresh_token: 'ref-1', expires_at: Math.floor(Date.now() / 1000) + 21_600, athlete: { id: 4242 } };
  authorizeUrl(p: { redirectUri: string; state: string }) {
    return `https://www.strava.com/oauth/authorize?redirect_uri=${encodeURIComponent(p.redirectUri)}&state=${encodeURIComponent(p.state)}`;
  }
  async exchangeCode(code: string) {
    this.calls.push(`exchange:${code}`);
    return this.nextToken;
  }
  async refresh(rt: string) {
    this.calls.push(`refresh:${rt}`);
    return { ...this.nextToken, access_token: 'acc-2', refresh_token: 'ref-2', expires_at: Math.floor(Date.now() / 1000) + 21_600 };
  }
  async listActivities(token: string) {
    this.calls.push(`list:${token}`);
    return this.activities;
  }
  async getActivity(token: string, id: number) {
    this.calls.push(`detail:${id}`);
    return this.details[id] ?? (this.activities.find((a) => a.id === id) as StravaDetailedActivity);
  }
  async revoke(token: string) {
    this.revoked.push(token);
  }
}

export async function createTestContext(opts: { env?: Record<string, string>; realtime?: Realtime; now?: () => Date } = {}) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'forja-test-'));
  const config = loadConfig({ NODE_ENV: 'test', SECRET: 'test-secret-'.padEnd(48, 'x'), DATA_DIR: dataDir, INVITE_CODE: 'amigos', LOG_LEVEL: 'silent', PUBLIC_URL: 'http://forja.test', ...opts.env });
  const handle = createDb({ pgliteDir: null });
  await handle.migrate();
  await seedReference(handle.db);
  const strava = new FakeStrava();
  const push = memoryPush();
  const deps: Deps = { db: handle.db, config, logger: createLogger('silent'), realtime: opts.realtime ?? noopRealtime, push, strava, now: opts.now ?? (() => new Date()) };
  const app = createApp(deps);
  return { deps, app, handle, strava, push, api: () => request(app) };
}
export type Ctx = Awaited<ReturnType<typeof createTestContext>>;

let n = 0;
export async function register(ctx: Ctx, name = `Pessoa ${++n}`, password = 'senha123') {
  const res = await ctx.api().post('/v1/auth/register').send({ name, password, inviteCode: 'amigos' });
  if (res.status !== 201) throw new Error(`register ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.user.id as string, name, password, token: res.body.token as string, auth: { Authorization: `Bearer ${res.body.token}` }, isAdmin: res.body.user.isAdmin as boolean };
}
export type User = Awaited<ReturnType<typeof register>>;

/** JPEG com metadados EXIF (inclusive um campo de GPS) para testar a limpeza. */
export async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: '#7c5cff' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'TestCam', Copyright: 'segredo' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1' } })
    .toBuffer();
}

export async function upload(ctx: Ctx, u: User, kind = 'body') {
  const res = await ctx.api().post('/v1/files').set(u.auth).field('kind', kind).attach('file', await jpegWithExif(), { filename: 'foto.jpg', contentType: 'image/jpeg' });
  if (res.status !== 201) throw new Error(`upload ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; url: string; thumbUrl: string; width: number; height: number };
}
