import { and, desc, eq, isNotNull, lte } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { assessments, users, weighIns } from '../db/schema';
import type { Deps } from '../deps';
import { fileView } from './files';

/** Chave de login: minúsculas, sem acentos e espaços repetidos ("João  Silva" = "joao silva"). */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type UserRow = typeof users.$inferSelect;

export function publicUser(deps: Deps, u: Pick<UserRow, 'id' | 'name' | 'avatarFileId' | 'goal' | 'isAdmin' | 'lastSeenAt'>) {
  return {
    id: u.id,
    name: u.name,
    avatar: fileView(deps, u.avatarFileId),
    goal: u.goal,
    isAdmin: u.isAdmin,
    lastSeenAt: u.lastSeenAt,
    online: deps.realtime.online().includes(u.id),
  };
}

export function ownProfile(deps: Deps, u: UserRow) {
  const { passwordHash: _p, nameKey: _k, ...rest } = u;
  return { ...rest, avatar: fileView(deps, u.avatarFileId) };
}

/** Peso mais recente até a data (pesagens e avaliações). */
export async function latestBodyweight(db: DbOrTx, userId: string, onOrBefore?: string): Promise<{ date: string; weightKg: number } | null> {
  const w = await db
    .select({ date: weighIns.date, weightKg: weighIns.weightKg })
    .from(weighIns)
    .where(and(eq(weighIns.userId, userId), onOrBefore ? lte(weighIns.date, onOrBefore) : undefined))
    .orderBy(desc(weighIns.date), desc(weighIns.createdAt))
    .limit(1);
  const a = await db
    .select({ date: assessments.date, weightKg: assessments.weightKg })
    .from(assessments)
    .where(and(eq(assessments.userId, userId), isNotNull(assessments.weightKg), onOrBefore ? lte(assessments.date, onOrBefore) : undefined))
    .orderBy(desc(assessments.date), desc(assessments.createdAt))
    .limit(1);
  const candidates = [...w, ...a.map((x) => ({ date: x.date, weightKg: x.weightKg! }))];
  return candidates.sort((x, y) => y.date.localeCompare(x.date))[0] ?? null;
}
