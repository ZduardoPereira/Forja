import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { userFromToken } from '../src/http/auth';
import { attachRealtime } from '../src/services/realtime';
import { createTestContext, type Ctx, register, upload, type User } from './helpers';

let ctx: Ctx;
let edu: User;
let lia: User;
let server: Server;
let wsUrl: string;
let rt: ReturnType<typeof attachRealtime>;

beforeAll(async () => {
  ctx = await createTestContext();
  edu = await register(ctx, 'Edu');
  lia = await register(ctx, 'Lia');
  server = createServer(ctx.app);
  rt = attachRealtime(server, ctx.deps.logger, (t) => userFromToken(ctx.deps, t));
  ctx.deps.realtime = rt;
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});
afterAll(async () => {
  rt.close();
  await new Promise((r) => server.close(r));
  await ctx.handle.close();
});

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('treinos marcados', () => {
  let eventId: string;

  it('marca treino, avisa no chat do grupo e cria sala própria', async () => {
    const routines = await ctx.api().get('/v1/routines').set(edu.auth);
    const ppl = routines.body.find((r: { planKey: string }) => r.planKey === 'ppl');
    const res = await ctx.api().post('/v1/events').set(edu.auth).send({ title: 'Peito e tríceps', startsAt: inHours(24), durationMin: 75, location: 'Academia do bairro', kind: 'strength', routineId: ppl.id });
    expect(res.status).toBe(201);
    eventId = res.body.id;
    expect(res.body).toMatchObject({ myStatus: 'going', counts: { going: 1, maybe: 0 }, routine: { name: ppl.name } });
    const rooms = await ctx.api().get('/v1/chat/rooms').set(lia.auth);
    const group = rooms.body.find((r: { kind: string }) => r.kind === 'group');
    expect(group.lastMessage.text).toContain('Marquei "Peito e tríceps"');
    expect(group.unread).toBe(1);
    expect(rooms.body.some((r: { eventId: string }) => r.eventId === eventId)).toBe(true);
  });

  it('amigos respondem vou / talvez / não vou', async () => {
    const res = await ctx.api().put(`/v1/events/${eventId}/rsvp`).set(lia.auth).send({ status: 'maybe' });
    expect(res.body.counts).toEqual({ going: 1, maybe: 1 });
    const detail = await ctx.api().get(`/v1/events/${eventId}`).set(edu.auth);
    expect(detail.body.attendees.map((a: { user: { name: string }; status: string }) => [a.user.name, a.status]).sort()).toEqual([
      ['Edu', 'going'],
      ['Lia', 'maybe'],
    ]);
    expect(detail.body.routineDetail.exercises.length).toBeGreaterThan(0);
    const upcoming = await ctx.api().get('/v1/events').set(lia.auth);
    expect(upcoming.body[0]).toMatchObject({ id: eventId, myStatus: 'maybe' });
  });

  it('presença só pode ser confirmada depois do início; só quem marcou edita/cancela', async () => {
    expect((await ctx.api().post(`/v1/events/${eventId}/check-in`).set(lia.auth).send({ attended: true })).status).toBe(400);
    const past = await ctx.api().post('/v1/events').set(edu.auth).send({ title: 'Corrida no parque', startsAt: inHours(-2), durationMin: 60, kind: 'run' });
    const checked = await ctx.api().post(`/v1/events/${past.body.id}/check-in`).set(lia.auth).send({ attended: true });
    expect(checked.status).toBe(200);
    expect(checked.body.myAttended).toBe(true);
    expect((await ctx.api().put(`/v1/events/${eventId}`).set(lia.auth).send({ title: 'x', startsAt: inHours(30), kind: 'other' })).status).toBe(403);
    expect((await ctx.api().delete(`/v1/events/${eventId}`).set(lia.auth)).status).toBe(403);
    await ctx.api().delete(`/v1/events/${eventId}`).set(edu.auth).expect(204);
    const upcoming = await ctx.api().get('/v1/events').set(lia.auth);
    expect(upcoming.body.find((e: { id: string }) => e.id === eventId)).toBeUndefined();
  });
});

describe('chat', () => {
  it('entrega mensagens em tempo real por WebSocket (com autenticação)', async () => {
    const ws = new WebSocket(wsUrl);
    const received: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: lia.token })));
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        received.push(msg);
        if (msg.type === 'ready') resolve();
      });
      ws.on('error', reject);
    });
    const rooms = await ctx.api().get('/v1/chat/rooms').set(edu.auth);
    const group = rooms.body.find((r: { kind: string }) => r.kind === 'group');
    const photo = await upload(ctx, edu, 'chat');
    const gotIt = new Promise<{ message: { text: string; image: { url: string } } }>((resolve) =>
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'chat.message') resolve(msg);
      }),
    );
    await ctx.api().post(`/v1/chat/rooms/${group.id}/messages`).set(edu.auth).send({ text: 'Bora treinar!', fileId: photo.id }).expect(201);
    const evt = await gotIt;
    expect(evt.message.text).toBe('Bora treinar!');
    expect(evt.message.image.url).toContain('/v1/files/');
    expect(rt.online()).toContain(lia.id);
    ws.close();
  });

  it('recusa WebSocket sem token válido', async () => {
    const ws = new WebSocket(wsUrl);
    const code = await new Promise<number>((resolve) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: 'falso' })));
      ws.on('close', (c) => resolve(c));
    });
    expect(code).toBe(4003);
  });

  it('não lidas, paginação e mensagens vazias', async () => {
    const rooms = await ctx.api().get('/v1/chat/rooms').set(lia.auth);
    const group = rooms.body.find((r: { kind: string }) => r.kind === 'group');
    expect(group.unread).toBeGreaterThanOrEqual(2);
    await ctx.api().post(`/v1/chat/rooms/${group.id}/read`).set(lia.auth).expect(204);
    const after = await ctx.api().get('/v1/chat/rooms').set(lia.auth);
    expect(after.body.find((r: { kind: string }) => r.kind === 'group').unread).toBe(0);
    const msgs = await ctx.api().get(`/v1/chat/rooms/${group.id}/messages`).query({ limit: 1 }).set(lia.auth);
    expect(msgs.body).toHaveLength(1);
    const older = await ctx.api().get(`/v1/chat/rooms/${group.id}/messages`).query({ before: msgs.body[0].createdAt }).set(lia.auth);
    expect(older.body.length).toBeGreaterThan(0);
    expect((await ctx.api().post(`/v1/chat/rooms/${group.id}/messages`).set(lia.auth).send({ text: '   ' })).status).toBe(400);
  });
});
