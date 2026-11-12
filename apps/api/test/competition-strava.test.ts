import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localDateIn } from '../src/modules/competitions';
import * as s from '../src/db/schema';
import { decrypt } from '../src/services/crypto';
import { createTestContext, type Ctx, register, type User } from './helpers';

let ctx: Ctx;
let ana: User;
let bruno: User;
let caio: User;
beforeAll(async () => {
  ctx = await createTestContext();
  ana = await register(ctx, 'Ana');
  bruno = await register(ctx, 'Bruno');
  caio = await register(ctx, 'Caio');
});
afterAll(async () => {
  await ctx.handle.close();
});

const today = () => localDateIn('America/Sao_Paulo', new Date());
const daysAgo = (n: number) => {
  const d = new Date(`${today()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe('catálogo e rotinas (openGym)', () => {
  it('pesquisa em português e traz os planos prontos', async () => {
    const res = await ctx.api().get('/v1/exercises').query({ q: 'supino barra' }).set(ana.auth);
    expect(res.body.items.map((e: { id: string }) => e.id)).toContain('0025');
    const all = await ctx.api().get('/v1/exercises').query({ limit: 1 }).set(ana.auth);
    expect(all.body.total).toBe(5632);
    const detail = await ctx.api().get('/v1/exercises/0025').set(ana.auth);
    expect(detail.body).toMatchObject({ namePt: 'supino com barra', instructionsLang: 'pt', textSource: 'exercisedb-mit' });
    const routines = await ctx.api().get('/v1/routines').set(ana.auth);
    expect(routines.body.filter((r: { planKey: string | null }) => r.planKey).length).toBe(13);
  });

  it('copia um plano pronto para editar e valida exercícios', async () => {
    const routines = await ctx.api().get('/v1/routines').set(ana.auth);
    const copy = await ctx.api().post(`/v1/routines/${routines.body[0].id}/copy`).set(ana.auth);
    expect(copy.status).toBe(201);
    expect(copy.body.ownerId).toBe(ana.id);
    expect((await ctx.api().get(`/v1/routines/${copy.body.id}`).set(bruno.auth)).status).toBe(404);
    expect((await ctx.api().post('/v1/routines').set(ana.auth).send({ name: 'X', exercises: [{ exerciseId: '9999999', sets: 3, reps: '10' }] })).status).toBe(400);
  });
});

describe('testes físicos', () => {
  it('registra com validação, guarda o peso do dia e detecta recorde', async () => {
    await ctx.api().post('/v1/body/weigh-ins').set(bruno.auth).send({ date: daysAgo(40), weightKg: 80 }).expect(201);
    const bad = await ctx.api().post('/v1/tests/results').set(bruno.auth).send({ testId: 'bench', date: daysAgo(10), value: 100 });
    expect(bad.status).toBe(400); // faltam repetições
    const first = await ctx.api().post('/v1/tests/results').set(bruno.auth).send({ testId: 'bench', date: daysAgo(30), value: 90, reps: 3 });
    expect(first.body).toMatchObject({ bodyweightKg: 80, estimated: true, isRecord: true, firstTime: true });
    const second = await ctx.api().post('/v1/tests/results').set(bruno.auth).send({ testId: 'bench', date: daysAgo(5), value: 100, reps: 1 });
    expect(second.body).toMatchObject({ isRecord: true, firstTime: false, estimated: false });
  });

  it('ranking de força pela pontuação DOTS e radar 0–20', async () => {
    await ctx.api().patch('/v1/me').set(bruno.auth).send({ sex: 'male' }).expect(200);
    await ctx.api().patch('/v1/me').set(caio.auth).send({ sex: 'male' }).expect(200);
    await ctx.api().post('/v1/body/weigh-ins').set(caio.auth).send({ date: daysAgo(40), weightKg: 110 }).expect(201);
    // Caio levanta mais em kg, mas pesa muito mais: Bruno vence no DOTS.
    await ctx.api().post('/v1/tests/results').set(caio.auth).send({ testId: 'bench', date: daysAgo(5), value: 110, reps: 1 }).expect(201);
    const board = await ctx.api().get('/v1/tests/bench/leaderboard').set(ana.auth);
    expect(board.body.entries.map((e: { user: { name: string } }) => e.user.name)).toEqual(['Bruno', 'Caio']);
    expect(board.body.entries[0].dots).toBeGreaterThan(board.body.entries[1].dots);
    const radar = await ctx.api().get('/v1/tests/radar').query({ userId: bruno.id, compareWith: caio.id }).set(ana.auth);
    expect(radar.body.axes).toHaveLength(11);
    expect(radar.body.axes.find((a: { testId: string }) => a.testId === 'bench').score).toBe(12.1);
    expect(radar.body.compare.find((a: { testId: string }) => a.testId === 'squat').score).toBeNull();
    // Recordes de um amigo para o perfil: melhor resultado por teste (1RM estimado de 90×3 perde para 100×1).
    const bests = await ctx.api().get('/v1/tests/bests').query({ userId: bruno.id }).set(ana.auth);
    expect(bests.body).toHaveLength(11);
    expect(bests.body.find((b: { testId: string }) => b.testId === 'bench')).toMatchObject({ count: 2, best: { value: 100, reps: 1 } });
    expect(bests.body.find((b: { testId: string }) => b.testId === 'run_5k')).toMatchObject({ count: 0, best: null });
  });

  it('"eu vi": amigo confirma, mas ninguém confirma o próprio resultado', async () => {
    const hist = await ctx.api().get('/v1/tests/bench/history').query({ userId: bruno.id }).set(ana.auth);
    const id = hist.body.results.at(-1).id;
    expect((await ctx.api().post(`/v1/tests/results/${id}/confirm`).set(bruno.auth)).status).toBe(403);
    await ctx.api().post(`/v1/tests/results/${id}/confirm`).set(ana.auth).expect(200);
    const after = await ctx.api().get('/v1/tests/bench/history').query({ userId: bruno.id }).set(caio.auth);
    expect(after.body.results.at(-1).confirmedBy).toEqual([ana.id]);
  });
});

describe('competição', () => {
  let compId: string;

  it('cria, entra com objetivo e calcula de forma justa entre objetivos diferentes', async () => {
    const res = await ctx.api().post('/v1/competitions').set(ana.auth).send({ name: 'Verão 2027', startDate: daysAgo(28), endDate: daysAgo(-60), goal: 'lose_fat' });
    expect(res.status).toBe(201);
    compId = res.body.id;
    expect(res.body.standings[0]).toMatchObject({ name: 'Ana', goal: 'lose_fat' });
    await ctx.api().post(`/v1/competitions/${compId}/join`).set(bruno.auth).send({ goal: 'gain_muscle' }).expect(200);
    // Ana: perdeu gordura no ritmo esperado (0,5% do peso por semana).
    await ctx.api().post('/v1/body/assessments').set(ana.auth).send({ date: daysAgo(29), weightKg: 80, bodyFatPct: 30 }).expect(201);
    await ctx.api().post('/v1/body/assessments').set(ana.auth).send({ date: daysAgo(1), weightKg: 78.4, fatMassKg: 22.27, leanMassKg: 56.13 }).expect(201);
    // Bruno (iniciante): ganhou massa magra no ritmo esperado (1% do peso por mês).
    await ctx.api().post('/v1/body/assessments').set(bruno.auth).send({ date: daysAgo(28), weightKg: 70, fatMassKg: 10.5, leanMassKg: 59.5 }).expect(201);
    await ctx.api().post('/v1/body/assessments').set(bruno.auth).send({ date: daysAgo(0), weightKg: 70.86, fatMassKg: 10.7, leanMassKg: 60.16 }).expect(201);
    // Histórico de treinos já existente (o registro pelo app só aceita hoje e os 2 dias anteriores).
    await ctx.deps.db.insert(s.workoutLogs).values([2, 5, 9, 12, 16, 20].map((d) => ({ userId: ana.id, date: daysAgo(d), kind: 'run' })));
    const board = await ctx.api().get(`/v1/competitions/${compId}`).set(caio.auth);
    expect(board.body.phase).toBe('active');
    const byName = Object.fromEntries(board.body.standings.map((x: { name: string }) => [x.name, x]));
    expect(byName.Ana.body.points).toBe(100);
    expect(byName.Bruno.body.points).toBe(100);
    expect(byName.Ana.consistency.points).toBeGreaterThan(byName.Bruno.consistency.points);
    expect(board.body.standings[0].name).toBe('Ana');
    // Privacidade: quem não compartilha o corpo mostra só os pontos para os outros…
    expect(byName.Ana.body.summary).toMatch(/privados/);
    expect(JSON.stringify(board.body)).not.toMatch(/kg/);
    // …mas a própria pessoa vê as variações, e quem compartilha aparece para todos.
    const own = await ctx.api().get(`/v1/competitions/${compId}`).set(ana.auth);
    expect(own.body.standings.find((x: { name: string }) => x.name === 'Ana').body.summary).toMatch(/Gordura −1,7 kg/);
    await ctx.api().patch('/v1/me').set(bruno.auth).send({ shareBody: true }).expect(200);
    const shared = await ctx.api().get(`/v1/competitions/${compId}`).set(caio.auth);
    expect(shared.body.standings.find((x: { name: string }) => x.name === 'Bruno').body.summary).toMatch(/massa magra \+0,7 kg/);
  });

  it('objetivo travado 7 dias após o início; só quem criou edita', async () => {
    const res = await ctx.api().post(`/v1/competitions/${compId}/join`).set(ana.auth).send({ goal: 'gain_muscle' });
    expect(res.status).toBe(400);
    expect((await ctx.api().delete(`/v1/competitions/${compId}`).set(bruno.auth)).status).toBe(403);
    const home = await ctx.api().get('/v1/home').set(ana.auth);
    expect(home.body.competition).toMatchObject({ name: 'Verão 2027', myRank: 1, participants: 2 });
  });
});

describe('Strava (dados visíveis só para o dono)', () => {
  it('conecta: link com estado assinado, tokens cifrados e volta ao app', async () => {
    const link = await ctx.api().post('/v1/strava/connect').set(ana.auth).send({ returnTo: 'https://site-malicioso.example/roubo' });
    const url = new URL(link.body.url);
    expect(url.searchParams.get('redirect_uri')).toBe('http://forja.test/v1/strava/callback');
    const state = url.searchParams.get('state')!;
    const cb = await ctx.api().get('/v1/strava/callback').query({ code: 'abc', scope: 'read,activity:read_all', state });
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe('http://forja.test/strava?strava=connected');
    const [acc] = await ctx.deps.db.select().from(s.stravaAccounts).where(eq(s.stravaAccounts.userId, ana.id));
    expect(acc!.accessTokenEnc).not.toContain('acc-1');
    expect(decrypt(ctx.deps.config.SECRET, acc!.accessTokenEnc)).toBe('acc-1');
    const forged = await ctx.api().get('/v1/strava/callback').query({ code: 'abc', scope: 'activity:read_all', state: state.replace(/.$/, 'x') });
    expect(forged.status).toBe(400);
  });

  it('resume corridas pelos best efforts e mostra só para quem conectou', async () => {
    ctx.strava.activities = [
      { id: 1, name: 'Longão', sport_type: 'Run', distance: 10_100, moving_time: 3000, elapsed_time: 3100, max_speed: 5.2, average_speed: 3.4, start_date: '2026-11-01T10:00:00Z' },
      { id: 2, name: 'Pedal', sport_type: 'Ride', distance: 30_000, moving_time: 3600, elapsed_time: 3700, max_speed: 14, average_speed: 8, start_date: '2026-11-02T10:00:00Z' },
    ];
    ctx.strava.details[1] = {
      ...ctx.strava.activities[0]!,
      best_efforts: [
        { name: '1K', distance: 1000, elapsed_time: 270, moving_time: 270 },
        { name: '5K', distance: 5000, elapsed_time: 1450, moving_time: 1450 },
        { name: '10K', distance: 10000, elapsed_time: 2970, moving_time: 2970 },
      ],
    };
    const sum = await ctx.api().get('/v1/strava/summary').set(ana.auth);
    expect(sum.status).toBe(200);
    expect(sum.body).toMatchObject({ runs: 1, cached: false, bests: { run_1k: { seconds: 270, source: 'best_effort' }, run_5k: { seconds: 1450 }, run_10k: { seconds: 2970 } }, maxSpeed: { kmh: 18.7 } });
    expect((await ctx.api().get('/v1/strava/summary').set(ana.auth)).body.cached).toBe(true);
    // Bruno não vê o Strava da Ana: só existe o próprio resumo.
    const other = await ctx.api().get('/v1/strava/summary').set(bruno.auth);
    expect(other.status).toBe(409);
    // Nada do Strava vai para os testes/ranking automaticamente.
    expect((await ctx.api().get('/v1/tests/run_5k/history').set(ana.auth)).body.results).toEqual([]);
  });

  it('apaga cache com mais de 7 dias e tudo ao desconectar ou revogar', async () => {
    await ctx.deps.db.update(s.stravaCache).set({ fetchedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(s.stravaCache.userId, ana.id));
    const fresh = await ctx.api().get('/v1/strava/summary').set(ana.auth);
    expect(fresh.body.cached).toBe(false);
    await ctx.api().post('/v1/strava/disconnect').set(ana.auth).expect(204);
    expect(ctx.strava.revoked).toEqual(['ref-1']);
    expect(await ctx.deps.db.select().from(s.stravaCache).where(eq(s.stravaCache.userId, ana.id))).toEqual([]);
    // Reconecta e revoga pelo site do Strava (webhook).
    const link = await ctx.api().post('/v1/strava/connect').set(ana.auth).send({});
    await ctx.api().get('/v1/strava/callback').query({ code: 'x', scope: 'activity:read_all', state: new URL(link.body.url).searchParams.get('state')! });
    await ctx.api().post('/v1/strava/webhook').send({ object_type: 'athlete', aspect_type: 'update', owner_id: 4242, updates: { authorized: 'false' } }).expect(200);
    expect((await ctx.api().get('/v1/strava/status').set(ana.auth)).body.connected).toBe(false);
  });
});
