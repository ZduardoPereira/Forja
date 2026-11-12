import type { ActivityKind, Experience, Goal, RsvpStatus, Sex, TestDef, TestId } from '@forja/shared';

export interface FileRef {
  id: string;
  url: string;
  thumbUrl: string;
}

export interface Member {
  id: string;
  name: string;
  avatar: FileRef | null;
  goal: Goal;
  isAdmin: boolean;
  lastSeenAt: string | null;
  online: boolean;
}

export interface Me {
  id: string;
  name: string;
  isAdmin: boolean;
  avatar: FileRef | null;
  avatarFileId: string | null;
  goal: Goal;
  sex: Sex | null;
  birthDate: string | null;
  heightCm: number | null;
  experience: Experience;
  targetWeightKg: number | null;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete';
  shareBody: boolean;
  bio: string | null;
  createdAt: string;
}

export interface EventView {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  durationMin: number;
  location: string | null;
  kind: ActivityKind;
  routineId: string | null;
  cancelledAt: string | null;
  createdBy: string;
  creator: Member | null;
  routine: { id: string; name: string } | null;
  roomId: string | null;
  started: boolean;
  myStatus: RsvpStatus | null;
  myAttended: boolean | null;
  counts: { going: number; maybe: number };
  attendees: { user: Member; status: RsvpStatus; attended: boolean | null }[];
}

export interface RoutineExercise {
  id: string;
  namePt: string;
  nameEn: string;
  bodyPart: string | null;
  equipment: string | null;
  target: string | null;
  category: string | null;
  position: number;
  sets: number;
  reps: string;
  restSec: number | null;
  notes: string | null;
}

export interface Routine {
  id: string;
  ownerId: string | null;
  planKey: string | null;
  planName: string | null;
  name: string;
  description: string | null;
  exerciseCount?: number;
  mine?: boolean;
  exercises?: RoutineExercise[];
}

export interface ExerciseItem {
  id: string;
  namePt: string;
  nameEn: string;
  bodyPart: string | null;
  equipment: string | null;
  target: string | null;
  category: string | null;
}

export interface ExerciseDetail extends ExerciseItem {
  secondary: string[];
  hold: boolean;
  description: string;
  instructions: string[];
  instructionsLang: 'pt' | 'en';
  textSource: string;
}

export interface Photo {
  id: string;
  date: string;
  caption: string | null;
  visibility: 'private' | 'group';
  entityType: string;
  entityId: string | null;
  file: FileRef;
}

export interface Composition {
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  derived: string[];
}

export interface Assessment {
  id: string;
  date: string;
  method: string;
  professional: string | null;
  weightKg: number | null;
  bodyFatPct: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  muscleMassKg: number | null;
  visceralFat: number | null;
  bodyWaterPct: number | null;
  bmrKcal: number | null;
  waistCm: number | null;
  hipCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  notes: string | null;
  composition: Composition;
  attachments: Photo[];
}

export interface BodySummary {
  userId: string;
  numbersVisible: boolean;
  heightCm: number | null;
  targetWeightKg: number | null;
  weighIns: { id: string; date: string; weightKg: number; note: string | null; photos: Photo[] }[];
  assessments: Assessment[];
  photos: Photo[];
  latest: { weight: { date: string; weightKg: number } | null; bmi: number | null; composition: Composition | null } | null;
}

export interface DietPlan {
  id: string;
  title: string;
  professional: string | null;
  startDate: string | null;
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  notes: string | null;
  active: boolean;
  meals: DietMeal[];
  attachments: { id: string; file: FileRef }[];
}

export interface TestOverview {
  test: TestDef;
  myBest: { id: string; date: string; value: number; reps: number | null; effectiveValue: number } | null;
  myCount: number;
  leader: { user: Member; value: number; dots: number | null } | null;
  myRank: number | null;
}

export interface TestResultView {
  id: string;
  userId: string;
  testId: TestId;
  date: string;
  value: number;
  reps: number | null;
  bodyweightKg: number | null;
  notes: string | null;
  effectiveValue: number;
  estimated: boolean;
  file: FileRef | null;
  confirmedBy: string[];
}

export interface LeaderboardEntry {
  rank: number;
  user: Member;
  result: TestResultView;
  value: number;
  relative: number | null;
  dots: number | null;
}

export interface RadarAxisView {
  testId: TestId;
  label: string;
  score: number | null;
}

export interface ComponentView {
  status: 'ok' | 'no_data' | 'not_applicable';
  points: number;
  weight: number;
  summary: string;
  lowConfidence?: boolean;
}

export interface StandingView {
  userId: string;
  name: string;
  goal: Goal;
  rank: number;
  total: number;
  body: ComponentView;
  performance: ComponentView;
  consistency: ComponentView;
  tests: { testId: TestId; base: number; current: number; improvementPct: number; points: number }[];
  user: Member;
  weekChange: number | null;
}

export interface CompetitionBoard {
  id: string;
  name: string;
  createdBy: string;
  startDate: string;
  endDate: string;
  weightBody: number;
  weightPerformance: number;
  weightConsistency: number;
  consistencyTarget: number;
  phase: 'upcoming' | 'active' | 'finished';
  today: string;
  daysLeft: number;
  daysTotal: number;
  standings: StandingView[];
  rates: { fatLossPerWeekPct: number; leanGainPerMonthPct: Record<Experience, number> };
}

