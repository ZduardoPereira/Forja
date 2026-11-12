/**
 * Web Push: notificação no celular/PC mesmo com o app fechado, para quem usa o FORJA pelo
 * navegador ou instalou pelo navegador (Android/PC: Chrome/Edge; iPhone: Safari → "Adicionar
 * à Tela de Início", iOS 16.4+). Sem conta em serviço nenhum: as chaves VAPID são geradas na
 * primeira vez e ficam no banco.
 */
import { createHash } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { generateVAPIDKeys, sendNotification } from 'web-push';
import type { Db } from '../db/client';
import { pushSubscriptions } from '../db/schema';
import { initMeta } from './meta';

export interface PushPayload {
  title: string;
  body: string;
  /** Caminho do app para abrir ao tocar. */
  url?: string;
  /** Notificações com a mesma tag se substituem no aparelho (ex.: uma por conversa). */
  tag?: string;
}

export interface Push {
  publicKey(): Promise<string>;
  send(userIds: string[], payload: PushPayload): Promise<void>;
}

/** Testes e scripts: guarda o que seria enviado. */
export function memoryPush(): Push & { sent: { userIds: string[]; payload: PushPayload }[] } {
  const sent: { userIds: string[]; payload: PushPayload }[] = [];
  return { sent, publicKey: async () => 'BTestePublicKey', send: async (userIds, payload) => void sent.push({ userIds, payload }) };
}

export function createWebPush(db: Db, logger: Logger, publicUrl: string): Push {
  let keys: Promise<{ publicKey: string; privateKey: string }> | null = null;
  const vapid = () =>
    (keys ??= (async () => {
      const fresh = generateVAPIDKeys();
      return JSON.parse(await initMeta(db, 'vapid', JSON.stringify(fresh))) as { publicKey: string; privateKey: string };
    })());
  // O "assunto" do VAPID precisa ser https: ou mailto: (a Apple recusa outros).
  const subject = /^https:\/\//.test(publicUrl) ? publicUrl : 'mailto:forja@example.com';
  const topicOf = (tag?: string) => (tag ? createHash('sha256').update(tag).digest('base64url').slice(0, 32) : undefined);

  return {
    publicKey: async () => (await vapid()).publicKey,
    async send(userIds, payload) {
      if (!userIds.length) return;
      const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
      if (!subs.length) return;
      const { publicKey, privateKey } = await vapid();
      const body = JSON.stringify(payload);
      await Promise.all(
        subs.map(async (sub) => {
          try {
            await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
              TTL: 12 * 3600,
              urgency: 'normal',
              topic: topicOf(payload.tag),
              timeout: 15_000,
              vapidDetails: { subject, publicKey, privateKey },
            });
            await db.update(pushSubscriptions).set({ lastSuccessAt: new Date(), failures: 0 }).where(eq(pushSubscriptions.id, sub.id));
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            // 404/410: a inscrição não existe mais (app desinstalado, permissão retirada).
            if (status === 404 || status === 410) {
              await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
              return;
            }
            logger.warn({ status, err: (err as Error).message }, 'Web Push falhou');
            await db
              .update(pushSubscriptions)
              .set({ failures: sql`${pushSubscriptions.failures} + 1` })
              .where(eq(pushSubscriptions.id, sub.id));
            await db.delete(pushSubscriptions).where(sql`${pushSubscriptions.id} = ${sub.id} and ${pushSubscriptions.failures} >= 8`);
          }
        }),
      );
    },
  };
}
