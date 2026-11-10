/**
 * Visual minimalista: neutros (zinco), um único destaque violeta e muito espaço.
 * Botão principal é "invertido" (claro no tema escuro, escuro no claro).
 * Cores de gráfico validadas (dataviz validate_palette) em cada tema.
 */
export interface Colors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  danger: string;
  warning: string;
  chart1: string;
  chart2: string;
  grid: string;
}

export const dark: Colors = {
  bg: '#0A0A0B',
  surface: '#141416',
  surfaceAlt: '#1C1C1F',
  border: '#27272A',
  text: '#FAFAFA',
  textMuted: '#A1A1AA',
  textFaint: '#71717A',
  primary: '#FAFAFA',
  onPrimary: '#0A0A0B',
  accent: '#8B7CF6',
  accentSoft: 'rgba(139,124,246,0.16)',
  onAccent: '#0A0A0B',
  success: '#4ADE80',
  danger: '#F87171',
  warning: '#FBBF24',
  chart1: '#8B7CF6',
  chart2: '#1FA594',
  grid: '#232327',
};

export const light: Colors = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F5',
  border: '#E4E4E7',
  text: '#09090B',
  textMuted: '#52525B',
  textFaint: '#A1A1AA',
  primary: '#09090B',
  onPrimary: '#FAFAFA',
  accent: '#6D5DF0',
  accentSoft: 'rgba(109,93,240,0.10)',
  onAccent: '#FFFFFF',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#B45309',
  chart1: '#6D5DF0',
  chart2: '#0F9D8A',
  grid: '#EFEFF1',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const type = {
  display: { fontFamily: font.bold, fontSize: 30, letterSpacing: -0.8, lineHeight: 36 },
  title: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.3, lineHeight: 26 },
  heading: { fontFamily: font.semibold, fontSize: 16, letterSpacing: -0.1, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.medium, fontSize: 11, letterSpacing: 0.6, lineHeight: 14, textTransform: 'uppercase' as const },
  metric: { fontFamily: font.semibold, fontSize: 28, letterSpacing: -0.8, lineHeight: 32 },
} as const;
export type TypeVariant = keyof typeof type;

/** Largura a partir da qual o app usa barra lateral (PC / tablet). */
export const WIDE = 900;
export const CONTENT_MAX = 880;
