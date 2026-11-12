import { File, UploadType } from 'expo-file-system';
import { Platform } from 'react-native';
import { storage } from './storage';

const TOKEN_KEY = 'forja.token';
const SERVER_KEY = 'forja.server';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null;
let serverUrl: string | null = null;
let onUnauthorized: (() => void) | null = null;

/**
 * Endereço do servidor:
 * - no navegador (PC) o app é servido pelo próprio servidor → mesma origem;
 * - no celular, o endereço é digitado na tela de login (ou vem de EXPO_PUBLIC_API_URL).
 */
function defaultServer(): string {
  const env = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { origin, port } = window.location;
    // Desenvolvimento web (Expo na 8081): a API fica na 3333 (ou em EXPO_PUBLIC_API_URL).
    if (port === '8081' || port === '19006') return env ?? origin.replace(/:\d+$/, ':3333');
    // Site servido pelo próprio servidor: sempre o mesmo endereço.
    return origin;
  }
  return env ?? 'http://10.0.2.2:3333';
}

export const session = {
  async load() {
    token = await storage.get(TOKEN_KEY);
    serverUrl = (await storage.get(SERVER_KEY)) ?? null;
    return token;
  },
  async setToken(t: string | null) {
    token = t;
    if (t) await storage.set(TOKEN_KEY, t);
    else await storage.remove(TOKEN_KEY);
  },
  token: () => token,
  server: () => serverUrl ?? defaultServer(),
  async setServer(url: string) {
    serverUrl = url.trim().replace(/\/$/, '');
    await storage.set(SERVER_KEY, serverUrl);
  },
  onUnauthorized(cb: () => void) {
    onUnauthorized = cb;
  },
};

/** Monta URL absoluta para caminhos relativos devolvidos pela API (ex.: imagens assinadas). */
export function absoluteUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith('http') ? path : `${session.server()}${path}`;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; query?: Query; form?: FormData } = {}): Promise<T> {
  const qs = opts.query
    ? Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${session.server()}/v1${path}${qs ? `?${qs}` : ''}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sem conexão com o servidor.');
  }
  if (res.status === 401 && token) onUnauthorized?.();
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: { error?: { code?: string; message?: string } } | undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'HTTP', json?.error?.message ?? `Erro ${res.status}`);
  return json as T;
}

export const get = <T>(path: string, query?: Query) => api<T>(path, { query });
export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

export interface UploadedFile {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

/**
 * Envia uma imagem escolhida. No navegador usa o arquivo (File) que o seletor devolve
 * (ou lê a uri como Blob). No celular, o envio é nativo (expo-file-system): o `fetch` do
 * Expo 58 não aceita mais o formato antigo {uri,name,type} no FormData — era por isso que
 * as fotos não subiam pelo APK.
 */
export async function uploadImage(uri: string, kind: string, mimeType = 'image/jpeg', file?: Blob | null): Promise<UploadedFile> {
  if (Platform.OS === 'web') {
    const form = new FormData();
    form.append('kind', kind);
    const blob = file ?? (await (await fetch(uri)).blob());
    form.append('file', blob, 'foto');
    return api<UploadedFile>('/files', { method: 'POST', form });
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: { status: number; body: string };
  try {
    res = await new File(uri).upload(`${session.server()}/v1/files`, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType,
      parameters: { kind },
      headers,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Não consegui enviar a foto. Confira a conexão e tente de novo.');
  }
  let json: (UploadedFile & { error?: { code?: string; message?: string } }) | undefined;
  try {
    json = res.body ? JSON.parse(res.body) : undefined;
  } catch {
    json = undefined;
  }
  if (res.status === 401) onUnauthorized?.();
  if (res.status < 200 || res.status >= 300 || !json) throw new ApiError(res.status, json?.error?.code ?? 'HTTP', json?.error?.message ?? `Erro ${res.status} ao enviar a foto`);
  return json;
}