export interface CompetitionItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  phase: 'upcoming' | 'active' | 'finished';
  participants: number;
  myGoal: Goal | null;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  author: { name: string; avatar: FileRef | null } | null;
  text: string;
  image: FileRef | null;
  createdAt: string;
}

export interface ChatRoom {
  id: string;
  kind: 'group' | 'event';
  title: string;
  eventId: string | null;
  eventStartsAt: string | null;
  eventCancelled: boolean;
  unread: number;
  lastMessage: ChatMessage | null;
}

export interface Home {
  today: string;
  events: { id: string; title: string; kind: ActivityKind; startsAt: string; location: string | null; creator: Member | null; going: number; myStatus: RsvpStatus | null }[];
  competition: { id: string; name: string; daysLeft: number; myRank: number | null; myTotal: number | null; participants: number; leader: { user: Member; total: number } | null } | null;
  weight: { date: string; weightKg: number; weekChange: number | null } | null;
  unread: number;
  streak: StreakInfo;
  unreadNotifications: number;
  apk: { versionCode: number; versionName: string; url: string } | null;
}

export interface StravaSummary {
  runs: number;
  periodDays: number;
  bests: Record<'run_1k' | 'run_5k' | 'run_10k', { seconds: number; date: string; activityName: string | null; source: 'best_effort' | 'estimated' } | null>;
  maxSpeed: { kmh: number; date: string; activityName: string | null } | null;
  recent: { date: string; name: string | null; distanceKm: number; movingTimeSec: number; paceSecPerKm: number }[];
  fetchedAt: string;
  cached: boolean;
}

// ---------------------------------------------------------------------------
// Sequência, rankings, notificações, assistente de treino e administração
// ---------------------------------------------------------------------------

export interface StreakInfo {
  current: number;
  best: number;
  doneToday: boolean;
  lastDate: string | null;
}

export interface ActivityGroup {
  today: string;
  me: StreakInfo;
  doneToday: number;
  members: { user: Member; streak: StreakInfo; todayKinds: ActivityKind[] }[];
}

export interface ActivityCalendar {
  today: string;
  streak: StreakInfo;
  days: { date: string; kinds: ActivityKind[] }[];
}

export type RankingBoardId = 'streak' | 'physical' | 'evolution';
export interface RankingEntry {
  rank: number;
  user: Member;
  value: number;
  qualifies: boolean;
  detail: string;
  extra: Record<string, unknown>;
}
export interface Rankings {
  today: string;
  boards: Record<RankingBoardId, RankingEntry[]>;
  leaders: Record<RankingBoardId, string | null>;
  mine: Record<RankingBoardId, number | null>;
}

export interface AppNotification {
  id: string;
  category: 'events' | 'chat' | 'ranking' | 'streak' | 'group';
  kind: string;
  title: string;
  body: string;
  url: string | null;
  createdAt: string;
  readAt: string | null;
  actor: { id: string; name: string; avatar: FileRef | null } | null;
}

export interface LogItem {
  id: string;
  date: string;
  kind: ActivityKind;
  durationMin: number | null;
  routineId: string | null;
  notes: string | null;
  source: 'manual' | 'session' | 'admin';
  title: string | null;
  startedAt: string | null;
  summary: { sets: number; exercises: number; volumeKg: number } | null;
}

export interface SessionSetView {
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  restSec?: number | null;
}

export interface SessionDetail extends Omit<LogItem, 'summary'> {
  exercises: { exerciseId: string; name: string; sets: SessionSetView[] }[];
  summary: { sets: number; reps: number; volumeKg: number };
}

export interface ExercisePrevious {
  exerciseId: string;
  last: { date: string; sets: SessionSetView[] } | null;
  best: { weightKg: number | null; reps: number | null; e1rm: number } | null;
}

export interface SessionResult {
  log: LogItem;
  summary: { durationMin: number; exercises: number; sets: number; reps: number; volumeKg: number; records: { exerciseId: string; name: string; weightKg: number | null; reps: number | null; e1rm: number }[] };
  streak: StreakInfo;
}

export interface AdminOverview {
  version: string;
  node: string;
  uptimeSec: number;
  now: string;
  today: string;
  timezone: string;
  publicUrl: string;
  counts: Record<'members' | 'activities' | 'sessions' | 'tests' | 'weighIns' | 'events' | 'chatMessages' | 'photos' | 'notifications' | 'pushDevices', number>;
  storage: { dbBytes: number; uploadsBytes: number };
  backup: { name: string; sizeBytes: number; at: string } | null;
  leaders: Record<RankingBoardId, string | null>;
}

export interface DietFood {
  name: string;
  foodId?: string | null;
  grams?: number | null;
  amount?: string | null;
  kcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

export interface DietMeal {
  name: string;
  time?: string | null;
  /** Texto livre (planos antigos ou o que o nutricionista escreveu). */
  items: string;
  foods?: DietFood[];
  notes?: string | null;
}
