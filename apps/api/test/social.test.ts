import { addDays } from '@forja/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema';
import { localDateIn } from '../src/modules/competitions';
import { queueLeaderCheck } from '../src/services/rankings';
import { dailyRollover, eventReminders, streakReminders, tick } from '../src/services/scheduler';
import { createTestContext, type Ctx, register, type User } from './helpers';

// Relógio controlado: 1º de dezembro de 2026, 15h em São Paulo.
let clock = new Date('2026-12-01T15:00:00-03:00');
const today = () => localDateIn('America/Sao_Paulo', clock);

let ctx: Ctx;
let ana: User; // administradora (primeira conta)
let bia: User;
let caio: User;

const notificationsOf = async (u: User) => (await ctx.api().get('/v1/notifications').set(u.auth).expect(200)).body as { kind: string; title: string; body: string; readAt: string | null; url: string | null }[];
const seedDays = (u: User, daysAgo: number[]) => ctx.deps.db.insert(s.workoutLogs).values(daysAgo.map((d) => ({ userId: u.id, date: addDays(today(), -d), kind: 'run' })));

beforeAll(async () => {
  ctx = await createTestContext({ now: () => clock, env: { TIMEZONE: 'America/Sao_Paulo' } });
  ana = await register(ctx, 'Ana');
  bia = await register(ctx, 'Bia');
  caio = await register(ctx, 'Caio');
});
afterAll(async () => {
  await queueLeaderCheck(ctx.deps);
  await ctx.handle.close();
});

describe('notificações', () => {
  it('quem já está no grupo recebe o aviso de gente nova', async () => {
    const list = await notificationsOf(ana);
    expect(list.some((n) => n.kind === 'member.joined' && n.title.includes('Caio'))).toBe(true);
    expect((await notificationsOf(caio)).some((n) => n.kind === 'member.joined' && n.title.includes('Caio'))).toBe(false);
  });

  it('treino marcado avisa o grupo (lista + celular), menos quem marcou', async () => {
    ctx.push.sent.length = 0;
    const startsAt = new Date(clock.getTime() + 3 * 3_600_000).toISOString();
    const ev = await ctx.api().post('/v1/events').set(bia.auth).send({ title: 'Corrida no parque', startsAt, durationMin: 60, location: 'Ibirapuera', kind: 'run' }).expect(201);
    const forAna = (await notificationsOf(ana)).find((n) => n.kind === 'event.created');
    expect(forAna).toMatchObject({ url: `/events/${ev.body.id}` });
    expect(forAna!.title).toContain('Corrida no parque');
    expect(forAna!.body).toContain('Ibirapuera');
    expect((await notificationsOf(bia)).some((n) => n.kind === 'event.created')).toBe(false);
    const pushed = ctx.push.sent.find((p) => p.payload.url === `/events/${ev.body.id}`);
    expect(pushed?.userIds.sort()).toEqual([ana.id, caio.id].sort());

    // Cancelar avisa quem confirmou (Caio confirmou; Ana não).
    await ctx.api().put(`/v1/events/${ev.body.id}/rsvp`).set(caio.auth).send({ status: 'going' }).expect(200);
    await ctx.api().delete(`/v1/events/${ev.body.id}`).set(bia.auth).expect(204);
    expect((await notificationsOf(caio)).some((n) => n.kind === 'event.cancelled')).toBe(true);
    expect((await notificationsOf(ana)).some((n) => n.kind === 'event.cancelled')).toBe(false);
  });

  it('mensagem do chat vai para o celular mas não para o sininho, e respeita as preferências', async () => {
    const rooms = (await ctx.api().get('/v1/chat/rooms').set(ana.auth).expect(200)).body as { id: string; kind: string }[];
    const group = rooms.find((r) => r.kind === 'group')!;
    await ctx.api().put('/v1/notifications/prefs').set(caio.auth).send({ chat: false }).expect(200);
    ctx.push.sent.length = 0;
    await ctx.api().post(`/v1/chat/rooms/${group.id}/messages`).set(ana.auth).send({ text: 'Bora treinar amanhã?' }).expect(201);
    const chatPush = ctx.push.sent.find((p) => p.payload.tag === `chat:${group.id}`)!;
    expect(chatPush.payload.body).toBe('Bora treinar amanhã?');
    expect(chatPush.userIds).toEqual([bia.id]); // Caio desligou o chat; Ana escreveu
    expect((await notificationsOf(bia)).some((n) => n.kind === 'chat.message')).toBe(false);
    const prefs = (await ctx.api().get('/v1/notifications/prefs').set(caio.auth).expect(200)).body;
    expect(prefs.prefs).toMatchObject({ chat: false, events: true });
    expect(prefs.publicKey).toBeTruthy();
  });

  it('contador de não lidas e marcar como lidas', async () => {
    const before = (await ctx.api().get('/v1/notifications/unread').set(ana.auth).expect(200)).body.count as number;
    expect(before).toBeGreaterThan(0);
    await ctx.api().post('/v1/notifications/read').set(ana.auth).send({}).expect(204);
    expect((await ctx.api().get('/v1/notifications/unread').set(ana.auth).expect(200)).body.count).toBe(0);
  });

  it('inscreve e remove um aparelho (Web Push)', async () => {
    const sub = { endpoint: 'https://push.example.com/abc123', keys: { p256dh: 'BOr6kFZ1T3kVfX5jQx0p9gW8L2nM1cDeAfH', auth: 'k3Jh8sQw2ZxV' } };
    await ctx.api().post('/v1/push/subscriptions').set(bia.auth).send(sub).expect(201);
    await ctx.api().post('/v1/push/subscriptions').set(bia.auth).send(sub).expect(201); // repetir não duplica
    expect(await ctx.deps.db.$count(s.pushSubscriptions)).toBe(1);
    await ctx.api().delete('/v1/push/subscriptions').set(bia.auth).send({ endpoint: sub.endpoint }).expect(204);
    expect(await ctx.deps.db.$count(s.pushSubscriptions)).toBe(0);
  });
});

