import type { IncomingMessage, Server } from 'node:http';
import type { Logger } from 'pino';
import { type WebSocket, WebSocketServer } from 'ws';
import type { AuthUser } from '../http/auth';

export type RealtimeEvent =
  | { type: 'chat.message'; roomId: string; message: unknown }
  | { type: 'chat.deleted'; roomId: string; messageId: string }
  | { type: 'event.updated'; eventId: string }
  | { type: 'presence'; online: string[] }
  | { type: 'notification'; notification: unknown }
  | { type: 'activity.updated'; userId: string };

export interface Realtime {
  broadcast(event: RealtimeEvent): void;
  /** Entrega só para as conexões de uma pessoa (notificações). */
  sendTo(userId: string, event: RealtimeEvent): void;
  online(): string[];
}

/** Sem servidor WebSocket (testes e scripts): só descarta os eventos. */
export const noopRealtime: Realtime = { broadcast: () => undefined, sendTo: () => undefined, online: () => [] };

/**
 * Canal em tempo real em /ws. O cliente conecta e envia { type: 'auth', token } como
 * primeira mensagem (o navegador não permite cabeçalho Authorization em WebSocket e
 * token em query string acabaria em logs). Sem autenticação em 5 s, a conexão cai.
 */
export function attachRealtime(server: Server, logger: Logger, authenticate: (token: string) => Promise<AuthUser | null>): Realtime & { close(): void } {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  const clients = new Map<WebSocket, AuthUser>();
  const sendPresence = () => {
    const payload = JSON.stringify({ type: 'presence', online: [...new Set([...clients.values()].map((u) => u.id))] });
    for (const ws of clients.keys()) if (ws.readyState === ws.OPEN) ws.send(payload);
  };

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const timer = setTimeout(() => ws.close(4001, 'auth timeout'), 5000);
    ws.once('message', async (raw) => {
      clearTimeout(timer);
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; token?: string };
        const user = msg.type === 'auth' && typeof msg.token === 'string' ? await authenticate(msg.token) : null;
        if (!user) return ws.close(4003, 'unauthorized');
        clients.set(ws, user);
        ws.send(JSON.stringify({ type: 'ready' }));
        sendPresence();
      } catch {
        ws.close(4000, 'bad message');
      }
    });
    ws.on('close', () => {
      clearTimeout(timer);
      if (clients.delete(ws)) sendPresence();
    });
    ws.on('error', (err) => logger.debug({ err: err.message }, 'ws error'));
  });

  // Mantém conexões vivas atrás de proxies.
  const ping = setInterval(() => {
    for (const ws of clients.keys()) if (ws.readyState === ws.OPEN) ws.ping();
  }, 30_000);

  return {
    broadcast(event) {
      const payload = JSON.stringify(event);
      for (const ws of clients.keys()) if (ws.readyState === ws.OPEN) ws.send(payload);
    },
    sendTo(userId, event) {
      const payload = JSON.stringify(event);
      for (const [ws, u] of clients) if (u.id === userId && ws.readyState === ws.OPEN) ws.send(payload);
    },
    online: () => [...new Set([...clients.values()].map((u) => u.id))],
    close() {
      clearInterval(ping);
      wss.close();
    },
  };
}
