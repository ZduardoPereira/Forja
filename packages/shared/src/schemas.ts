/** Schemas de entrada — validados no app (formulários) e SEMPRE no servidor. */
import { z } from 'zod';
import { ACTIVITY_KINDS, ASSESSMENT_METHODS, EXPERIENCE_LEVELS, FILE_KINDS, GOALS, RSVP_STATUSES, SEXES, VISIBILITIES } from './domain';
import { ACTIVITY_LEVELS } from './nutrition';
import { TEST_IDS } from './tests';
import { isLocalDate } from './time';

const localDate = z.string().refine(isLocalDate, 'Data inválida (use AAAA-MM-DD)');
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable().optional();
const num = (min: number, max: number) => z.number().min(min).max(max);
const optionalNum = (min: number, max: number) => num(min, max).nullable().optional();
const id = z.uuid();

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'O nome precisa de pelo menos 2 letras')
  .max(24, 'Nome muito longo (máx. 24)')
  .regex(/^[\p{L}\p{N} ._-]+$/u, 'Use letras, números, espaço, ponto, _ ou -');
export const passwordSchema = z.string().min(6, 'A senha precisa de pelo menos 6 caracteres').max(128);

export const registerSchema = z.object({ name: nameSchema, password: passwordSchema, inviteCode: z.string().trim().max(64).optional() });
export const loginSchema = z.object({ name: z.string().trim().min(1, 'Informe seu nome').max(24), password: z.string().min(1, 'Informe a senha').max(128) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });

