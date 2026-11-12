import { randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { changePasswordSchema, loginSchema, profileSchema, registerSchema } from '@forja/shared';
import { and, asc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { bearer, createSession, sha256 } from '../http/auth';
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from '../http/errors';
import type { Limiters } from '../http/rate-limit';
import type { RouteRegistry } from '../http/registry';
import { assertOwnFiles, removeUserFiles } from '../services/files';
import { notify } from '../services/notify';
import { nameKey, ownProfile, publicUser } from '../services/people';
import { queueLeaderCheck } from '../services/rankings';

const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };
let dummyHash: Promise<string> | null = null;

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(sha256(a));
  const y = Buffer.from(sha256(b));
  return timingSafeEqual(x, y);
}

/** Senha temporária legível (ex.: "kq7m-2xpa-9tde"). */
function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

async function deleteUser(deps: Deps, userId: string) {
  await deps.db.transaction(async (tx) => {
    const [u] = await tx.select().from(s.users).where(eq(s.users.id, userId));
    if (!u) throw notFound('Pessoa');
    if (u.isAdmin) {
      // Não deixa o grupo sem administrador: promove a pessoa mais antiga.
      const [next] = await tx.select({ id: s.users.id }).from(s.users).where(ne(s.users.id, userId)).orderBy(asc(s.users.createdAt)).limit(1);
      if (next) await tx.update(s.users).set({ isAdmin: true }).where(eq(s.users.id, next.id));
    }
    await tx.update(s.users).set({ avatarFileId: null }).where(eq(s.users.id, userId));
    await tx.delete(s.users).where(eq(s.users.id, userId));
  });
  await removeUserFiles(deps.config.uploadsDir, userId);
}

