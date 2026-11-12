/**
 * Os três rankings permanentes (sequência, atributos físicos, evolução no objetivo) e os
 * avisos de 1º lugar. A troca de líder é conferida um instante depois de cada mudança
 * relevante (atividade, teste, pesagem…) e na virada do dia.
 */
import {
  computeStreak,
  type Experience,
  type Goal,
  GOAL_LABELS,
  radarProfile,
  RANKING_BOARDS,
  RANKING_LABELS,
  type RankingBoard,
  scoreEvolution,
  type TestId,
} from '@forja/shared';
import { asc } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { activityByUser, todayIn } from './activity';
import { getMeta, setMeta } from './meta';
import { notify } from './notify';
import { publicUser } from './people';

type Member = ReturnType<typeof publicUser>;

export interface RankingEntry {
  rank: number;
  user: Member;
  /** Valor que ordena o ranking. */
  value: number;
  /** Entra na disputa (tem dado suficiente e valor > 0). */
  qualifies: boolean;
  detail: string;
  extra: Record<string, unknown>;
}

function ranked(entries: Omit<RankingEntry, 'rank'>[], tiebreak: (a: Omit<RankingEntry, 'rank'>, b: Omit<RankingEntry, 'rank'>) => number): RankingEntry[] {
  const sorted = [...entries].sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || b.value - a.value || tiebreak(a, b) || a.user.name.localeCompare(b.user.name));
  const out: RankingEntry[] = [];
  sorted.forEach((e, i) => {
    const prev = out[i - 1];
    out.push({ ...e, rank: prev && prev.qualifies === e.qualifies && prev.value === e.value ? prev.rank : i + 1 });
  });
  return out;
}

export async function computeRankings(deps: Deps, viewerId?: string) {
  const today = todayIn(deps);
  const users = await deps.db.select().from(s.users).orderBy(asc(s.users.name));
  const [activity, results, weighIns, assessments] = await Promise.all([
    activityByUser(deps),
    deps.db.select().from(s.testResults),
    deps.db.select().from(s.weighIns),
    deps.db.select().from(s.assessments),
  ]);

  // Peso mais recente de cada um (referência da força relativa nos testes sem peso do dia).
  const lastWeight = new Map<string, { date: string; w: number }>();
  for (const p of [...weighIns.map((w) => ({ userId: w.userId, date: w.date, w: w.weightKg })), ...assessments.filter((a) => a.weightKg != null).map((a) => ({ userId: a.userId, date: a.date, w: a.weightKg! }))]) {
    const cur = lastWeight.get(p.userId);
    if (!cur || p.date >= cur.date) lastWeight.set(p.userId, { date: p.date, w: p.w });
  }

  const streak = ranked(
    users.map((u) => {
      const st = computeStreak(activity.get(u.id)?.keys() ?? [], today);
      return {
        user: publicUser(deps, u),
        value: st.current,
        qualifies: st.current > 0,
        detail: st.current ? `${st.doneToday ? 'Já treinou hoje' : 'Falta marcar hoje'} · recorde ${st.best}` : st.best ? `Zerada · recorde ${st.best}` : 'Ainda sem atividade',
        extra: { ...st },
      };
    }),
    (a, b) => Number(b.extra.best) - Number(a.extra.best),
  );

  const physical = ranked(
    users.map((u) => {
      const own = results.filter((r) => r.userId === u.id).map((r) => ({ testId: r.testId as TestId, date: r.date, value: r.value, reps: r.reps, bodyweightKg: r.bodyweightKg }));
      const axes = radarProfile(own, lastWeight.get(u.id)?.w ?? null);
      const scores = axes.map((a) => a.score).filter((x): x is number => x != null);
      const total = Math.round(scores.reduce((a, b) => a + b, 0) * 10) / 10;
      const top = [...axes].filter((a) => a.score != null).sort((a, b) => b.score! - a.score!)[0];
      return {
        user: publicUser(deps, u),
        value: total,
        qualifies: total > 0,
        detail: scores.length ? `${scores.length} de ${axes.length} testes · nível médio ${(total / scores.length).toFixed(1).replace('.', ',')}${top ? ` · melhor: ${top.label}` : ''}` : 'Nenhum teste físico ainda',
        extra: { tests: scores.length, axes: axes.length, average: scores.length ? Math.round((total / scores.length) * 10) / 10 : null, max: axes.length * 20 },
      };
    }),
    (a, b) => Number(b.extra.tests) - Number(a.extra.tests),
  );

  const evolution = ranked(
    users.map((u) => {
      const r = scoreEvolution(
        {
          goal: u.goal as Goal,
          experience: u.experience as Experience,
          body: [
            ...weighIns.filter((w) => w.userId === u.id).map((w) => ({ date: w.date, weightKg: w.weightKg })),
            ...assessments
              .filter((a) => a.userId === u.id)
              .map((a) => ({ date: a.date, weightKg: a.weightKg, bodyFatPct: a.bodyFatPct, fatMassKg: a.fatMassKg, leanMassKg: a.leanMassKg })),
          ],
          tests: results.filter((x) => x.userId === u.id).map((x) => ({ testId: x.testId as TestId, date: x.date, value: x.value, reps: x.reps, bodyweightKg: x.bodyweightKg })),
        },
        today,
      );
      // Quem não mostra os números do corpo: os outros veem só os pontos (o resumo revelaria peso).
      const hidden = r.basis === 'body' && r.status === 'ok' && u.id !== viewerId && !u.shareBody;
      return {
        user: publicUser(deps, u),
        value: r.status === 'ok' ? r.points : 0,
        qualifies: r.status === 'ok' && r.points > 0,
        detail: hidden ? `${GOAL_LABELS[u.goal as Goal]} · números do corpo privados` : `${GOAL_LABELS[u.goal as Goal]} · ${r.summary}`,
        extra: { status: r.status, basis: r.basis, since: r.since, lowConfidence: !!r.lowConfidence, goal: u.goal },
      };
    }),
    () => 0,
  );

  return { today, boards: { streak, physical, evolution } satisfies Record<RankingBoard, RankingEntry[]> };
}

