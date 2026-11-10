import type { StravaActivity, StravaDetailedActivity } from './strava-api';

export const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
const TARGETS = { run_1k: 1000, run_5k: 5000, run_10k: 10000 } as const;
type Target = keyof typeof TARGETS;

export interface StravaBest {
  seconds: number;
  date: string;
  activityName: string | null;
  /** best_effort = trecho medido pelo Strava; estimated = proporcional ao tempo da atividade inteira. */
  source: 'best_effort' | 'estimated';
}

export interface StravaSummary {
  runs: number;
  periodDays: number;
  bests: Record<Target, StravaBest | null>;
  maxSpeed: { kmh: number; date: string; activityName: string | null } | null;
  recent: { date: string; name: string | null; distanceKm: number; movingTimeSec: number; paceSecPerKm: number }[];
}

const effortKey = (name: string) => name.toLowerCase().replace(/\s+/g, '');
const EFFORT_NAMES: Record<Target, string[]> = { run_1k: ['1k', '1km'], run_5k: ['5k', '5km'], run_10k: ['10k', '10km'] };

/**
 * Resume as corridas do Strava. Prefere os "best efforts" do Strava (trechos exatos de
 * 1k/5k/10k dentro de uma corrida); sem eles, estima pela atividade inteira quando a
 * distância é de 100% a 105% do alvo. Velocidade máxima = maior max_speed (GPS pode ter picos).
 */
export function summarizeRuns(activities: StravaActivity[], details: StravaDetailedActivity[], periodDays: number): StravaSummary {
  const runs = activities.filter((a) => RUN_TYPES.has(a.sport_type ?? a.type ?? ''));
  const bests: StravaSummary['bests'] = { run_1k: null, run_5k: null, run_10k: null };
  const consider = (t: Target, cand: StravaBest) => {
    if (!bests[t] || cand.seconds < bests[t]!.seconds) bests[t] = cand;
  };
  for (const d of details) {
    for (const e of d.best_efforts ?? []) {
      for (const t of Object.keys(TARGETS) as Target[]) {
        if (EFFORT_NAMES[t].includes(effortKey(e.name))) consider(t, { seconds: e.elapsed_time, date: (e.start_date ?? d.start_date).slice(0, 10), activityName: d.name ?? null, source: 'best_effort' });
      }
    }
  }
  for (const a of runs) {
    for (const t of Object.keys(TARGETS) as Target[]) {
      const target = TARGETS[t];
      if (bests[t]?.source === 'best_effort') continue;
      if (a.distance >= target && a.distance <= target * 1.05) {
        consider(t, { seconds: Math.round((a.moving_time * target) / a.distance), date: a.start_date.slice(0, 10), activityName: a.name ?? null, source: 'estimated' });
      }
    }
  }
  const fastest = runs.reduce<StravaActivity | null>((m, a) => (a.max_speed > (m?.max_speed ?? 0) ? a : m), null);
  return {
    runs: runs.length,
    periodDays,
    bests,
    maxSpeed: fastest && fastest.max_speed > 0 ? { kmh: Math.round(fastest.max_speed * 3.6 * 10) / 10, date: fastest.start_date.slice(0, 10), activityName: fastest.name ?? null } : null,
    recent: [...runs]
      .sort((a, b) => b.start_date.localeCompare(a.start_date))
      .slice(0, 10)
      .map((a) => ({
        date: (a.start_date_local ?? a.start_date).slice(0, 10),
        name: a.name ?? null,
        distanceKm: Math.round(a.distance / 10) / 100,
        movingTimeSec: a.moving_time,
        paceSecPerKm: a.distance > 0 ? Math.round(a.moving_time / (a.distance / 1000)) : 0,
      })),
  };
}
