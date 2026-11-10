/**
 * Integração com o Strava, seguindo a API Agreement/Policy do Strava (jun/2026):
 * - os dados de uma pessoa são mostrados SÓ para ela (Policy 2.3);
 * - o resumo fica em cache por no máximo 7 dias (Policy 6.2) e não é copiado para
 *   testes, rankings ou competição — para competir, a pessoa registra o próprio teste;
 * - ao desconectar (ou revogar no Strava, via webhook) tudo é apagado (Policy 7.4);
 * - tokens ficam cifrados (AES-256-GCM).
 */
import { eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { AppError, badRequest } from '../http/errors';
import type { RouteRegistry } from '../http/registry';
import { decrypt, encrypt, readState, signState } from '../services/crypto';
import { StravaError } from '../services/strava-api';
import { RUN_TYPES, summarizeRuns } from '../services/strava-summary';

const CACHE_FRESH_MS = 6 * 3_600_000;
const CACHE_MAX_MS = 7 * 86_400_000;
const MIN_REFRESH_MS = 10 * 60_000;
const PERIOD_DAYS = 180;
const MAX_DETAILS = 12;

function needConfigured(deps: Deps) {
  if (!deps.strava.configured) throw new AppError(503, 'STRAVA_NOT_CONFIGURED', 'O Strava ainda não foi configurado no servidor (veja docs/STRAVA.md).');
}

/** Só aceita voltar para o próprio site ou para o app (deep link forja://). */
function safeReturnTo(deps: Deps, returnTo: string | undefined): string {
  const fallback = `${deps.config.publicUrl}/strava`;
  if (!returnTo) return fallback;
  const allowed = [deps.config.publicUrl, 'forja://', 'exp://', 'http://localhost:', 'http://127.0.0.1:'];
  return allowed.some((p) => returnTo.startsWith(p)) ? returnTo : fallback;
}

async function deleteStravaData(deps: Deps, userId: string) {
  await deps.db.delete(s.stravaCache).where(eq(s.stravaCache.userId, userId));
  await deps.db.delete(s.stravaAccounts).where(eq(s.stravaAccounts.userId, userId));
}

/** Apaga resumos com mais de 7 dias (chamado periodicamente e a cada leitura). */
export async function purgeStravaCache(deps: Deps) {
  await deps.db.delete(s.stravaCache).where(lt(s.stravaCache.fetchedAt, new Date(deps.now().getTime() - CACHE_MAX_MS)));
}

async function accessTokenFor(deps: Deps, userId: string): Promise<string | null> {
  const [acc] = await deps.db.select().from(s.stravaAccounts).where(eq(s.stravaAccounts.userId, userId));
  if (!acc) return null;
  const secret = deps.config.SECRET;
  if (acc.expiresAt.getTime() - deps.now().getTime() > 5 * 60_000) return decrypt(secret, acc.accessTokenEnc);
  const t = await deps.strava.refresh(decrypt(secret, acc.refreshTokenEnc));
  // O Strava pode devolver um refresh token novo; o antigo deixa de valer na hora.
  await deps.db
    .update(s.stravaAccounts)
    .set({ accessTokenEnc: encrypt(secret, t.access_token), refreshTokenEnc: encrypt(secret, t.refresh_token), expiresAt: new Date(t.expires_at * 1000) })
    .where(eq(s.stravaAccounts.userId, userId));
  return t.access_token;
}

export function stravaRoutes(r: RouteRegistry) {
  r.add({
    method: 'get',
    path: '/strava/status',
    tag: 'Strava',
    summary: 'Situação da conexão com o Strava',
    handler: async ({ deps, user }) => {
      const [acc] = await deps.db.select({ athleteId: s.stravaAccounts.athleteId, connectedAt: s.stravaAccounts.connectedAt }).from(s.stravaAccounts).where(eq(s.stravaAccounts.userId, user.id));
      return { configured: deps.strava.configured, connected: !!acc, connectedAt: acc?.connectedAt ?? null };
    },
  });

  r.add({
    method: 'post',
    path: '/strava/connect',
    tag: 'Strava',
    summary: 'Gerar o link de autorização do Strava',
    body: z.object({ returnTo: z.string().max(500).optional() }),
    handler: async ({ deps, user, body }) => {
      needConfigured(deps);
      const state = signState(deps.config.SECRET, { u: user.id, r: safeReturnTo(deps, body.returnTo) }, 600, deps.now().getTime());
      return { url: deps.strava.authorizeUrl({ redirectUri: `${deps.config.publicUrl}/v1/strava/callback`, state }) };
    },
  });

  r.add({
    method: 'get',
    path: '/strava/callback',
    tag: 'Strava',
    summary: 'Retorno da autorização do Strava (redireciona de volta ao app)',
    access: 'public',
    query: z.object({ code: z.string().max(200).optional(), state: z.string().max(2000), scope: z.string().max(200).optional(), error: z.string().max(100).optional() }),
    handler: async ({ deps, query, res }) => {
      const state = readState<{ u: string; r: string }>(deps.config.SECRET, query.state, deps.now().getTime());
      if (!state) throw badRequest('Link de autorização expirado. Tente conectar de novo.');
      const back = (status: string) => {
        const url = new URL(state.r.includes('://') ? state.r : `${deps.config.publicUrl}${state.r}`);
        url.searchParams.set('strava', status);
        res.redirect(302, url.toString());
      };
      if (query.error || !query.code) return back('denied');
      if (!query.scope?.split(',').some((x) => x === 'activity:read_all' || x === 'activity:read')) return back('missing_scope');
      try {
        const t = await deps.strava.exchangeCode(query.code);
        if (!t.athlete?.id) return back('error');
        const values = {
          userId: state.u,
          athleteId: t.athlete.id,
          accessTokenEnc: encrypt(deps.config.SECRET, t.access_token),
          refreshTokenEnc: encrypt(deps.config.SECRET, t.refresh_token),
          expiresAt: new Date(t.expires_at * 1000),
          scope: query.scope,
        };
        // Uma conta do Strava só pode estar ligada a uma pessoa do grupo.
        await deps.db.delete(s.stravaAccounts).where(eq(s.stravaAccounts.athleteId, t.athlete.id));
        await deps.db.insert(s.stravaAccounts).values(values).onConflictDoUpdate({ target: s.stravaAccounts.userId, set: values });
        await deps.db.delete(s.stravaCache).where(eq(s.stravaCache.userId, state.u));
        return back('connected');
      } catch (err) {
        deps.logger.warn({ err: (err as Error).message }, 'Falha na troca de código do Strava');
        return back('error');
      }
    },
  });

  r.add({
    method: 'get',
    path: '/strava/summary',
    tag: 'Strava',
    summary: 'Minhas corridas do Strava (visível só para mim)',
    query: z.object({ refresh: z.coerce.boolean().default(false) }),
    handler: async ({ deps, user, query }) => {
      needConfigured(deps);
      await purgeStravaCache(deps);
      const [cache] = await deps.db.select().from(s.stravaCache).where(eq(s.stravaCache.userId, user.id));
      const age = cache ? deps.now().getTime() - cache.fetchedAt.getTime() : Infinity;
      if (cache && (age < CACHE_FRESH_MS || (query.refresh && age < MIN_REFRESH_MS))) return { ...(cache.payload as object), fetchedAt: cache.fetchedAt, cached: true };
      const token = await accessTokenFor(deps, user.id).catch((err: unknown) => {
        if (err instanceof StravaError && err.status === 401) return null;
        throw err;
      });
      if (!token) throw new AppError(409, 'STRAVA_NOT_CONNECTED', 'Conecte sua conta do Strava primeiro.');
      try {
        const after = Math.floor(deps.now().getTime() / 1000) - PERIOD_DAYS * 86_400;
        const activities = [];
        for (let page = 1; page <= 3; page++) {
          const batch = await deps.strava.listActivities(token, { after, perPage: 100, page });
          activities.push(...batch);
          if (batch.length < 100) break;
        }
        const runs = activities.filter((a) => RUN_TYPES.has(a.sport_type ?? a.type ?? ''));
        // Detalhes (com best efforts) só das corridas mais longas e recentes, para poupar o limite da API.
        const pick = [...runs].filter((a) => a.distance >= 1000).sort((a, b) => b.distance - a.distance || b.start_date.localeCompare(a.start_date)).slice(0, MAX_DETAILS);
        const details = [];
        for (const a of pick) details.push(await deps.strava.getActivity(token, a.id));
        const payload = summarizeRuns(activities, details, PERIOD_DAYS);
        const fetchedAt = deps.now();
        await deps.db.insert(s.stravaCache).values({ userId: user.id, payload, fetchedAt }).onConflictDoUpdate({ target: s.stravaCache.userId, set: { payload, fetchedAt } });
        return { ...payload, fetchedAt, cached: false };
      } catch (err) {
        if (err instanceof StravaError) throw new AppError(err.status === 429 ? 429 : 502, 'STRAVA_ERROR', err.message);
        throw err;
      }
    },
  });

  r.add({
    method: 'post',
    path: '/strava/disconnect',
    tag: 'Strava',
    summary: 'Desconectar e apagar meus dados do Strava',
    handler: async ({ deps, user }) => {
      const [acc] = await deps.db.select().from(s.stravaAccounts).where(eq(s.stravaAccounts.userId, user.id));
      if (acc && deps.strava.configured) {
        await deps.strava.revoke(decrypt(deps.config.SECRET, acc.refreshTokenEnc)).catch((err: Error) => deps.logger.warn({ err: err.message }, 'Revogação no Strava falhou'));
      }
      await deleteStravaData(deps, user.id);
      return undefined;
    },
  });

  // Webhook: o Strava avisa quando alguém revoga o acesso pelo site dele.
  r.add({
    method: 'get',
    path: '/strava/webhook',
    tag: 'Strava',
    summary: 'Validação da assinatura de webhook do Strava',
    access: 'public',
    query: z.object({ 'hub.mode': z.string().optional(), 'hub.challenge': z.string().max(200).optional(), 'hub.verify_token': z.string().max(200).optional() }),
    handler: async ({ deps, query }) => {
      const expected = deps.config.STRAVA_WEBHOOK_VERIFY_TOKEN;
      if (!expected || query['hub.mode'] !== 'subscribe' || query['hub.verify_token'] !== expected) throw new AppError(403, 'FORBIDDEN', 'Token de verificação inválido');
      return { 'hub.challenge': query['hub.challenge'] };
    },
  });

  r.add({
    method: 'post',
    path: '/strava/webhook',
    tag: 'Strava',
    summary: 'Eventos do Strava (desautorização apaga os dados da pessoa)',
    access: 'public',
    body: z.object({ object_type: z.string(), aspect_type: z.string(), owner_id: z.number(), updates: z.record(z.string(), z.unknown()).optional() }).loose(),
    handler: async ({ deps, body }) => {
      if (body.object_type === 'athlete' && body.updates?.authorized === 'false') {
        const [acc] = await deps.db.select({ userId: s.stravaAccounts.userId }).from(s.stravaAccounts).where(eq(s.stravaAccounts.athleteId, body.owner_id));
        if (acc) await deleteStravaData(deps, acc.userId);
      }
      return { ok: true };
    },
  });
}