// ---------------------------------------------------------------- 1º lugar

const leaderKey = (b: RankingBoard) => `leader:${b}`;

/** Confere os líderes e avisa quem assumiu, quem perdeu e o resto do grupo. Devolve os líderes atuais. */
export async function checkLeaders(deps: Deps): Promise<Record<RankingBoard, string | null>> {
  const { boards } = await computeRankings(deps);
  const leaders = {} as Record<RankingBoard, string | null>;
  for (const board of RANKING_BOARDS) {
    const list = boards[board].filter((e) => e.qualifies);
    const top = list[0] ?? null;
    const tied = top ? list.filter((e) => e.value === top.value).map((e) => e.user.id) : [];
    const stored = await getMeta(deps.db, leaderKey(board));
    // Empate com quem já liderava: continua com ele (só troca quando alguém passa).
    const next = stored && tied.includes(stored) ? stored : (top?.user.id ?? null);
    leaders[board] = next;
    if (stored === null) {
      // Primeira vez (instalação nova ou atualização): só registra, sem avisar ninguém.
      await setMeta(deps.db, leaderKey(board), next ?? '');
      continue;
    }
    if ((next ?? '') === stored) continue;
    await setMeta(deps.db, leaderKey(board), next ?? '');
    if (!next) continue;
    const label = RANKING_LABELS[board].title;
    const winner = list.find((e) => e.user.id === next)!;
    const loser = stored ? boards[board].find((e) => e.user.id === stored) : undefined;
    const value = board === 'streak' ? `${winner.value} dias seguidos` : `${String(winner.value).replace('.', ',')} pontos`;
    await notify(deps, {
      to: [next],
      category: 'ranking',
      kind: 'ranking.gain',
      title: `🏆 Você é o 1º lugar em ${label}!`,
      body: loser ? `Passou ${loser.user.name} com ${value}.` : `Liderando com ${value}.`,
      url: `/ranking?board=${board}`,
    });
    if (loser) {
      await notify(deps, {
        to: [loser.user.id],
        category: 'ranking',
        kind: 'ranking.loss',
        title: `Você perdeu o 1º lugar em ${label}`,
        body: `${winner.user.name} passou você (${value}). Hora de reagir!`,
        url: `/ranking?board=${board}`,
        actorId: next,
      });
    }
    await notify(deps, {
      to: 'all',
      except: [next, ...(loser ? [loser.user.id] : [])],
      category: 'ranking',
      kind: 'ranking.leader',
      title: `👑 ${winner.user.name} é o novo 1º lugar em ${label}`,
      body: value,
      url: `/ranking?board=${board}`,
      actorId: next,
      push: false,
    });
  }
  return leaders;
}

interface QueueState {
  timer: ReturnType<typeof setTimeout> | null;
  running: Promise<void> | null;
  again: boolean;
  waiters: (() => void)[];
}
const queues = new WeakMap<Deps, QueueState>();

/**
 * Agenda uma conferência dos líderes (várias mudanças seguidas viram uma conferência só).
 * A promessa termina quando a conferência que inclui esta mudança acabar.
 */
export function queueLeaderCheck(deps: Deps): Promise<void> {
  let q = queues.get(deps);
  if (!q) queues.set(deps, (q = { timer: null, running: null, again: false, waiters: [] }));
  const state = q;
  const delay = deps.config.NODE_ENV === 'test' ? 0 : 1500;
  return new Promise<void>((resolve) => {
    state.waiters.push(resolve);
    if (state.running) {
      state.again = true;
      return;
    }
    if (state.timer) return;
    const run = () => {
      state.timer = null;
      const waiting = state.waiters.splice(0);
      state.running = checkLeaders(deps)
        .then(() => undefined)
        .catch((err: Error) => deps.logger.warn({ err: err.message }, 'falha ao conferir líderes dos rankings'))
        .finally(() => {
          state.running = null;
          waiting.forEach((w) => w());
          if (state.again) {
            state.again = false;
            state.timer = setTimeout(run, delay);
          }
        });
    };
    state.timer = setTimeout(run, delay);
  });
}
