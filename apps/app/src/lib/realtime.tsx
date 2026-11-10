import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { session } from './api';
import type { ChatMessage } from './types';

type Listener = (m: ChatMessage) => void;
const listeners = new Set<Listener>();
let online: string[] = [];

/** Assina mensagens novas do chat (usado pela tela de conversa). */
export function onChatMessage(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export const onlineIds = () => online;

/**
 * Conexão em tempo real (WebSocket em /ws). Autentica com a primeira mensagem e
 * reconecta com espera crescente. Mensagens novas atualizam as listas do chat;
 * alterações em treinos atualizam a agenda.
 */
export function RealtimeBridge() {
  const qc = useQueryClient();
  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const token = session.token();
      if (!token || stopped) return;
      const url = session.server().replace(/^http/, 'ws') + '/ws';
      ws = new WebSocket(url);
      ws.onopen = () => ws?.send(JSON.stringify({ type: 'auth', token }));
      ws.onmessage = (ev) => {
        let msg: { type: string; message?: ChatMessage; online?: string[] };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.type === 'ready') retry = 0;
        if (msg.type === 'chat.message' && msg.message) {
          listeners.forEach((l) => l(msg.message!));
          void qc.invalidateQueries({ queryKey: ['chat-rooms'] });
          void qc.invalidateQueries({ queryKey: ['home'] });
        }
        if (msg.type === 'event.updated') {
          void qc.invalidateQueries({ queryKey: ['events'] });
          void qc.invalidateQueries({ queryKey: ['event'] });
          void qc.invalidateQueries({ queryKey: ['home'] });
        }
        if (msg.type === 'presence' && msg.online) {
          online = msg.online;
          void qc.invalidateQueries({ queryKey: ['members'] });
        }
      };
      ws.onclose = () => {
        ws = null;
        if (stopped) return;
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, 1000 * 2 ** retry);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && !ws) {
        if (timer) clearTimeout(timer);
        retry = 0;
        connect();
      }
    });
    return () => {
      stopped = true;
      sub.remove();
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [qc]);
  return null;
}
