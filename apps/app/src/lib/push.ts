/**
 * Notificações do sistema (Web Push) para quem usa o FORJA pelo navegador ou instalou pelo
 * navegador: Android/PC (Chrome, Edge) e iPhone (Safari → Compartilhar → "Adicionar à Tela de
 * Início", iOS 16.4 ou mais novo). No APK, os avisos aparecem dentro do app (sininho).
 */
import { Platform } from 'react-native';
import { del, post } from './api';

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'on' | 'off';

const hasWindow = () => Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';

export function isIos(): boolean {
  return hasWindow() && /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Aberto como app instalado (tela de início), não como aba do navegador. */
export function isStandalone(): boolean {
  if (!hasWindow()) return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupported(): boolean {
  return hasWindow() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

export async function pushState(): Promise<PushState> {
  if (!hasWindow()) return 'unsupported';
  // No iPhone, notificação só funciona com o FORJA adicionado à Tela de Início.
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Pede permissão, inscreve este aparelho e manda a inscrição para o servidor. */
export async function enablePush(publicKey: string): Promise<void> {
  if (!pushSupported()) throw new Error('Este navegador não recebe notificações.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Sem permissão. Libere as notificações do FORJA nas configurações do navegador.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
  await post('/push/subscriptions', sub.toJSON());
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await del('/push/subscriptions', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}
