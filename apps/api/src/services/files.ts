import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import { and, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { files } from '../db/schema';
import type { Deps } from '../deps';
import { badRequest } from '../http/errors';
import { sign, verify } from './crypto';

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const VARIANTS = { full: 1600, thumb: 400 } as const;
export type Variant = keyof typeof VARIANTS;

export function filePath(uploadsDir: string, ownerId: string, fileId: string, variant: Variant): string {
  return path.join(uploadsDir, ownerId, `${fileId}-${variant}.webp`);
}

/**
 * Recebe uma imagem enviada pelo usuário: confere que é imagem de verdade, corrige a
 * rotação, REMOVE metadados (inclusive localização GPS), redimensiona e salva em WebP.
 */
export async function storeImage(deps: Deps, ownerId: string, kind: string, buffer: Buffer): Promise<{ id: string; width: number; height: number }> {
  let meta: Metadata;
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw badRequest('Arquivo não é uma imagem válida');
  }
  if (!meta.format || !['jpeg', 'png', 'webp', 'heif', 'gif', 'avif', 'tiff'].includes(meta.format)) throw badRequest('Formato de imagem não suportado');
  const [row] = await deps.db.insert(files).values({ ownerId, kind, mime: 'image/webp', width: 0, height: 0, sizeBytes: 0 }).returning({ id: files.id });
  const id = row!.id;
  await mkdir(path.join(deps.config.uploadsDir, ownerId), { recursive: true });
  let full: { data: Buffer; info: OutputInfo } | null = null;
  for (const [variant, size] of Object.entries(VARIANTS) as [Variant, number][]) {
    // .rotate() aplica a orientação EXIF; o WebP de saída não leva metadados.
    const out = await sharp(buffer).rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    await writeFile(filePath(deps.config.uploadsDir, ownerId, id, variant), out.data);
    if (variant === 'full') full = out;
  }
  await deps.db.update(files).set({ width: full!.info.width, height: full!.info.height, sizeBytes: full!.data.length }).where(eq(files.id, id));
  return { id, width: full!.info.width, height: full!.info.height };
}

/**
 * URL assinada (o <img> do navegador não envia o token de login). Validade arredondada
 * ao dia para o navegador conseguir manter as fotos em cache.
 */
export function signedUrl(deps: Deps, fileId: string, variant: Variant = 'full'): string {
  const day = 86_400;
  const exp = (Math.floor(deps.now().getTime() / 1000 / day) + 8) * day;
  const sig = sign(deps.config.SECRET, 'file', `${fileId}:${variant}:${exp}`);
  return `/v1/files/${fileId}/${variant}?exp=${exp}&sig=${sig}`;
}

export function checkSignature(deps: Deps, fileId: string, variant: string, exp: number, sig: string): boolean {
  return exp * 1000 > deps.now().getTime() && verify(deps.config.SECRET, 'file', `${fileId}:${variant}:${exp}`, sig);
}

export function fileView(deps: Deps, fileId: string | null | undefined) {
  if (!fileId) return null;
  return { id: fileId, url: signedUrl(deps, fileId, 'full'), thumbUrl: signedUrl(deps, fileId, 'thumb') };
}

/** Garante que os arquivos existem e pertencem ao usuário antes de anexá-los. */
export async function assertOwnFiles(db: DbOrTx, ownerId: string, fileIds: string[]): Promise<void> {
  const ids = [...new Set(fileIds)];
  if (!ids.length) return;
  const rows = await db.select({ id: files.id, ownerId: files.ownerId }).from(files).where(inArray(files.id, ids));
  if (rows.length !== ids.length || rows.some((r) => r.ownerId !== ownerId)) throw badRequest('Imagem inválida ou de outra pessoa');
}

/** Apaga o registro (e, em cascata, os anexos) e as imagens em disco. */
export async function deleteFile(deps: Deps, ownerId: string, fileId: string): Promise<void> {
  const rows = await deps.db.delete(files).where(and(eq(files.id, fileId), eq(files.ownerId, ownerId))).returning({ id: files.id });
  if (!rows.length) return;
  for (const variant of Object.keys(VARIANTS) as Variant[]) await rm(filePath(deps.config.uploadsDir, ownerId, fileId, variant), { force: true });
}

export async function removeUserFiles(uploadsDir: string, ownerId: string): Promise<void> {
  await rm(path.join(uploadsDir, ownerId), { recursive: true, force: true });
}
