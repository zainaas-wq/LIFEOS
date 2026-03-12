/**
 * Shared constants for Plan tab section components.
 * Mirrors onboarding data — keep in sync if onboarding options change.
 */

export type PlanSection = 'today' | 'tracks' | 'month' | 'friction' | 'schedule';

export const PLAN_SECTIONS: Array<{ id: PlanSection; label: string }> = [
  { id: 'today',    label: 'Today' },
  { id: 'tracks',   label: 'Tracks' },
  { id: 'month',    label: '30-Day' },
  { id: 'friction', label: 'Friction' },
  { id: 'schedule', label: 'Schedule' },
];

export const TRACK_LABELS: Record<string, string> = {
  coding:        'Coding',
  fitness:       'Fitness',
  music:         'Music',
  language:      'Language',
  reading:       'Reading',
  writing:       'Writing',
  career:        'Career',
  business:      'Business',
  health:        'Health',
  creative:      'Creativity',
  relationships: 'Relationships',
  mindfulness:   'Mindfulness',
};

export const FRICTION_LABELS: Record<string, string> = {
  phone:           'Phone & notifications',
  social_media:    'Social media',
  procrastination: 'Procrastination',
  noise:           'Noise & environment',
  fatigue:         'Fatigue & low energy',
  lack_of_clarity: 'Lack of clarity',
  people:          'People & interruptions',
  overthinking:    'Overthinking',
};

export const CATEGORY_COLOR: Record<string, string> = {
  study:  '#6C8EBF',
  skill:  '#C9A84C', // Colors.gold — avoid importing Colors here to keep this file dependency-free
  health: '#4ADE80',
  life:   '#F472B6',
  career: '#A78BFA',
};