describe('sequência de dias', () => {
  it('só aceita marcar atividade de hoje e dos 2 dias anteriores', async () => {
    await ctx.api().post('/v1/logs').set(caio.auth).send({ date: addDays(today(), -3), kind: 'run' }).expect(400);
    await ctx.api().post('/v1/logs').set(caio.auth).send({ date: addDays(today(), 1), kind: 'run' }).expect(400);
  });

  it('atividade de hoje aparece para o grupo, e o 1º lugar é registrado sem aviso na primeira vez', async () => {
    const res = await ctx.api().post('/v1/logs').set(ana.auth).send({ date: today(), kind: 'strength', durationMin: 50 }).expect(201);
    expect(res.body.streak).toMatchObject({ current: 1, doneToday: true });
    await queueLeaderCheck(ctx.deps);
    const group = (await ctx.api().get('/v1/activity/group').set(bia.auth).expect(200)).body;
    expect(group.doneToday).toBe(1);
    expect(group.members[0]).toMatchObject({ user: { name: 'Ana' }, todayKinds: ['strength'] });
    expect(group.me).toMatchObject({ current: 0, doneToday: false });
    expect((await notificationsOf(ana)).some((n) => n.kind === 'ranking.gain')).toBe(false);
  });

  it('marco de 3 dias avisa a pessoa e o grupo; quem passa no ranking assume o 1º lugar', async () => {
    await seedDays(bia, [1, 2]);
    const res = await ctx.api().post('/v1/logs').set(bia.auth).send({ date: today(), kind: 'run' }).expect(201);
    expect(res.body.streak.current).toBe(3);
    expect((await notificationsOf(bia)).some((n) => n.kind === 'streak.milestone.self' && n.title.includes('3 dias'))).toBe(true);
    expect((await notificationsOf(caio)).some((n) => n.kind === 'streak.milestone' && n.title.includes('Bia'))).toBe(true);

    await queueLeaderCheck(ctx.deps);
    const gain = (await notificationsOf(bia)).find((n) => n.kind === 'ranking.gain');
    expect(gain?.title).toContain('Sequência');
    const loss = (await notificationsOf(ana)).find((n) => n.kind === 'ranking.loss');
    expect(loss?.body).toContain('Bia');
    expect((await notificationsOf(caio)).some((n) => n.kind === 'ranking.leader')).toBe(true);
    expect((await notificationsOf(ana)).some((n) => n.kind === 'ranking.leader')).toBe(false);
  });

  it('calendário das últimas semanas é visível para o grupo', async () => {
    const cal = (await ctx.api().get('/v1/activity/calendar').set(caio.auth).query({ userId: bia.id }).expect(200)).body;
    expect(cal.days).toHaveLength(35);
    expect(cal.days.at(-1)).toMatchObject({ date: today(), kinds: ['run'] });
    expect(cal.streak.current).toBe(3);
  });
});

