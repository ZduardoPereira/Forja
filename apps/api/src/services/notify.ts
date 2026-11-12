/**
 * Uma notificação nasce aqui: fica na lista de notificações (sininho), chega na hora para
 * quem está com o app aberto (WebSocket) e, se a pessoa deixou aquela categoria ligada, vai
 * para o celular/PC (Web Push). Falha no push nunca derruba a ação que gerou o aviso.
 */
import { mergePrefs, type NotificationCategory } from '@forja/shared';
import { inArray } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { fileView } from './files';

export interface NotifyInput {
  /** Quem recebe: ids ou 'all' (todo o grupo). */
  to: string[] | 'all';
  /** Normalmente quem fez a ação (não recebe o próprio aviso). */
  except?: string | string[] | null;
  category: NotificationCategory;
  kind: string;
  title: string;
  body: string;
  url?: string | null;
  actorId?: string | null;
  /** Também no celular/PC (respeita as preferências). Padrão: sim. */
  push?: boolean;
  /** Guarda na lista de notificações. Padrão: sim (o chat não guarda: ele tem o próprio "não lidas"). */
  store?: boolean;
  /** Avisos com a mesma tag se substituem no aparelho. */
  tag?: string;
}

type NotificationRow = typeof s.notifications.$inferSelect;
type Actor = { id: string; name: string; avatarFileId: string | null } | null | undefined;

export function notificationView(deps: Deps, n: NotificationRow, actor?: Actor) {
  return {
    id: n.id,
    category: n.category,
    kind: n.kind,
    title: n.title,
    body: n.body,
    url: n.url,
    createdAt: n.createdAt,
    readAt: n.readAt,
    actor: actor ? { id: actor.id, name: actor.name, avatar: fileView(deps, actor.avatarFileId) } : null,
  };
}

export async function notify(deps: Deps, n: NotifyInput): Promise<NotificationRow[]> {
  if (Array.isArray(n.to) && !n.to.length) return [];
  const users = await deps.db
    .select({ id: s.users.id, prefs: s.users.notifyPrefs })
    .from(s.users)
    .where(n.to === 'all' ? undefined : inArray(s.users.id, n.to));
  const skip = new Set([n.except ?? []].flat());
  const recipients = users.filter((u) => !skip.has(u.id));
  if (!recipients.length) return [];

  let rows: NotificationRow[] = [];
  if (n.store !== false) {
    rows = await deps.db
      .insert(s.notifications)
      .values(recipients.map((u) => ({ userId: u.id, category: n.category, kind: n.kind, title: n.title, body: n.body, url: n.url ?? null, actorId: n.actorId ?? null })))
      .returning();
    let actor: Actor = null;
    if (n.actorId) {
      const [a] = await deps.db.select({ id: s.users.id, name: s.users.name, avatarFileId: s.users.avatarFileId }).from(s.users).where(inArray(s.users.id, [n.actorId]));
      actor = a;
    }
    for (const row of rows) deps.realtime.sendTo(row.userId, { type: 'notification', notification: notificationView(deps, row, actor) });
  }

  if (n.push !== false) {
    const pushTo = recipients.filter((u) => mergePrefs(u.prefs)[n.category]).map((u) => u.id);
    if (pushTo.length) {
      void deps.push
        .send(pushTo, { title: n.title, body: n.body, url: n.url ?? '/notificacoes', tag: n.tag ?? n.kind })
        .catch((err: Error) => deps.logger.warn({ err: err.message }, 'falha ao enviar notificação'));
    }
  }
  return rows;
}

/** "qua, 12/11 às 19:00" no fuso do grupo. */
export function whenLabel(d: Date, timeZone: string): string {
  const day = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone }).replace('.', '');
  const hour = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone });
  return `${day} às ${hour}`;
}
