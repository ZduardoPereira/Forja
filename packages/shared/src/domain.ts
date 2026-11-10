/** Vocabulário do FORJA. Valores (estáveis) vão para o banco; rótulos são da interface. */

export const GOALS = ['lose_fat', 'gain_muscle', 'recomp', 'performance'] as const;
export type Goal = (typeof GOALS)[number];
export const GOAL_LABELS: Record<Goal, string> = {
  lose_fat: 'Emagrecer',
  gain_muscle: 'Ganhar massa',
  recomp: 'Recomposição',
  performance: 'Performance',
};
export const GOAL_HINTS: Record<Goal, string> = {
  lose_fat: 'Perder gordura preservando massa magra.',
  gain_muscle: 'Ganhar massa magra sem acumular muita gordura.',
  recomp: 'Perder gordura e ganhar músculo ao mesmo tempo.',
  performance: 'Foco nos testes físicos; o corpo não pontua.',
};

export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];
export const SEX_LABELS: Record<Sex, string> = { male: 'Masculino', female: 'Feminino' };

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];
export const EXPERIENCE_LABELS: Record<Experience, string> = {
  beginner: 'Iniciante (até 1 ano)',
  intermediate: 'Intermediário (1–3 anos)',
  advanced: 'Avançado (3+ anos)',
};

export const ACTIVITY_KINDS = ['strength', 'run', 'functional', 'sport', 'other'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  strength: 'Musculação',
  run: 'Corrida',
  functional: 'Funcional',
  sport: 'Esporte',
  other: 'Outro',
};

export const RSVP_STATUSES = ['going', 'maybe', 'not_going'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];
export const RSVP_LABELS: Record<RsvpStatus, string> = { going: 'Vou', maybe: 'Talvez', not_going: 'Não vou' };

export const ASSESSMENT_METHODS = ['bioimpedance', 'skinfold', 'dexa', 'smart_scale', 'other'] as const;
export type AssessmentMethod = (typeof ASSESSMENT_METHODS)[number];
export const ASSESSMENT_METHOD_LABELS: Record<AssessmentMethod, string> = {
  bioimpedance: 'Bioimpedância',
  skinfold: 'Dobras cutâneas',
  dexa: 'DEXA',
  smart_scale: 'Balança inteligente',
  other: 'Outro',
};

export const VISIBILITIES = ['private', 'group'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const VISIBILITY_LABELS: Record<Visibility, string> = { private: 'Só eu', group: 'Grupo' };

export const FILE_KINDS = ['avatar', 'body', 'assessment', 'diet', 'chat', 'test'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

// ---------------------------------------------------------------------------
// Vocabulário do catálogo openGym (inglês) → português
// ---------------------------------------------------------------------------

export const BODY_PART_LABELS: Record<string, string> = {
  back: 'Costas',
  cardio: 'Cardio',
  chest: 'Peito',
  'full body': 'Corpo inteiro',
  'lower arms': 'Antebraços',
  'lower legs': 'Panturrilhas',
  neck: 'Pescoço',
  shoulders: 'Ombros',
  'upper arms': 'Braços',
  'upper legs': 'Pernas',
  waist: 'Abdômen',
};

export const EQUIPMENT_LABELS: Record<string, string> = {
  'body weight': 'Peso corporal',
  band: 'Elástico',
  'resistance band': 'Faixa elástica',
  cable: 'Polia',
  'leverage machine': 'Máquina',
  'smith machine': 'Smith',
  'sled machine': 'Leg press / trenó',
  assisted: 'Assistido',
  'medicine ball': 'Medicine ball',
  'stability ball': 'Bola suíça',
  barbell: 'Barra',
  'olympic barbell': 'Barra olímpica',
  'ez barbell': 'Barra W',
  'trap bar': 'Barra hexagonal',
  rope: 'Corda',
  dumbbell: 'Halteres',
  kettlebell: 'Kettlebell',
  weighted: 'Com carga',
  'bosu ball': 'Bosu',
  'wheel roller': 'Roda abdominal',
  landmine: 'Landmine',
  'weight plate': 'Anilha',
  sandbag: 'Saco de areia',
  macebell: 'Macebell',
  'suspension trainer': 'TRX / suspensão',
  roller: 'Rolo',
  hammer: 'Marreta',
  'stationary bike': 'Bicicleta ergométrica',
  'upper body ergometer': 'Ergômetro de braço',
  'elliptical machine': 'Elíptico',
  'skierg machine': 'SkiErg',
  'stepmill machine': 'Escada',
  tire: 'Pneu',
  'massage ball': 'Bola de massagem',
};

export const MUSCLE_LABELS: Record<string, string> = {
  abs: 'Abdômen',
  obliques: 'Oblíquos',
  biceps: 'Bíceps',
  lats: 'Dorsais',
  pectorals: 'Peitorais',
  hamstrings: 'Posteriores',
  triceps: 'Tríceps',
  quads: 'Quadríceps',
  'upper back': 'Costas (superior)',
  glutes: 'Glúteos',
  delts: 'Deltoides',
  'serratus anterior': 'Serrátil',
  forearms: 'Antebraços',
  calves: 'Panturrilhas',
  traps: 'Trapézio',
  adductors: 'Adutores',
  abductors: 'Abdutores',
  'levator scapulae': 'Elevador da escápula',
  'cardiovascular system': 'Sistema cardiovascular',
  spine: 'Lombar / coluna',
  'hip flexors': 'Flexores do quadril',
  shins: 'Tibiais',
  shoulders: 'Ombros',
  chest: 'Peito',
  back: 'Costas',
  core: 'Core',
};

export const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Força',
  calisthenics: 'Calistenia',
  mobility: 'Mobilidade',
  olympic: 'Olímpico',
  plyometrics: 'Pliometria',
  cardio: 'Cardio',
  isometric: 'Isometria',
  yoga: 'Yoga',
  stretching: 'Alongamento',
  pilates: 'Pilates',
  rehab: 'Reabilitação',
  combat: 'Luta',
};

export const label = (map: Record<string, string>, key: string | null | undefined): string => (key ? (map[key] ?? key) : '—');
