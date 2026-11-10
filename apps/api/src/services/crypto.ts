import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** Chaves derivadas do SECRET (HKDF) — uma por finalidade. */
function key(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'forja', purpose, 32));
}

/** Assinatura HMAC curta (URL-safe). */
export function sign(secret: string, purpose: string, payload: string): string {
  return createHmac('sha256', key(secret, purpose)).update(payload).digest('base64url').slice(0, 32);
}

export function verify(secret: string, purpose: string, payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(secret, purpose, payload));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** AES-256-GCM: "iv.tag.dados" em base64url. Usado para guardar tokens do Strava. */
export function encrypt(secret: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret, 'token-encryption'), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(secret: string, enc: string): string {
  const [iv, tag, data] = enc.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(secret, 'token-encryption'), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString('utf8');
}

/** Estado assinado e com validade (ex.: OAuth do Strava). */
export function signState(secret: string, data: Record<string, unknown>, ttlSec: number, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(now / 1000) + ttlSec })).toString('base64url');
  return `${payload}.${sign(secret, 'oauth-state', payload)}`;
}

export function readState<T>(secret: string, state: string, now = Date.now()): T | null {
  const [payload, sig] = state.split('.');
  if (!payload || !sig || !verify(secret, 'oauth-state', payload, sig)) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as T & { exp: number };
  return data.exp * 1000 >= now ? data : null;
}