export const profileSchema = z.object({
  name: nameSchema.optional(),
  avatarFileId: id.nullable().optional(),
  goal: z.enum(GOALS).optional(),
  sex: z.enum(SEXES).nullable().optional(),
  birthDate: localDate.nullable().optional(),
  heightCm: optionalNum(100, 250),
  experience: z.enum(EXPERIENCE_LEVELS).optional(),
  targetWeightKg: optionalNum(30, 300),
  activityLevel: z.enum(ACTIVITY_LEVELS).optional(),
  shareBody: z.boolean().optional(),
  bio: optionalText(280),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const weighInSchema = z.object({
  date: localDate,
  weightKg: num(30, 300),
  note: optionalText(280),
  photoFileIds: z.array(id).max(4).default([]),
});
export type WeighInInput = z.infer<typeof weighInSchema>;

export const assessmentSchema = z
  .object({
    date: localDate,
    method: z.enum(ASSESSMENT_METHODS).default('bioimpedance'),
    professional: optionalText(80),
    weightKg: optionalNum(30, 300),
    bodyFatPct: optionalNum(2, 70),
    fatMassKg: optionalNum(1, 200),
    leanMassKg: optionalNum(15, 200),
    muscleMassKg: optionalNum(10, 150),
    visceralFat: optionalNum(1, 60),
    bodyWaterPct: optionalNum(20, 80),
    bmrKcal: optionalNum(600, 5000),
    waistCm: optionalNum(40, 200),
    hipCm: optionalNum(50, 200),
    chestCm: optionalNum(50, 200),
    armCm: optionalNum(15, 70),
    thighCm: optionalNum(25, 100),
    notes: optionalText(2000),
    fileIds: z.array(id).max(8).default([]),
  })
  .refine((a) => a.weightKg != null || a.bodyFatPct != null || a.leanMassKg != null || a.waistCm != null, {
    message: 'Informe pelo menos peso, % de gordura, massa magra ou cintura',
    path: ['weightKg'],
  })
  .refine((a) => !(a.weightKg != null && a.leanMassKg != null && a.leanMassKg > a.weightKg), { message: 'Massa magra maior que o peso', path: ['leanMassKg'] })
  .refine((a) => !(a.weightKg != null && a.fatMassKg != null && a.fatMassKg >= a.weightKg), { message: 'Massa gorda maior que o peso', path: ['fatMassKg'] });
export type AssessmentInput = z.infer<typeof assessmentSchema>;

export const photoSchema = z.object({
  fileId: id,
  date: localDate,
  caption: optionalText(280),
  visibility: z.enum(VISIBILITIES).default('private'),
});

/** Um alimento da refeição: da lista do app (foodId + gramas → macros) ou digitado à mão. */
export const dietFoodSchema = z.object({
  name: text(80).min(1, 'Dê um nome ao alimento'),
  foodId: z.string().max(40).nullable().optional(),
  /** Quantidade em gramas (ou ml) — usada para calcular os macros dos alimentos da lista. */
  grams: optionalNum(0, 5000),
  /** Como a pessoa escreveu a quantidade ("2 ovos", "1 concha"). */
  amount: optionalText(40),
  kcal: optionalNum(0, 10_000),
  proteinG: optionalNum(0, 1000),
  carbsG: optionalNum(0, 2000),
  fatG: optionalNum(0, 1000),
});
export type DietFoodInput = z.infer<typeof dietFoodSchema>;

export const dietMealSchema = z
  .object({
    name: text(60).min(1, 'Dê um nome à refeição'),
    time: optionalText(10),
    /** Texto livre (planos antigos e "o que o nutricionista escreveu"). */
    items: text(2000).default(''),
    foods: z.array(dietFoodSchema).max(40).default([]),
    notes: optionalText(500),
  })
  .refine((m) => m.items.length > 0 || m.foods.length > 0, { message: 'Adicione pelo menos um alimento na refeição', path: ['foods'] });
export type DietMealInput = z.infer<typeof dietMealSchema>;
export const dietPlanSchema = z.object({
  title: text(80).min(1, 'Dê um nome ao plano'),
  professional: optionalText(80),
  startDate: localDate.nullable().optional(),
  caloriesKcal: optionalNum(500, 8000),
  proteinG: optionalNum(0, 600),
  carbsG: optionalNum(0, 1500),
  fatG: optionalNum(0, 500),
  notes: optionalText(4000),
  active: z.boolean().default(true),
  meals: z.array(dietMealSchema).max(12).default([]),
  fileIds: z.array(id).max(8).default([]),
});
export type DietPlanInput = z.infer<typeof dietPlanSchema>;

export const eventSchema = z.object({
  title: text(80).min(1, 'Dê um título ao treino'),
  description: optionalText(1000),
  startsAt: z.iso.datetime({ offset: true }),
  durationMin: z.number().int().min(10).max(600).default(60),
  location: optionalText(120),
  kind: z.enum(ACTIVITY_KINDS).default('strength'),
  routineId: id.nullable().optional(),
});
export type EventInput = z.infer<typeof eventSchema>;

export const rsvpSchema = z.object({ status: z.enum(RSVP_STATUSES) });
export const checkInSchema = z.object({ attended: z.boolean() });

export const routineExerciseSchema = z.object({
  exerciseId: z.string().min(1).max(32),
  sets: z.number().int().min(1).max(20),
  reps: text(20).min(1),
  restSec: z.number().int().min(0).max(900).nullable().optional(),
  notes: optionalText(200),
});
export const routineSchema = z.object({
  name: text(60).min(1, 'Dê um nome à rotina'),
  description: optionalText(500),
  exercises: z.array(routineExerciseSchema).max(30).default([]),
});
export type RoutineInput = z.infer<typeof routineSchema>;

export const workoutLogSchema = z.object({
  date: localDate,
  kind: z.enum(ACTIVITY_KINDS).default('strength'),
  durationMin: z.number().int().min(5).max(600).nullable().optional(),
  routineId: id.nullable().optional(),
  notes: optionalText(500),
});

/** Uma série feita no assistente de treino. */
export const sessionSetSchema = z.object({
  weightKg: optionalNum(0, 1000),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  /** Para exercícios de tempo (prancha etc.). */
  durationSec: z.number().int().min(0).max(36_000).nullable().optional(),
  /** Descanso que veio depois desta série. */
  restSec: z.number().int().min(0).max(1800).nullable().optional(),
});
export const sessionExerciseSchema = z.object({
  exerciseId: z.string().min(1).max(32),
  sets: z.array(sessionSetSchema).min(1).max(30),
  notes: optionalText(200),
});
/** Treino feito no assistente (com as séries), salvo ao finalizar. Conta para a sequência. */
export const sessionSchema = z
  .object({
    title: text(60).min(1, 'Dê um nome ao treino'),
    routineId: id.nullable().optional(),
    kind: z.enum(ACTIVITY_KINDS).default('strength'),
    startedAt: z.iso.datetime({ offset: true }),
    finishedAt: z.iso.datetime({ offset: true }),
    notes: optionalText(500),
    exercises: z.array(sessionExerciseSchema).max(40).default([]),
  })
  .refine((s) => Date.parse(s.finishedAt) >= Date.parse(s.startedAt), { message: 'O fim precisa ser depois do início', path: ['finishedAt'] })
  .refine((s) => Date.parse(s.finishedAt) - Date.parse(s.startedAt) <= 12 * 3_600_000, { message: 'Treino longo demais (máx. 12 h)', path: ['finishedAt'] });
export type SessionInput = z.infer<typeof sessionSchema>;

export const announcementSchema = z.object({
  title: text(80).min(1, 'Escreva um título'),
  body: text(400).min(1, 'Escreva a mensagem'),
});
export const adminActivitySchema = z.object({ date: localDate, kind: z.enum(ACTIVITY_KINDS).default('other'), notes: optionalText(200) });

export const testResultSchema = z.object({
  testId: z.enum(TEST_IDS),
  date: localDate,
  value: z.number(),
  reps: z.number().int().min(1).max(12).nullable().optional(),
  notes: optionalText(280),
  fileId: id.nullable().optional(),
});
export type TestResultInput = z.infer<typeof testResultSchema>;

export const competitionSchema = z
  .object({
    name: text(60).min(1, 'Dê um nome à competição'),
    startDate: localDate,
    endDate: localDate,
    weights: z
      .object({ body: z.number().int().min(0).max(100), performance: z.number().int().min(0).max(100), consistency: z.number().int().min(0).max(100) })
      .default({ body: 50, performance: 30, consistency: 20 }),
    consistencyTargetPerWeek: z.number().int().min(1).max(7).default(3),
    /** Objetivo de quem cria (já entra na competição). Sem ele, usa o objetivo do perfil. */
    goal: z.enum(GOALS).optional(),
  })
  .refine((c) => c.startDate < c.endDate, { message: 'O fim precisa ser depois do início', path: ['endDate'] })
  .refine((c) => c.weights.body + c.weights.performance + c.weights.consistency > 0, { message: 'Algum peso precisa ser maior que zero', path: ['weights'] });
export type CompetitionInput = z.infer<typeof competitionSchema>;

export const joinCompetitionSchema = z.object({ goal: z.enum(GOALS) });

export const chatMessageSchema = z
  .object({ text: text(2000).default(''), fileId: id.nullable().optional() })
  .refine((m) => m.text.length > 0 || m.fileId, { message: 'Mensagem vazia', path: ['text'] });

export const fileKindSchema = z.enum(FILE_KINDS);
