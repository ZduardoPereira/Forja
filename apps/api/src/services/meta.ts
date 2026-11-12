import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { meta } from '../db/schema';

/** Pequenos valores do servidor (chaves do Web Push, líder de cada ranking, tarefas diárias já feitas). */
export async function getMeta(db: DbOrTx, key: string): Promise<string | null> {
  const [row] = await db.select({ value: meta.value }).from(meta).where(eq(meta.key, key));
  return row?.value ?? null;
}

export async function setMeta(db: DbOrTx, key: string, value: string): Promise<void> {
  await db.insert(meta).values({ key, value }).onConflictDoUpdate({ target: meta.key, set: { value } });
}

/** Grava só se a chave ainda não existe; devolve o valor que ficou valendo. */
export async function initMeta(db: DbOrTx, key: string, value: string): Promise<string> {
  await db.insert(meta).values({ key, value }).onConflictDoNothing();
  return (await getMeta(db, key)) ?? value;
}
