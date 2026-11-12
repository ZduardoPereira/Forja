import { chatMessageSchema } from '@forja/shared';
import { and, desc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound } from '../http/errors';
import type { Limiters } from '../http/rate-limit';
import type { RouteRegistry } from '../http/registry';
import { assertOwnFiles, fileView } from '../services/files';
import { notify } from '../services/notify';

type MessageRow = typeof s.chatMessages.$inferSelect;

function messageView(deps: Deps, m: MessageRow, author?: { name: string; avatarFileId: string | null }) {
  return {
    id: m.id,
    roomId: m.roomId,
    userId: m.userId,
    author: author ? { name: author.name, avatar: fileView(deps, author.avatarFileId) } : null,
    text: m.text,
    image: fileView(deps, m.fileId),
    createdAt: m.createdAt,
  };
}

/** Grava a mensagem e entrega em tempo real a quem estiver conectado. */
export async function postMessage(deps: Deps, userId: string, roomId: string, text: string, fileId: string | null) {
  const [m] = await deps.db.insert(s.chatMessages).values({ roomId, userId, text, fileId }).returning();
  const [author] = await deps.db.select({ name: s.users.name, avatarFileId: s.users.avatarFileId }).from(s.users).where(eq(s.users.id, userId));
  const view = messageView(deps, m!, author);
  deps.realtime.broadcast({ type: 'chat.message', roomId, message: view });
  await deps.db
    .insert(s.chatReads)
    .values({ roomId, userId, lastReadAt: m!.createdAt })
    .onConflictDoUpdate({ target: [s.chatReads.roomId, s.chatReads.userId], set: { lastReadAt: m!.createdAt } });
  return view;
}

async function getRoom(deps: Deps, roomId: string) {
  const [room] = await deps.db.select().from(s.chatRooms).where(eq(s.chatRooms.id, roomId));
  if (!room) throw notFound('Conversa');
  return room;
}

