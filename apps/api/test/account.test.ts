import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type Ctx, register, upload } from './helpers';

let ctx: Ctx;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.handle.close();
});

describe('segurança do site', () => {
  it('CSP só libera o próprio servidor (+ blob:/data: para enviar a foto escolhida no navegador)', async () => {
    const res = await ctx.api().get('/health');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self' ws: wss: blob: data:");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe('conta: só nome e senha', () => {
  it('exige o código do grupo e torna admin quem chega primeiro', async () => {
    const cfg = await ctx.api().get('/v1/auth/config');
    expect(cfg.body).toMatchObject({ inviteRequired: true, hasUsers: false });
    const bad = await ctx.api().post('/v1/auth/register').send({ name: 'Intruso', password: 'senha123', inviteCode: 'errado' });
    expect(bad.status).toBe(403);
    expect(bad.body.error.code).toBe('INVALID_INVITE');
    const first = await register(ctx, 'Eduardo');
    const second = await register(ctx, 'Lucas');
    expect(first.isAdmin).toBe(true);
    expect(second.isAdmin).toBe(false);
  });

  it('nomes são únicos ignorando maiúsculas e acentos; login também', async () => {
    await register(ctx, 'João Pedro');
    const dup = await ctx.api().post('/v1/auth/register').send({ name: 'joao  pedro', password: 'outra123', inviteCode: 'amigos' });
    expect(dup.status).toBe(409);
    const login = await ctx.api().post('/v1/auth/login').send({ name: 'JOAO PEDRO', password: 'senha123' });
    expect(login.status).toBe(200);
    expect(login.body.user.name).toBe('João Pedro');
  });

  it('senha errada e nome inexistente dão a mesma resposta', async () => {
    const a = await ctx.api().post('/v1/auth/login').send({ name: 'Eduardo', password: 'errada99' });
    const b = await ctx.api().post('/v1/auth/login').send({ name: 'Ninguém', password: 'errada99' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('edita perfil, troca senha e sai', async () => {
    const u = await register(ctx, 'Rafa');
    const avatar = await upload(ctx, u, 'avatar');
    const upd = await ctx.api().patch('/v1/me').set(u.auth).send({ goal: 'lose_fat', sex: 'male', heightCm: 178, birthDate: '1998-05-20', avatarFileId: avatar.id, shareBody: true });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ goal: 'lose_fat', heightCm: 178, shareBody: true });
    expect(upd.body.avatar.url).toContain('/v1/files/');
    expect(upd.body.passwordHash).toBeUndefined();
    const other = await ctx.api().post('/v1/auth/login').send({ name: 'Rafa', password: 'senha123' });
    await ctx.api().post('/v1/me/password').set(u.auth).send({ currentPassword: 'senha123', newPassword: 'nova1234' }).expect(200);
    expect((await ctx.api().get('/v1/me').set({ Authorization: `Bearer ${other.body.token}` })).status).toBe(401);
    expect((await ctx.api().get('/v1/me').set(u.auth)).status).toBe(200);
    await ctx.api().post('/v1/auth/logout').set(u.auth).expect(204);
    expect((await ctx.api().get('/v1/me').set(u.auth)).status).toBe(401);
  });

  it('sem e-mail: o admin gera senha temporária para quem esqueceu', async () => {
    const admin = await ctx.api().post('/v1/auth/login').send({ name: 'Eduardo', password: 'senha123' });
    const lucas = await ctx.api().post('/v1/auth/login').send({ name: 'Lucas', password: 'senha123' });
    const members = await ctx.api().get('/v1/members').set({ Authorization: `Bearer ${admin.body.token}` });
    const lucasId = members.body.find((m: { name: string }) => m.name === 'Lucas').id;
    const denied = await ctx.api().post(`/v1/admin/members/${lucasId}/reset-password`).set({ Authorization: `Bearer ${lucas.body.token}` });
    expect(denied.status).toBe(403);
    const reset = await ctx.api().post(`/v1/admin/members/${lucasId}/reset-password`).set({ Authorization: `Bearer ${admin.body.token}` });
    expect(reset.body.temporaryPassword).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect((await ctx.api().get('/v1/me').set({ Authorization: `Bearer ${lucas.body.token}` })).status).toBe(401);
    expect((await ctx.api().post('/v1/auth/login').send({ name: 'Lucas', password: reset.body.temporaryPassword })).status).toBe(200);
  });

  it('excluir a conta apaga dados e fotos do disco; o grupo não fica sem admin', async () => {
    const u = await register(ctx, 'Temporário');
    const f = await upload(ctx, u);
    const dir = path.join(ctx.deps.config.uploadsDir, u.id);
    expect(existsSync(dir)).toBe(true);
    await ctx.api().post('/v1/body/weigh-ins').set(u.auth).send({ date: '2026-11-01', weightKg: 80, photoFileIds: [f.id] }).expect(201);
    expect((await ctx.api().delete('/v1/me').set(u.auth).send({ password: 'errada' })).status).toBe(401);
    await ctx.api().delete('/v1/me').set(u.auth).send({ password: 'senha123' }).expect(204);
    expect(existsSync(dir)).toBe(false);
    expect((await ctx.api().post('/v1/auth/login').send({ name: 'Temporário', password: 'senha123' })).status).toBe(401);
  });

  it('exporta os próprios dados', async () => {
    const u = await register(ctx, 'Exporta');
    await ctx.api().post('/v1/body/weigh-ins').set(u.auth).send({ date: '2026-11-02', weightKg: 70 }).expect(201);
    const res = await ctx.api().get('/v1/me/export').set(u.auth);
    expect(res.body.format).toBe('forja-v2-export');
    expect(res.body.weighIns).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('password');
  });
});
