export const Colors = {
  background: '#0A0A0A',
  surface: '#111111',
  surfaceElevated: '#1A1A1A',
  surfaceHigh: '#222222',
  border: 'rgba(255,255,255,0.05)',
  borderLight: '#333333',

  gold: '#C9A84C',
  goldLight: '#E8C87A',
  goldDim: '#8A6E2F',
  goldMuted: 'rgba(201, 168, 76, 0.15)',

  purple: '#9D4EDD',
  purpleLight: '#C77DFF',
  purpleMuted: 'rgba(157, 78, 221, 0.15)',

  textPrimary: '#F0F0F0',
  textSecondary: '#888888',
  textMuted: '#555555',
  textInverse: '#0A0A0A',

  success: '#4ADE80',
  successMuted: 'rgba(74, 222, 128, 0.12)',
  error: '#F87171',
  errorMuted: 'rgba(248, 113, 113, 0.12)',
  warning: '#FBBF24',

  // ── Recovery palette — calm, non-stressful ────────────────────────────────
  // Used for recovery/meal/recharge blocks in the timeline and Command Strip.
  // Intentionally softer than the gold/error primary palette.

  /** Soft steel-blue — used for meal_recovery and general rest blocks */
  recovery: '#4A90B8',
  recoveryMuted: 'rgba(74, 144, 184, 0.15)',
  recoveryDim: 'rgba(74, 144, 184, 0.35)',

  /** Warm amber — distinct from gold, used for meal break label */
  meal: '#C97E3A',
  mealMuted: 'rgba(201, 126, 58, 0.15)',

  /** Soft teal — recharge breaks after demanding sessions */
  recharge: '#3AB8A0',
  rechargeMuted: 'rgba(58, 184, 160, 0.15)',

  /** Soft lavender — reward breaks after critical completions */
  reward: '#9B7EC8',
  rewardMuted: 'rgba(155, 126, 200, 0.15)',

  overlay: 'rgba(0,0,0,0.6)',
  transparent: 'transparent',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 42,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  gold: {
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  purple: {
    shadowColor: '#9D4EDD',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;
