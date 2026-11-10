import type { TestDef, TestId } from '@forja/shared';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { ApiError, get } from './api';
import type {
  BodySummary,
  ChatRoom,
  CompetitionBoard,
  CompetitionItem,
  DietPlan,
  EventView,
  ExerciseDetail,
  ExerciseItem,
  Home,
  LeaderboardEntry,
  Member,
  RadarAxisView,
  Routine,
  StravaSummary,
  TestOverview,
  TestResultView,
} from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export const useHome = () => useQuery({ queryKey: ['home'], queryFn: () => get<Home>('/home') });
export const useMembers = () => useQuery({ queryKey: ['members'], queryFn: () => get<Member[]>('/members') });
export const useAuthConfig = () => useQuery({ queryKey: ['auth-config'], queryFn: () => get<{ inviteRequired: boolean; hasUsers: boolean; strava: boolean }>('/auth/config'), staleTime: 300_000 });

export const useEvents = (scope: 'upcoming' | 'past') => useQuery({ queryKey: ['events', scope], queryFn: () => get<EventView[]>('/events', { scope }) });
export const useEvent = (id: string) =>
  useQuery({ queryKey: ['event', id], queryFn: () => get<EventView & { routineDetail: Routine | null }>(`/events/${id}`), enabled: !!id });

export const useRoutines = () => useQuery({ queryKey: ['routines'], queryFn: () => get<Routine[]>('/routines') });
export const useRoutine = (id: string | undefined) => useQuery({ queryKey: ['routine', id], queryFn: () => get<Routine>(`/routines/${id}`), enabled: !!id });
export const useExercises = (q: string, bodyPart: string | null, equipment: string | null) =>
  useQuery({
    queryKey: ['exercises', q, bodyPart, equipment],
    queryFn: () => get<{ items: ExerciseItem[]; total: number }>('/exercises', { q, bodyPart, equipment, limit: 60 }),
    staleTime: 600_000,
    placeholderData: (prev) => prev,
  });
export const useExercise = (id: string) => useQuery({ queryKey: ['exercise', id], queryFn: () => get<ExerciseDetail>(`/exercises/${id}`), staleTime: 3_600_000 });
export const useLogs = () => useQuery({ queryKey: ['logs'], queryFn: () => get<{ id: string; date: string; kind: string; durationMin: number | null; routineId: string | null; notes: string | null }[]>('/logs') });

export const useBody = (userId?: string) => useQuery({ queryKey: ['body', userId ?? 'me'], queryFn: () => get<BodySummary>('/body', { userId }) });
export const useDiet = () => useQuery({ queryKey: ['diet'], queryFn: () => get<DietPlan[]>('/diet') });

export const useTests = () => useQuery({ queryKey: ['tests'], queryFn: () => get<TestOverview[]>('/tests') });
export const useBests = (userId?: string) =>
  useQuery({
    queryKey: ['test-bests', userId ?? 'me'],
    queryFn: () => get<{ testId: TestId; count: number; best: { id: string; date: string; value: number; reps: number | null; effectiveValue: number } | null }[]>('/tests/bests', { userId }),
  });
export const useTestHistory = (testId: TestId, userId?: string) =>
  useQuery({ queryKey: ['test-history', testId, userId ?? 'me'], queryFn: () => get<{ test: TestDef; results: TestResultView[] }>(`/tests/${testId}/history`, { userId }) });
export const useLeaderboard = (testId: TestId) =>
  useQuery({ queryKey: ['leaderboard', testId], queryFn: () => get<{ test: TestDef; entries: LeaderboardEntry[] }>(`/tests/${testId}/leaderboard`) });
export const usePowerlifting = () =>
  useQuery({
    queryKey: ['powerlifting'],
    queryFn: () => get<{ rank: number; user: Member; squat: number; bench: number; deadlift: number; total: number; bodyweightKg: number | null; dots: number | null }[]>('/tests/powerlifting'),
  });
export const useRadar = (userId?: string, compareWith?: string | null) =>
  useQuery({
    queryKey: ['radar', userId ?? 'me', compareWith ?? null],
    queryFn: () => get<{ axes: RadarAxisView[]; compare: RadarAxisView[] | null }>('/tests/radar', { userId, compareWith }),
    placeholderData: (prev) => prev,
  });

export const useCompetitions = () => useQuery({ queryKey: ['competitions'], queryFn: () => get<CompetitionItem[]>('/competitions') });
export const useCompetition = (id: string | undefined) => useQuery({ queryKey: ['competition', id], queryFn: () => get<CompetitionBoard>(`/competitions/${id}`), enabled: !!id });

export const useChatRooms = () => useQuery({ queryKey: ['chat-rooms'], queryFn: () => get<ChatRoom[]>('/chat/rooms') });

export const useStravaStatus = () => useQuery({ queryKey: ['strava-status'], queryFn: () => get<{ configured: boolean; connected: boolean; connectedAt: string | null }>('/strava/status') });
export const useStravaSummary = (enabled: boolean) =>
  useQuery({ queryKey: ['strava-summary'], queryFn: () => get<StravaSummary>('/strava/summary'), enabled, staleTime: 600_000, retry: false });

/** Chaves que mudam quando um resultado de teste é salvo. */
export const TEST_KEYS = [['tests'], ['test-bests'], ['test-history'], ['leaderboard'], ['powerlifting'], ['radar'], ['competition'], ['home']];
/** Chaves que mudam quando o corpo (peso/avaliação) muda. */
export const BODY_KEYS = [['body'], ['competition'], ['home'], ['radar'], ['tests']];

export function invalidate(keys: string[][]) {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