describe('rankings', () => {
  it('três rankings: sequência, atributos físicos e evolução', async () => {
    await ctx.api().post('/v1/tests/results').set(caio.auth).send({ testId: 'push_ups', date: today(), value: 40 }).expect(201);
    await ctx.api().post('/v1/body/weigh-ins').set(ana.auth).send({ date: addDays(today(), -2), weightKg: 80 }).expect(201);
    await ctx.deps.db.insert(s.weighIns).values({ userId: ana.id, date: addDays(today(), -30), weightKg: 82 });
    await ctx.api().patch('/v1/me').set(ana.auth).send({ goal: 'lose_fat' }).expect(200);
    const r = (await ctx.api().get('/v1/rankings').set(bia.auth).expect(200)).body;
    expect(r.boards.streak[0]).toMatchObject({ rank: 1, value: 3, user: { name: 'Bia' } });
    expect(r.boards.physical[0]).toMatchObject({ rank: 1, user: { name: 'Caio' }, qualifies: true });
    expect(r.boards.physical[0].value).toBeGreaterThan(0);
    const anaEvo = r.boards.evolution.find((e: { user: { name: string } }) => e.user.name === 'Ana');
    expect(anaEvo).toMatchObject({ rank: 1, qualifies: true });
    // Ana não mostra os números do corpo: os outros veem só os pontos.
    expect(anaEvo.detail).toContain('privados');
    const own = (await ctx.api().get('/v1/rankings').set(ana.auth).expect(200)).body.boards.evolution.find((e: { user: { name: string } }) => e.user.name === 'Ana');
    expect(own.detail).toContain('Peso');
    expect(r.mine).toMatchObject({ streak: 1 });
  });
});

describe('assistente de treino', () => {
  let exA: string;
  let exB: string;
  beforeAll(async () => {
    const ex = await ctx.deps.db.select({ id: s.exercises.id }).from(s.exercises).limit(2);
    exA = ex[0]!.id;
    exB = ex[1]!.id;
  });

  const session = (weight: number, start = new Date(clock.getTime() - 3_600_000)) => ({
    title: 'Peito e tríceps',
    kind: 'strength',
    startedAt: start.toISOString(),
    finishedAt: new Date(start.getTime() + 55 * 60_000).toISOString(),
    exercises: [
      { exerciseId: exA, sets: [{ weightKg: weight, reps: 10, restSec: 90 }, { weightKg: weight, reps: 8, restSec: 90 }] },
      { exerciseId: exB, sets: [{ weightKg: 20, reps: 12 }] },
    ],
  });

  it('salva o treino com as séries, conta como atividade e mostra o resumo', async () => {
    const res = await ctx.api().post('/v1/sessions').set(caio.auth).send(session(60)).expect(201);
    expect(res.body.summary).toMatchObject({ durationMin: 55, exercises: 2, sets: 3, reps: 30, volumeKg: 60 * 18 + 240, records: [] });
    expect(res.body.streak).toMatchObject({ current: 1, doneToday: true });
    const detail = (await ctx.api().get(`/v1/sessions/${res.body.log.id}`).set(caio.auth).expect(200)).body;
    expect(detail.exercises).toHaveLength(2);
    expect(detail.exercises[0].sets).toEqual([
      { weightKg: 60, reps: 10, durationSec: null, restSec: 90 },
      { weightKg: 60, reps: 8, durationSec: null, restSec: 90 },
    ]);
    await ctx.api().get(`/v1/sessions/${res.body.log.id}`).set(ana.auth).expect(404);
    const logs = (await ctx.api().get('/v1/logs').set(caio.auth).expect(200)).body;
    expect(logs[0]).toMatchObject({ source: 'session', title: 'Peito e tríceps', summary: { sets: 3, exercises: 2 } });
  });

  it('traz a última vez de cada exercício e detecta recorde', async () => {
    const prev = (await ctx.api().get('/v1/sessions/previous').set(caio.auth).query({ exerciseIds: `${exA},${exB}` }).expect(200)).body;
    expect(prev[0].last.sets).toEqual([
      { weightKg: 60, reps: 10, durationSec: null },
      { weightKg: 60, reps: 8, durationSec: null },
    ]);
    expect(prev[0].best).toMatchObject({ weightKg: 60, reps: 10, e1rm: 80 });
    const res = await ctx.api().post('/v1/sessions').set(caio.auth).send(session(70)).expect(201);
    expect(res.body.summary.records).toEqual([expect.objectContaining({ exerciseId: exA, weightKg: 70, reps: 10 })]);
  });

  it('não salva treino antigo nem exercício inexistente', async () => {
    await ctx.api().post('/v1/sessions').set(caio.auth).send(session(60, new Date(clock.getTime() - 4 * 86_400_000))).expect(400);
    await ctx.api().post('/v1/sessions').set(caio.auth).send({ ...session(60), exercises: [{ exerciseId: 'nao-existe', sets: [{ reps: 5 }] }] }).expect(400);
  });
});

