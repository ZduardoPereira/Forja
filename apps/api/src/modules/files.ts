import { existsSync } from 'node:fs';
import { fileKindSchema } from '@forja/shared';
import { eq } from 'drizzle-orm';
import multer from 'multer';
import { z } from 'zod';
import { files } from '../db/schema';
import { badRequest, notFound } from '../http/errors';
import type { Limiters } from '../http/rate-limit';
import type { RouteRegistry } from '../http/registry';
import { checkSignature, filePath, fileView, MAX_UPLOAD_BYTES, storeImage } from '../services/files';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4 } });

export function fileRoutes(r: RouteRegistry, limiters: Limiters) {
  r.add({
    method: 'post',
    path: '/files',
    tag: 'Arquivos',
    summary: 'Enviar imagem (multipart: campo "file" + "kind"). Metadados como GPS são removidos.',
    status: 201,
    middleware: [limiters.upload, upload.single('file')],
    handler: async ({ deps, user, req }) => {
      const file = (req as typeof req & { file?: Express.Multer.File }).file;
      if (!file) throw badRequest('Envie a imagem no campo "file"');
      const kind = fileKindSchema.safeParse((req.body as Record<string, unknown>)?.kind);
      if (!kind.success) throw badRequest('Tipo de arquivo inválido');
      const stored = await storeImage(deps, user.id, kind.data, file.buffer);
      return { ...fileView(deps, stored.id)!, width: stored.width, height: stored.height };
    },
  });

  r.add({
    method: 'get',
    path: '/files/:id/:variant',
    tag: 'Arquivos',
    summary: 'Imagem por URL assinada (gerada pela API para quem pode vê-la)',
    access: 'public',
    params: z.object({ id: z.uuid(), variant: z.enum(['full', 'thumb']) }),
    query: z.object({ exp: z.coerce.number().int(), sig: z.string().max(64) }),
    handler: async ({ deps, params, query, res }) => {
      if (!checkSignature(deps, params.id, params.variant, query.exp, query.sig)) throw notFound('Imagem');
      const [f] = await deps.db.select({ ownerId: files.ownerId }).from(files).where(eq(files.id, params.id));
      const p = f && filePath(deps.config.uploadsDir, f.ownerId, params.id, params.variant);
      if (!p || !existsSync(p)) throw notFound('Imagem');
      res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
      res.setHeader('Content-Type', 'image/webp');
      await new Promise<void>((resolve, reject) => res.sendFile(p, (err) => (err ? reject(err) : resolve())));
      return undefined;
    },
  });
}
