import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';

/** Formato único de erro: { error: { code, message, details? } } */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Entre na sua conta para continuar') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Você não tem permissão para isso') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Recurso') => new AppError(404, 'NOT_FOUND', `${what} não encontrado`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: details[0]?.message ?? 'Dados inválidos', details } });
      return;
    }
    const e = err as { type?: string; code?: string };
    if (e?.type === 'entity.too.large' || e?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Arquivo ou requisição grande demais' } });
      return;
    }
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido' } });
      return;
    }
    logger.error({ err, path: req.path, method: req.method }, 'Erro não tratado');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Erro interno. Tente novamente.' } });
  };
}
