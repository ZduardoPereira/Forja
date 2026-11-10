import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Fonte: src/config.ts → apps/api ; bundle: dist/*.js → apps/api.
const defaultRoot = path.basename(apiRoot) === 'dist' || path.basename(apiRoot) === 'src' ? path.resolve(apiRoot, '..') : apiRoot;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  HOST: z.string().default('0.0.0.0'),
  /** Endereço público do servidor (como o navegador/celular o acessa). Usado no retorno do Strava. */
  PUBLIC_URL: z.string().url().optional(),
  /** postgres://… ; vazio = PGlite (PostgreSQL embutido) em DATA_DIR/db. */
  DATABASE_URL: z.string().optional(),
  DATA_DIR: z.string().default(path.join(defaultRoot, '.data')),
  /** Pasta do app web compilado (expo export). Se existir, é servida na raiz do site. */
  WEB_DIST: z.string().default(path.resolve(defaultRoot, '..', 'app', 'dist')),
  SECRET: z.string().min(32, 'SECRET deve ter pelo menos 32 caracteres'),
  /** Código do grupo, exigido para criar conta. Obrigatório em produção. */
  INVITE_CODE: z.string().optional(),
  SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
  TRUST_PROXY: bool.default(false),
  LOG_LEVEL: z.string().default('info'),
  /** Fuso usado nas mensagens automáticas do chat ("marquei treino para sex 18:00"). */
  TIMEZONE: z.string().default('America/Sao_Paulo'),
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema> & {
  publicUrl: string;
  uploadsDir: string;
  pgliteDir: string;
  strava: { clientId: string; clientSecret: string } | null;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  if (!parsed.success) {
    throw new Error(`Configuração inválida: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production' && !c.INVITE_CODE) {
    throw new Error('Defina INVITE_CODE em produção: sem ele, qualquer pessoa com o endereço poderia criar conta.');
  }
  return {
    ...c,
    publicUrl: (c.PUBLIC_URL ?? `http://localhost:${c.PORT}`).replace(/\/$/, ''),
    uploadsDir: path.join(c.DATA_DIR, 'uploads'),
    pgliteDir: path.join(c.DATA_DIR, 'db'),
    strava: c.STRAVA_CLIENT_ID && c.STRAVA_CLIENT_SECRET ? { clientId: c.STRAVA_CLIENT_ID, clientSecret: c.STRAVA_CLIENT_SECRET } : null,
  };
}