export function accountRoutes(r: RouteRegistry, limiters: Limiters) {
  r.add({
    method: 'get',
    path: '/auth/config',
    tag: 'Conta',
    summary: 'Configuração pública: exige código do grupo? há usuários?',
    access: 'public',
    handler: async ({ deps }) => ({
      inviteRequired: !!deps.config.INVITE_CODE,
      hasUsers: (await deps.db.$count(s.users)) > 0,
      strava: deps.strava.configured,
    }),
  });

  r.add({
    method: 'post',
    path: '/auth/register',
    tag: 'Conta',
    summary: 'Criar conta (nome + senha + código do grupo)',
    access: 'public',
    status: 201,
    body: registerSchema,
    middleware: [limiters.auth],
    handler: async ({ deps, body, req }) => {
      if (deps.config.INVITE_CODE && !sameSecret(body.inviteCode ?? '', deps.config.INVITE_CODE)) {
        throw new AppError(403, 'INVALID_INVITE', 'Código do grupo incorreto');
      }
      const key = nameKey(body.name);
      const [taken] = await deps.db.select({ id: s.users.id }).from(s.users).where(eq(s.users.nameKey, key));
      if (taken) throw conflict('Já existe alguém com esse nome no grupo');
      const passwordHash = await hash(body.password, ARGON);
      const isFirst = (await deps.db.$count(s.users)) === 0;
      const [u] = await deps.db.insert(s.users).values({ name: body.name, nameKey: key, passwordHash, isAdmin: isFirst }).returning();
      const token = await createSession(deps, u!.id, req.headers['user-agent']);
      if (!isFirst) {
        await notify(deps, { to: 'all', except: u!.id, category: 'group', kind: 'member.joined', title: `👋 ${u!.name} entrou no grupo`, body: 'Dê as boas-vindas no chat e chame para o próximo treino.', url: `/people/${u!.id}`, actorId: u!.id });
      }
      return { token, user: ownProfile(deps, u!) };
    },
  });

  r.add({
    method: 'post',
    path: '/auth/login',
    tag: 'Conta',
    summary: 'Entrar com nome e senha',
    access: 'public',
    body: loginSchema,
    middleware: [limiters.auth],
    handler: async ({ deps, body, req }) => {
      const [u] = await deps.db.select().from(s.users).where(eq(s.users.nameKey, nameKey(body.name)));
      if (!u) {
        dummyHash ??= hash('forja-dummy-password', ARGON);
        await verify(await dummyHash, body.password).catch(() => false);
        throw unauthorized('Nome ou senha incorretos');
      }
      if (!(await verify(u.passwordHash, body.password).catch(() => false))) throw unauthorized('Nome ou senha incorretos');
      const token = await createSession(deps, u.id, req.headers['user-agent']);
      return { token, user: ownProfile(deps, u) };
    },
  });

  r.add({
    method: 'post',
    path: '/auth/logout',
    tag: 'Conta',
    summary: 'Sair deste aparelho',
    handler: async ({ deps, req }) => {
      const token = bearer(req);
      if (token) await deps.db.delete(s.authSessions).where(eq(s.authSessions.tokenHash, sha256(token)));
      return undefined;
    },
  });

  r.add({
    method: 'get',
    path: '/me',
    tag: 'Conta',
    summary: 'Meu perfil',
    handler: async ({ deps, user }) => {
      const [u] = await deps.db.select().from(s.users).where(eq(s.users.id, user.id));
      return ownProfile(deps, u!);
    },
  });

  r.add({
    method: 'patch',
    path: '/me',
    tag: 'Conta',
    summary: 'Editar perfil (nome, foto, objetivo, dados físicos, privacidade do corpo)',
    body: profileSchema,
    handler: async ({ deps, user, body }) => {
      const patch: Partial<typeof s.users.$inferInsert> = { ...body };
      if (body.name) {
        const key = nameKey(body.name);
        const [taken] = await deps.db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.nameKey, key), ne(s.users.id, user.id)));
        if (taken) throw conflict('Já existe alguém com esse nome no grupo');
        patch.nameKey = key;
      }
      if (body.avatarFileId) await assertOwnFiles(deps.db, user.id, [body.avatarFileId]);
      const [u] = await deps.db.update(s.users).set(patch).where(eq(s.users.id, user.id)).returning();
      // Objetivo, experiência e sexo mudam a evolução e a força relativa.
      if (body.goal || body.experience || body.sex !== undefined) void queueLeaderCheck(deps);
      return ownProfile(deps, u!);
    },
  });

  r.add({
    method: 'post',
    path: '/me/password',
    tag: 'Conta',
    summary: 'Trocar senha (encerra as outras sessões)',
    body: changePasswordSchema,
    middleware: [limiters.auth],
    handler: async ({ deps, user, body, req }) => {
      const [u] = await deps.db.select().from(s.users).where(eq(s.users.id, user.id));
      if (!(await verify(u!.passwordHash, body.currentPassword).catch(() => false))) throw unauthorized('Senha atual incorreta');
      await deps.db.update(s.users).set({ passwordHash: await hash(body.newPassword, ARGON) }).where(eq(s.users.id, user.id));
      const current = bearer(req)!;
      await deps.db.delete(s.authSessions).where(and(eq(s.authSessions.userId, user.id), ne(s.authSessions.tokenHash, sha256(current))));
      return { ok: true };
    },
  });

  r.add({
    method: 'delete',
    path: '/me',
    tag: 'Conta',
    summary: 'Excluir minha conta e todos os meus dados',
    body: z.object({ password: z.string().min(1).max(128) }),
    handler: async ({ deps, user, body }) => {
      const [u] = await deps.db.select().from(s.users).where(eq(s.users.id, user.id));
      if (!(await verify(u!.passwordHash, body.password).catch(() => false))) throw unauthorized('Senha incorreta');
      await deleteUser(deps, user.id);
      return undefined;
    },
  });

  r.add({
    method: 'get',
    path: '/me/export',
    tag: 'Conta',
    summary: 'Exportar todos os meus dados (JSON)',
    handler: async ({ deps, user, res }) => {
      const uid = user.id;
      const db = deps.db;
      const [u] = await db.select().from(s.users).where(eq(s.users.id, uid));
      const data = {
        format: 'forja-v2-export',
        exportedAt: deps.now().toISOString(),
        profile: ownProfile(deps, u!),
        weighIns: await db.select().from(s.weighIns).where(eq(s.weighIns.userId, uid)),
        assessments: await db.select().from(s.assessments).where(eq(s.assessments.userId, uid)),
        attachments: await db.select().from(s.attachments).where(eq(s.attachments.userId, uid)),
        dietPlans: await db.select().from(s.dietPlans).where(eq(s.dietPlans.userId, uid)),
        routines: await db.select().from(s.routines).where(eq(s.routines.ownerId, uid)),
        workoutLogs: await db.select().from(s.workoutLogs).where(eq(s.workoutLogs.userId, uid)),
        eventsCreated: await db.select().from(s.events).where(eq(s.events.createdBy, uid)),
        rsvps: await db.select().from(s.eventRsvps).where(eq(s.eventRsvps.userId, uid)),
        testResults: await db.select().from(s.testResults).where(eq(s.testResults.userId, uid)),
        chatMessages: await db.select().from(s.chatMessages).where(eq(s.chatMessages.userId, uid)),
        competitions: await db.select().from(s.competitionParticipants).where(eq(s.competitionParticipants.userId, uid)),
      };
      res.setHeader('Content-Disposition', 'attachment; filename="forja-meus-dados.json"');
      return data;
    },
  });

  // ---- Membros do grupo ----

  r.add({
    method: 'get',
    path: '/members',
    tag: 'Grupo',
    summary: 'Pessoas do grupo',
    handler: async ({ deps }) => {
      const rows = await deps.db.select().from(s.users).orderBy(asc(s.users.name));
      return rows.map((u) => publicUser(deps, u));
    },
  });

  r.add({
    method: 'post',
    path: '/admin/members/:id/reset-password',
    tag: 'Grupo',
    summary: 'Gerar senha temporária para alguém que esqueceu',
    access: 'admin',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      if (params.id === user.id) throw badRequest('Para trocar a sua senha use Perfil → Trocar senha');
      const [target] = await deps.db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, params.id));
      if (!target) throw notFound('Pessoa');
      const temp = temporaryPassword();
      await deps.db.update(s.users).set({ passwordHash: await hash(temp, ARGON) }).where(eq(s.users.id, params.id));
      await deps.db.delete(s.authSessions).where(eq(s.authSessions.userId, params.id));
      await deps.db.insert(s.passwordResets).values({ userId: params.id, createdBy: user.id });
      return { temporaryPassword: temp, message: 'Passe esta senha para a pessoa; ela deve trocá-la em Perfil depois de entrar.' };
    },
  });

  r.add({
    method: 'delete',
    path: '/admin/members/:id',
    tag: 'Grupo',
    summary: 'Remover alguém do grupo (apaga os dados da pessoa)',
    access: 'admin',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      if (params.id === user.id) throw forbidden('Para sair do grupo, exclua sua conta em Perfil');
      await deleteUser(deps, params.id);
      return undefined;
    },
  });

  r.add({
    method: 'post',
    path: '/admin/members/:id/admin',
    tag: 'Grupo',
    summary: 'Tornar (ou deixar de ser) administrador',
    access: 'admin',
    params: z.object({ id: z.uuid() }),
    body: z.object({ isAdmin: z.boolean() }),
    handler: async ({ deps, params, body }) => {
      if (!body.isAdmin) {
        const admins = await deps.db.$count(s.users, and(eq(s.users.isAdmin, true), ne(s.users.id, params.id)));
        if (admins === 0) throw badRequest('O grupo precisa de pelo menos um administrador');
      }
      const rows = await deps.db.update(s.users).set({ isAdmin: body.isAdmin }).where(eq(s.users.id, params.id)).returning({ id: s.users.id });
      if (!rows.length) throw notFound('Pessoa');
      return { ok: true };
    },
  });

}
