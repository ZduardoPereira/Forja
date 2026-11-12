/** Notificações e rankings: vocabulário compartilhado entre app e servidor. */
import { z } from 'zod';

/** Cada notificação pertence a uma categoria; a pessoa escolhe quais chegam no celular/PC. */
export const NOTIFICATION_CATEGORIES = ['events', 'chat', 'ranking', 'streak', 'group'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, { title: string; hint: string }> = {
  events: { title: 'Treinos marcados', hint: 'Treino novo, mudança de horário, cancelamento e lembrete 1 hora antes.' },
  chat: { title: 'Mensagens do chat', hint: 'Mensagens novas no grupo e nas conversas dos treinos.' },
  ranking: { title: '1º lugar nos rankings', hint: 'Quando você assume ou perde o 1º lugar (e quem é o novo líder).' },
  streak: { title: 'Sua sequência', hint: 'Lembrete às 20h se você ainda não marcou atividade, e aviso se a sequência zerar.' },
  group: { title: 'Novidades do grupo', hint: 'Gente nova no grupo, marcos de sequência dos amigos e avisos do administrador.' },
};

export type NotifyPrefs = Record<NotificationCategory, boolean>;
export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { events: true, chat: true, ranking: true, streak: true, group: true };

export const notifyPrefsSchema = z.object(Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, z.boolean().optional()])) as Record<NotificationCategory, z.ZodOptional<z.ZodBoolean>>);

export function mergePrefs(saved: unknown): NotifyPrefs {
  const parsed = notifyPrefsSchema.safeParse(saved ?? {});
  return { ...DEFAULT_NOTIFY_PREFS, ...(parsed.success ? Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => typeof v === 'boolean')) : {}) };
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Os três rankings permanentes do grupo. */
export const RANKING_BOARDS = ['streak', 'physical', 'evolution'] as const;
export type RankingBoard = (typeof RANKING_BOARDS)[number];

export const RANKING_LABELS: Record<RankingBoard, { title: string; short: string; how: string }> = {
  streak: {
    title: 'Sequência',
    short: 'dias seguidos',
    how: 'Dias seguidos com pelo menos uma atividade: treino do assistente, treino registrado ou presença em treino marcado. Ficou um dia inteiro sem nada, zera.',
  },
  physical: {
    title: 'Atributos físicos',
    short: 'pontos',
    how: 'Soma das notas de 0 a 20 dos 11 testes físicos (máximo 220). Quem faz mais testes e vai melhor em cada um sobe. Força conta em relação ao peso corporal.',
  },
  evolution: {
    title: 'Evolução no objetivo',
    short: 'pontos',
    how: 'Seu progresso nos últimos 90 dias comparado com o ritmo saudável do SEU objetivo: emagrecer, ganhar massa ou recomposição pelo corpo; performance pelos testes. 100 = no ritmo ideal (ou um pouco acima): por isso dá empate no topo, e passar muito do ritmo saudável não vale ponto a mais. Precisa de pelo menos 1 semana entre a primeira e a última medida.',
  },
};
