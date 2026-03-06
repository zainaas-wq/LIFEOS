import type {
  ScheduleEvent,
  Goal,
  SkillPlan,
  Rule,
  FocusSession,
  UserProfile,
} from '../types';

// ─── Deterministic IDs so seed data is stable across resets ───────────────────

export const SEED_PROFILE: UserProfile = {
  id: 'seed-profile-1',
  name: 'Alex',
  mainFocus: 'Become a full-stack developer',
  biggestDistraction: 'Social media scrolling',
  habitToRemove: 'Checking phone first thing in the morning',
  habitToBuild: 'Deep work sessions before noon',
  seriousnessScore: 8,
  onboardingComplete: true,
  isPro: false,
  createdAt: new Date().toISOString(),
};

export const SEED_SCHEDULE_EVENTS: ScheduleEvent[] = [
  {
    id: 'seed-ev-1',
    title: 'Morning Lecture',
    start: '09:00',
    end: '10:30',
    category: 'class',
    location: 'Room 201',
    daysOfWeek: [1, 3], // Mon, Wed
    recurring: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-ev-2',
    title: 'Gym Session',
    start: '07:00',
    end: '08:00',
    category: 'health',
    location: 'Campus Gym',
    daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
    recurring: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-ev-3',
    title: 'Study Group',
    start: '14:00',
    end: '16:00',
    category: 'class',
    location: 'Library B2',
    daysOfWeek: [2, 4], // Tue, Thu
    recurring: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-ev-4',
    title: 'Team Standup',
    start: '10:00',
    end: '10:30',
    category: 'work',
    location: 'Online',
    daysOfWeek: [1, 2, 3, 4, 5], // Weekdays
    recurring: true,
    createdAt: new Date().toISOString(),
  },
];

export const SEED_GOALS: Goal[] = [
  {
    id: 'seed-goal-1',
    title: 'Master TypeScript & React Native',
    category: 'skill',
    priority: 1,
    weeklyHoursTarget: 10,
    linkedSkillPlanId: 'seed-sp-1',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-goal-2',
    title: 'Finish Algorithms Course',
    category: 'study',
    priority: 2,
    weeklyHoursTarget: 6,
    deadline: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 60);
      return d.toISOString().split('T')[0];
    })(),
    createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-goal-3',
    title: 'Run 5k without stopping',
    category: 'health',
    priority: 3,
    weeklyHoursTarget: 3,
    deadline: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 90);
      return d.toISOString().split('T')[0];
    })(),
    createdAt: new Date().toISOString(),
  },
];

export const SEED_SKILL_PLANS: SkillPlan[] = [
  {
    id: 'seed-sp-1',
    title: 'TypeScript & React Native Mastery',
    level: 'intermediate',
    weeklyTargetHours: 10,
    goalId: 'seed-goal-1',
    steps: [
      { id: 'sp1-s1', title: 'TypeScript generics & utility types', completed: true, durationMinutes: 90 },
      { id: 'sp1-s2', title: 'React Native Animated API deep dive', completed: true, durationMinutes: 120 },
      { id: 'sp1-s3', title: 'Expo Router navigation patterns', completed: false, durationMinutes: 90 },
      { id: 'sp1-s4', title: 'Zustand state management patterns', completed: false, durationMinutes: 60 },
      { id: 'sp1-s5', title: 'Build a real feature end-to-end', completed: false, durationMinutes: 180 },
    ],
    createdAt: new Date().toISOString(),
  },
];

export const SEED_RULES: Rule[] = [
  {
    id: 'seed-rule-1',
    title: 'No screens after 9 PM',
    enabled: true,
    type: 'screen',
    startTime: '21:00',
    endTime: '23:59',
    followedToday: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-rule-2',
    title: 'Deep work block before noon',
    enabled: true,
    type: 'focus',
    startTime: '08:00',
    endTime: '12:00',
    followedToday: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-rule-3',
    title: 'No social media until tasks done',
    enabled: true,
    type: 'screen',
    followedToday: false,
    createdAt: new Date().toISOString(),
  },
];

export const SEED_FOCUS_SESSIONS: FocusSession[] = [
  {
    id: 'seed-fs-1',
    start: (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    })(),
    end: (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      d.setHours(10, 30, 0, 0);
      return d.toISOString();
    })(),
    goalId: 'seed-goal-1',
    durationMinutes: 90,
    notes: 'Finished TypeScript generics chapter',
  },
  {
    id: 'seed-fs-2',
    start: (() => {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      d.setHours(14, 0, 0, 0);
      return d.toISOString();
    })(),
    end: (() => {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      d.setHours(15, 0, 0, 0);
      return d.toISOString();
    })(),
    goalId: 'seed-goal-2',
    durationMinutes: 60,
  },
];
