import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Deps } from '../deps';

const message = { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde um pouco e tente de novo.' } };

export function createLimiters(deps: Deps) {
  const scale = deps.config.NODE_ENV === 'test' ? 100 : 1;
  const byUser = (req: Request) => (req as Request & { user?: { id: string } }).user?.id ?? ipKeyGenerator(req.ip ?? '');
  const base = { standardHeaders: 'draft-8' as const, legacyHeaders: false, message };
  return {
    /** Login e cadastro: 10 tentativas a cada 15 min por IP (protege senhas curtas). */
    auth: rateLimit({ ...base, windowMs: 15 * 60_000, limit: 10 * scale }),
    /** Envio de arquivos: 60 por hora por pessoa. */
    upload: rateLimit({ ...base, windowMs: 60 * 60_000, limit: 60 * scale, keyGenerator: byUser }),
    /** Chat: 30 mensagens por minuto por pessoa. */
    chat: rateLimit({ ...base, windowMs: 60_000, limit: 30 * scale, keyGenerator: byUser }),
    global: rateLimit({ ...base, windowMs: 60_000, limit: 600 * scale }),
  };
}
export type Limiters = ReturnType<typeof createLimiters>;