describe('administrador', () => {
  it('só o administrador vê o painel', async () => {
    await ctx.api().get('/v1/admin/overview').set(bia.auth).expect(403);
    const o = (await ctx.api().get('/v1/admin/overview').set(ana.auth).expect(200)).body;
    expect(o.counts.members).toBe(3);
    expect(o.counts.sessions).toBe(2);
    expect(o.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('aviso para o grupo e notificação de teste', async () => {
    const sent = (await ctx.api().post('/v1/admin/announce').set(ana.auth).send({ title: 'Treino especial', body: 'Sábado tem treinão às 8h!' }).expect(200)).body;
    expect(sent.sent).toBe(3);
    expect((await notificationsOf(bia)).find((n) => n.kind === 'admin.announce')?.title).toBe('📣 Treino especial');
    ctx.push.sent.length = 0;
    await ctx.api().post('/v1/admin/test-notification').set(ana.auth).send({ type: 'leader_gain' }).expect(200);
    expect(ctx.push.sent).toEqual([expect.objectContaining({ userIds: [ana.id] })]);
    await ctx.api().post('/v1/admin/announce').set(bia.auth).send({ title: 'x', body: 'y' }).expect(403);
  });

  it('corrige a sequência de alguém (marca e apaga dias)', async () => {
    const added = await ctx.api().post(`/v1/admin/members/${ana.id}/activity`).set(ana.auth).send({ date: addDays(today(), -10), kind: 'other' }).expect(201);
    const list = (await ctx.api().get(`/v1/admin/members/${ana.id}/activity`).set(ana.auth).expect(200)).body;
    expect(list.logs.some((l: { id: string; source: string }) => l.id === added.body.id && l.source === 'admin')).toBe(true);
    await ctx.api().delete(`/v1/admin/logs/${added.body.id}`).set(ana.auth).expect(204);
    await ctx.api().delete(`/v1/admin/logs/${added.body.id}`).set(ana.auth).expect(404);
    await ctx.api().post(`/v1/admin/members/${ana.id}/activity`).set(bia.auth).send({ date: today() }).expect(403);
  });

  it('apaga mensagem de outra pessoa e cancela treino de outra pessoa', async () => {
    const rooms = (await ctx.api().get('/v1/chat/rooms').set(bia.auth).expect(200)).body as { id: string; kind: string }[];
    const group = rooms.find((r) => r.kind === 'group')!;
    const msg = await ctx.api().post(`/v1/chat/rooms/${group.id}/messages`).set(bia.auth).send({ text: 'mensagem errada' }).expect(201);
    await ctx.api().delete(`/v1/chat/messages/${msg.body.id}`).set(caio.auth).expect(403);
    await ctx.api().delete(`/v1/chat/messages/${msg.body.id}`).set(ana.auth).expect(204);
    const ev = await ctx.api().post('/v1/events').set(caio.auth).send({ title: 'Funcional', startsAt: new Date(clock.getTime() + 86_400_000).toISOString(), kind: 'functional' }).expect(201);
    await ctx.api().delete(`/v1/events/${ev.body.id}`).set(bia.auth).expect(403);
    await ctx.api().delete(`/v1/events/${ev.body.id}`).set(ana.auth).expect(204);
  });
});

describe('dieta montada com alimentos', () => {
  it('salva refeições com alimentos e macros, e continua aceitando texto livre', async () => {
    const plan = {
      title: 'Cutting',
      caloriesKcal: 2000,
      meals: [
        { name: 'Almoço', time: '12:30', foods: [{ name: 'Arroz branco cozido', foodId: 'arroz-branco', grams: 150, amount: '150 g', kcal: 192, proteinG: 3.8, carbsG: 42.2, fatG: 0.3 }] },
        { name: 'Lanche', items: 'Iogurte com banana' },
      ],
    };
    const saved = (await ctx.api().post('/v1/diet').set(bia.auth).send(plan).expect(201)).body;
    expect(saved.meals[0].foods[0]).toMatchObject({ foodId: 'arroz-branco', kcal: 192 });
    expect(saved.meals[1]).toMatchObject({ items: 'Iogurte com banana', foods: [] });
    await ctx.api().post('/v1/diet').set(bia.auth).send({ title: 'Vazio', meals: [{ name: 'Café' }] }).expect(400);
  });
});

describe('relógio: lembretes e virada do dia', () => {
  it('lembra 1 hora antes do treino marcado, uma vez só', async () => {
    const ev = await ctx.api().post('/v1/events').set(bia.auth).send({ title: 'Treino de perna', startsAt: new Date(clock.getTime() + 2 * 3_600_000).toISOString(), kind: 'strength' }).expect(201);
    await ctx.api().put(`/v1/events/${ev.body.id}/rsvp`).set(ana.auth).send({ status: 'going' }).expect(200);
    expect(await eventReminders(ctx.deps)).toBe(0); // ainda faltam 2 horas
    clock = new Date(clock.getTime() + 75 * 60_000);
    expect(await eventReminders(ctx.deps)).toBe(2); // Bia (marcou) e Ana (vai)
    expect(await eventReminders(ctx.deps)).toBe(0);
    expect((await notificationsOf(ana)).find((n) => n.kind === 'event.reminder')?.title).toContain('Treino de perna');
  });

  it('às 20h lembra quem tem sequência e ainda não treinou hoje', async () => {
    clock = new Date('2026-12-02T20:30:00-03:00'); // dia seguinte: Bia (3 dias) e Caio ainda não treinaram
    const sent = await streakReminders(ctx.deps);
    expect(sent).toBeGreaterThanOrEqual(2);
    expect((await notificationsOf(bia)).find((n) => n.kind === 'streak.reminder')?.title).toContain('3 dias');
  });

  it('virada do dia avisa quem zerou a sequência e roda só uma vez por dia', async () => {
    clock = new Date('2026-12-03T00:05:00-03:00'); // dia 02 passou em branco para a Bia (sequência de 3)
    expect(await dailyRollover(ctx.deps)).toBeGreaterThanOrEqual(1);
    expect((await notificationsOf(bia)).find((n) => n.kind === 'streak.broken')?.title).toContain('3 dias');
    const first = await tick(ctx.deps);
    const second = await tick(ctx.deps);
    expect(first.rollover).toBeGreaterThanOrEqual(0);
    expect(second).toEqual({ reminders: 0, streak: 0, rollover: 0 });
    const [u] = await ctx.deps.db.select().from(s.users).where(eq(s.users.id, bia.id));
    expect(u!.notifyPrefs).toEqual({});
  });
});
