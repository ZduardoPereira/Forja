/**
 * Banco do FORJA v2 (PostgreSQL / PGlite via Drizzle). Pequeno grupo de amigos:
 * login por nome + senha, sem e-mail. Unidades: kg, cm, segundos, km/h.
 */
import { sql } from 'drizzle-orm';
import { type AnyPgColumn, bigint, boolean, check, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const tsz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => tsz('created_at').notNull().defaultNow();
const num = (name: string, precision = 7, scale = 2) => numeric(name, { precision, scale, mode: 'number' });
const day = (name: string) => date(name, { mode: 'string' });

// ---------------------------------------------------------------------------
// Pessoas e acesso
// ---------------------------------------------------------------------------

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    mime: text('mime').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('files_owner_idx').on(t.ownerId)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Nome normalizado (minúsculas, sem acento) — único, usado no login. */
    nameKey: text('name_key').notNull(),
    passwordHash: text('password_hash').notNull(),
    isAdmin: boolean('is_admin').notNull().default(false),
    avatarFileId: uuid('avatar_file_id').references(() => files.id, { onDelete: 'set null' }),
    goal: text('goal').notNull().default('performance'),
    sex: text('sex'),
    birthDate: day('birth_date'),
    heightCm: num('height_cm', 5, 1),
    experience: text('experience').notNull().default('beginner'),
    targetWeightKg: num('target_weight_kg', 5, 1),
    activityLevel: text('activity_level').notNull().default('moderate'),
    /** Mostrar números do corpo (peso, % gordura) para o grupo. Fotos têm visibilidade própria. */
    shareBody: boolean('share_body').notNull().default(false),
    bio: text('bio'),
    /** Categorias de notificação que chegam no celular/PC (ver NOTIFICATION_CATEGORIES). */
    notifyPrefs: jsonb('notify_prefs').notNull().default({}),
    createdAt: createdAt(),
    lastSeenAt: tsz('last_seen_at'),
  },
  (t) => [uniqueIndex('users_name_key_uq').on(t.nameKey), index('users_avatar_idx').on(t.avatarFileId)],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastUsedAt: tsz('last_used_at').notNull().defaultNow(),
    expiresAt: tsz('expires_at').notNull(),
  },
  (t) => [uniqueIndex('auth_sessions_token_uq').on(t.tokenHash), index('auth_sessions_user_idx').on(t.userId)],
);

/** Senha temporária gerada pelo administrador (não há e-mail para recuperar acesso). */
export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('password_resets_user_idx').on(t.userId), index('password_resets_creator_idx').on(t.createdBy)],
);

// ---------------------------------------------------------------------------
// Corpo e dieta
// ---------------------------------------------------------------------------

export const weighIns = pgTable(
  'weigh_ins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: day('date').notNull(),
    weightKg: num('weight_kg', 5, 2).notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('weigh_ins_user_date_idx').on(t.userId, t.date)],
);

/** Avaliações de composição (nutricionista, bioimpedância, dobras, DEXA, balança). */
export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: day('date').notNull(),
    method: text('method').notNull(),
    professional: text('professional'),
    weightKg: num('weight_kg', 5, 2),
    bodyFatPct: num('body_fat_pct', 4, 1),
    fatMassKg: num('fat_mass_kg', 5, 2),
    leanMassKg: num('lean_mass_kg', 5, 2),
    muscleMassKg: num('muscle_mass_kg', 5, 2),
    visceralFat: num('visceral_fat', 4, 1),
    bodyWaterPct: num('body_water_pct', 4, 1),
    bmrKcal: integer('bmr_kcal'),
    waistCm: num('waist_cm', 5, 1),
    hipCm: num('hip_cm', 5, 1),
    chestCm: num('chest_cm', 5, 1),
    armCm: num('arm_cm', 4, 1),
    thighCm: num('thigh_cm', 4, 1),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [index('assessments_user_date_idx').on(t.userId, t.date)],
);

export const dietPlans = pgTable(
  'diet_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    professional: text('professional'),
    startDate: day('start_date'),
    caloriesKcal: integer('calories_kcal'),
    proteinG: integer('protein_g'),
    carbsG: integer('carbs_g'),
    fatG: integer('fat_g'),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    meals: jsonb('meals').notNull().default([]),
    createdAt: createdAt(),
    updatedAt: tsz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('diet_plans_user_idx').on(t.userId)],
);