export function chatRoutes(r: RouteRegistry, limiters: Limiters) {
  r.add({
    method: 'get',
    path: '/chat/rooms',
    tag: 'Chat',
    summary: 'Conversas (grupo + uma por treino marcado) com não lidas',
    handler: async ({ deps, user }) => {
      const rooms = await deps.db
        .select({ room: s.chatRooms, startsAt: s.events.startsAt, cancelledAt: s.events.cancelledAt })
        .from(s.chatRooms)
        .leftJoin(s.events, eq(s.events.id, s.chatRooms.eventId));
      const ids = rooms.map((r) => r.room.id);
      if (!ids.length) return [];
      const reads = await deps.db.select().from(s.chatReads).where(and(eq(s.chatReads.userId, user.id), inArray(s.chatReads.roomId, ids)));
      const lasts = await deps.db
        .selectDistinctOn([s.chatMessages.roomId], { message: s.chatMessages, name: s.users.name, avatarFileId: s.users.avatarFileId })
        .from(s.chatMessages)
        .innerJoin(s.users, eq(s.users.id, s.chatMessages.userId))
        .where(inArray(s.chatMessages.roomId, ids))
        .orderBy(s.chatMessages.roomId, desc(s.chatMessages.createdAt));
      const unread = await Promise.all(
        rooms.map(async ({ room }) => {
          const since = reads.find((x) => x.roomId === room.id)?.lastReadAt;
          return deps.db.$count(s.chatMessages, and(eq(s.chatMessages.roomId, room.id), ne(s.chatMessages.userId, user.id), since ? gt(s.chatMessages.createdAt, since) : undefined));
        }),
      );
      return rooms
        .map(({ room, startsAt, cancelledAt }, i) => {
          const last = lasts.find((l) => l.message.roomId === room.id);
          return {
            id: room.id,
            kind: room.kind,
            title: room.title,
            eventId: room.eventId,
            eventStartsAt: startsAt,
            eventCancelled: !!cancelledAt,
            unread: unread[i]!,
            lastMessage: last ? messageView(deps, last.message, { name: last.name, avatarFileId: last.avatarFileId }) : null,
          };
        })
        .sort((a, b) => (a.kind === 'group' ? -1 : b.kind === 'group' ? 1 : (b.lastMessage?.createdAt.getTime() ?? 0) - (a.lastMessage?.createdAt.getTime() ?? 0)));
    },
  });

  r.add({
    method: 'get',
    path: '/chat/rooms/:id/messages',
    tag: 'Chat',
    summary: 'Mensagens (mais recentes primeiro; use "before" para paginar)',
    params: z.object({ id: z.uuid() }),
    query: z.object({ before: z.iso.datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }),
    handler: async ({ deps, params, query }) => {
      await getRoom(deps, params.id);
      const rows = await deps.db
        .select({ message: s.chatMessages, name: s.users.name, avatarFileId: s.users.avatarFileId })
        .from(s.chatMessages)
        .innerJoin(s.users, eq(s.users.id, s.chatMessages.userId))
        .where(and(eq(s.chatMessages.roomId, params.id), query.before ? lt(s.chatMessages.createdAt, new Date(query.before)) : undefined))
        .orderBy(desc(s.chatMessages.createdAt))
        .limit(query.limit);
      return rows.map((r) => messageView(deps, r.message, { name: r.name, avatarFileId: r.avatarFileId }));
    },
  });

  r.add({
    method: 'post',
    path: '/chat/rooms/:id/messages',
    tag: 'Chat',
    summary: 'Enviar mensagem (texto e/ou foto)',
    status: 201,
    params: z.object({ id: z.uuid() }),
    body: chatMessageSchema,
    middleware: [limiters.chat],
    handler: async ({ deps, user, params, body }) => {
      const room = await getRoom(deps, params.id);
      if (body.fileId) await assertOwnFiles(deps.db, user.id, [body.fileId]);
      const view = await postMessage(deps, user.id, params.id, body.text, body.fileId ?? null);
      // Celular/PC de quem não está com a conversa aberta. Não entra no sininho (o chat tem o próprio "não lidas").
      const preview = body.text ? (body.text.length > 120 ? `${body.text.slice(0, 117)}…` : body.text) : '📷 Foto';
      await notify(deps, {
        to: 'all',
        except: user.id,
        category: 'chat',
        kind: 'chat.message',
        title: room.kind === 'group' ? `💬 ${user.name} no grupo` : `💬 ${user.name} · ${room.title}`,
        body: preview,
        url: `/chat/${room.id}`,
        store: false,
        tag: `chat:${room.id}`,
      });
      return view;
    },
  });

  r.add({
    method: 'delete',
    path: '/chat/messages/:id',
    tag: 'Chat',
    summary: 'Apagar mensagem (a própria; o administrador apaga qualquer uma)',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const [m] = await deps.db.select().from(s.chatMessages).where(eq(s.chatMessages.id, params.id));
      if (!m) throw notFound('Mensagem');
      if (m.userId !== user.id && !user.isAdmin) throw forbidden('Só dá para apagar as suas mensagens');
      await deps.db.delete(s.chatMessages).where(eq(s.chatMessages.id, params.id));
      deps.realtime.broadcast({ type: 'chat.deleted', roomId: m.roomId, messageId: m.id });
      return undefined;
    },
  });

  r.add({
    method: 'post',
    path: '/chat/rooms/:id/read',
    tag: 'Chat',
    summary: 'Marcar conversa como lida',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      await getRoom(deps, params.id);
      const now = deps.now();
      await deps.db
        .insert(s.chatReads)
        .values({ roomId: params.id, userId: user.id, lastReadAt: now })
        .onConflictDoUpdate({ target: [s.chatReads.roomId, s.chatReads.userId], set: { lastReadAt: sql`greatest(${s.chatReads.lastReadAt}, ${now.toISOString()}::timestamptz)` } });
      return undefined;
    },
  });
}
