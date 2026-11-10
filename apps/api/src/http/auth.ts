import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { authSessions, users } from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, unauthorized } from './errors';

export interface AuthUser {
  id: string;
  name: string;
  isAdmin: boolean;
}

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

/** Cria uma sessão de login (token opaco; só o hash fica no banco). */
export async function createSession(deps: Deps, userId: string, userAgent?: string): Promise<string> {
  const token = newToken();
  await deps.db.insert(authSessions).values({
    userId,
    tokenHash: sha256(token),
    userAgent: userAgent?.slice(0, 200) ?? null,
    expiresAt: new Date(deps.now().getTime() + deps.config.SESSION_DAYS * 86_400_000),
  });
  return token;
}

/** Resolve um token (cabeçalho Authorization ou handshake do WebSocket) para o usuário. */
export async function userFromToken(deps: Deps, token: string): Promise<AuthUser | null> {
  const now = deps.now();
  const [row] = await deps.db
    .select({ sessionId: authSessions.id, lastUsedAt: authSessions.lastUsedAt, id: users.id, name: users.name, isAdmin: users.isAdmin })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, sha256(token)), gt(authSessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  // Atualiza "visto por último" no máximo a cada 5 minutos.
  if (now.getTime() - row.lastUsedAt.getTime() > 5 * 60_000) {
    await deps.db.update(authSessions).set({ lastUsedAt: now }).where(eq(authSessions.id, row.sessionId));
    await deps.db.update(users).set({ lastSeenAt: now }).where(eq(users.id, row.id));
  }
  return { id: row.id, name: row.name, isAdmin: row.isAdmin };
}

export function bearer(req: Request): string | null {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

export function requireAuth(deps: Deps, opts: { admin?: boolean } = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = bearer(req);
      const user = token ? await userFromToken(deps, token) : null;
      if (!user) throw unauthorized();
      if (opts.admin && !user.isAdmin) throw forbidden('Só o administrador do grupo pode fazer isso');
      (req as Request & { user: AuthUser }).user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}