/**
 * Fotos e documentos anexados (progresso, pesagem, laudo da avaliação, plano de dieta, teste).
 * `visibility` controla quem vê: só o dono ou o grupo.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    date: day('date').notNull(),
    caption: text('caption'),
    visibility: text('visibility').notNull().default('private'),
    createdAt: createdAt(),
  },
  (t) => [
    index('attachments_user_idx').on(t.userId, t.date),
    index('attachments_entity_idx').on(t.entityType, t.entityId),
    index('attachments_file_idx').on(t.fileId),
    check('attachments_visibility_ck', sql`${t.visibility} in ('private','group')`),
  ],
);

// ---------------------------------------------------------------------------
// Exercícios (openGym) e rotinas
// ---------------------------------------------------------------------------

export const exercises = pgTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    namePt: text('name_pt').notNull(),
    nameEn: text('name_en').notNull(),
    bodyPart: text('body_part'),
    equipment: text('equipment'),
    target: text('target'),
    secondary: text('secondary').array().notNull().default(sql`'{}'::text[]`),
    category: text('category'),
    hold: boolean('hold').notNull().default(false),
    description: text('description').notNull().default(''),
    instructions: text('instructions').array().notNull().default(sql`'{}'::text[]`),
    instructionsLang: text('instructions_lang').notNull(),
    textSource: text('text_source').notNull(),
    search: text('search').notNull(),
  },
  (t) => [index('exercises_body_part_idx').on(t.bodyPart), index('exercises_equipment_idx').on(t.equipment)],
);

export const routines = pgTable(
  'routines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** null = rotina pronta do openGym (compartilhada). */
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    planKey: text('plan_key'),
    planName: text('plan_name'),
    name: text('name').notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('routines_owner_idx').on(t.ownerId), uniqueIndex('routines_plan_uq').on(t.planKey, t.name)],
);

export const routineExercises = pgTable(
  'routine_exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routineId: uuid('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    sets: integer('sets').notNull(),
    reps: text('reps').notNull(),
    restSec: integer('rest_sec'),
    notes: text('notes'),
  },
  (t) => [index('routine_exercises_routine_idx').on(t.routineId), index('routine_exercises_exercise_idx').on(t.exerciseId)],
);

// ---------------------------------------------------------------------------
// Treinos marcados, presença e registro
// ---------------------------------------------------------------------------

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    startsAt: tsz('starts_at').notNull(),
    durationMin: integer('duration_min').notNull(),
    location: text('location'),
    kind: text('kind').notNull(),
    routineId: uuid('routine_id').references(() => routines.id, { onDelete: 'set null' }),
    cancelledAt: tsz('cancelled_at'),
    /** Quando o lembrete de 1 hora antes foi enviado. */
    remindedAt: tsz('reminded_at'),
    createdAt: createdAt(),
  },
  (t) => [index('events_starts_idx').on(t.startsAt), index('events_creator_idx').on(t.createdBy), index('events_routine_idx').on(t.routineId)],
);

export const eventRsvps = pgTable(
  'event_rsvps',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    /** Presença confirmada pela própria pessoa depois do treino. */
    attended: boolean('attended'),
    updatedAt: tsz('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] }), index('event_rsvps_user_idx').on(t.userId), check('event_rsvps_status_ck', sql`${t.status} in ('going','maybe','not_going')`)],
);

export const workoutLogs = pgTable(
  'workout_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: day('date').notNull(),
    kind: text('kind').notNull(),
    durationMin: integer('duration_min'),
    routineId: uuid('routine_id').references(() => routines.id, { onDelete: 'set null' }),
    notes: text('notes'),
    /** 'manual' (marcou a atividade), 'session' (assistente de treino) ou 'admin' (corrigido pelo administrador). */
    source: text('source').notNull().default('manual'),
    title: text('title'),
    startedAt: tsz('started_at'),
    createdAt: createdAt(),
  },
  (t) => [index('workout_logs_user_date_idx').on(t.userId, t.date), index('workout_logs_routine_idx').on(t.routineId)],
);

/** Séries feitas no assistente de treino (peso, repetições, descanso). */
export const workoutSets = pgTable(
  'workout_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    logId: uuid('log_id')
      .notNull()
      .references(() => workoutLogs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    /** Ordem do exercício no treino. */
    position: integer('position').notNull(),
    setIndex: integer('set_index').notNull(),
    weightKg: num('weight_kg', 6, 2),
    reps: integer('reps'),
    durationSec: integer('duration_sec'),
    restSec: integer('rest_sec'),
    createdAt: createdAt(),
  },
  (t) => [index('workout_sets_log_idx').on(t.logId), index('workout_sets_user_exercise_idx').on(t.userId, t.exerciseId, t.createdAt), index('workout_sets_exercise_idx').on(t.exerciseId)],
);

// ---------------------------------------------------------------------------
// Testes físicos
// ---------------------------------------------------------------------------

export const testResults = pgTable(
  'test_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    testId: text('test_id').notNull(),
    date: day('date').notNull(),
    value: num('value', 8, 2).notNull(),
    reps: integer('reps'),
    /** Peso corporal mais recente na data (para força relativa). */
    bodyweightKg: num('bodyweight_kg', 5, 2),
    notes: text('notes'),
    fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('test_results_user_test_idx').on(t.userId, t.testId, t.date), index('test_results_test_idx').on(t.testId), index('test_results_file_idx').on(t.fileId)],
);

/** "Eu vi": amigos confirmam um resultado. */
export const testConfirmations = pgTable(
  'test_confirmations',
  {
    resultId: uuid('result_id')
      .notNull()
      .references(() => testResults.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.resultId, t.userId] }), index('test_confirmations_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------------------
// Strava (somente o dono vê os dados — regras da API do Strava)
// ---------------------------------------------------------------------------

export const stravaAccounts = pgTable('strava_accounts', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  athleteId: bigint('athlete_id', { mode: 'number' }).notNull().unique(),
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  expiresAt: tsz('expires_at').notNull(),
  scope: text('scope').notNull(),
  connectedAt: createdAt(),
});

/** Cache do resumo do Strava: no máximo 7 dias (Política da API do Strava, 6.2). */
export const stravaCache = pgTable('strava_cache', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  fetchedAt: tsz('fetched_at').notNull(),
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const chatRooms = pgTable(
  'chat_rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('chat_rooms_event_uq').on(t.eventId), check('chat_rooms_kind_ck', sql`${t.kind} in ('group','event')`)],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => chatRooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('chat_messages_room_created_idx').on(t.roomId, t.createdAt), index('chat_messages_user_idx').on(t.userId), index('chat_messages_file_idx').on(t.fileId)],
);

export const chatReads = pgTable(
  'chat_reads',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => chatRooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: tsz('last_read_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] }), index('chat_reads_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------------------
// Competição
// ---------------------------------------------------------------------------

export const competitions = pgTable(
  'competitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    startDate: day('start_date').notNull(),
    endDate: day('end_date').notNull(),
    weightBody: integer('weight_body').notNull(),
    weightPerformance: integer('weight_performance').notNull(),
    weightConsistency: integer('weight_consistency').notNull(),
    consistencyTarget: integer('consistency_target').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('competitions_creator_idx').on(t.createdBy), check('competitions_dates_ck', sql`${t.startDate} < ${t.endDate}`)],
);

export const competitionParticipants = pgTable(
  'competition_participants',
  {
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goal: text('goal').notNull(),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.userId] }), index('competition_participants_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Quem recebe. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Caminho no app para abrir ao tocar (ex.: /events/…). */
    url: text('url'),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    readAt: tsz('read_at'),
  },
  (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt), index('notifications_actor_idx').on(t.actorId)],
);

/** Inscrições de notificação no navegador / app instalado pelo navegador (Web Push). */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSuccessAt: tsz('last_success_at'),
    failures: integer('failures').notNull().default(0),
  },
  (t) => [uniqueIndex('push_subscriptions_endpoint_uq').on(t.endpoint), index('push_subscriptions_user_idx').on(t.userId)],
);

export const meta = pgTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
