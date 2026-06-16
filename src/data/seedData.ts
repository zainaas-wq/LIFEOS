import type {
  ScheduleEvent,
  Goal,
  SkillPlan,
  Rule,
  FocusSession,
  UserProfile,
  Course,
  Assignment,
  Exam,
  Topic,
  Project,
  Milestone,
  MemoryEntry,
} from '../types';

// ─── Deterministic IDs so seed data is stable across resets ───────────────────

// ── Date helpers ──────────────────────────────────────────────────────────────

const futureDate = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const pastDate = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

const pastISO = (days: number, hours = 10): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
};

const pastISOEnd = (days: number, hours = 11, mins = 30): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hours, mins, 0, 0);
  return d.toISOString();
};

// ─── Profile ──────────────────────────────────────────────────────────────────

export const SEED_PROFILE: UserProfile = {
  id:                  'seed-profile-1',
  name:                'Alex',
  mainFocus:           'Become a full-stack developer and finish my CS degree',
  biggestDistraction:  'Social media scrolling',
  habitToRemove:       'Checking phone first thing in the morning',
  habitToBuild:        'Deep work sessions before noon',
  seriousnessScore:    8,
  onboardingComplete:  true,
  isPro:               false,
  createdAt:           new Date().toISOString(),
  lifeRole:            'student',
  energyStyle:         'morning',
  workStyle:           'deep',
  selectedTrackTypes:  ['coding', 'study'],
  mainFrictions:       ['phone', 'social_media', 'sleep'],
  transformationDirection:
    'In 12 months I want to land a software engineering internship, complete my CS degree with a 3.5+ GPA, and ship two real projects that I\'m proud to show to recruiters.',
  language: 'en',
};

// ─── Schedule Events ──────────────────────────────────────────────────────────

export const SEED_SCHEDULE_EVENTS: ScheduleEvent[] = [
  {
    id: 'seed-ev-1', title: 'CS301 Lecture', start: '09:00', end: '10:30',
    category: 'class', location: 'Room 201', daysOfWeek: [1, 3],
    recurring: true, createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-ev-2', title: 'CS302 Lab', start: '14:00', end: '16:00',
    category: 'class', location: 'Lab B12', daysOfWeek: [2],
    recurring: true, createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-ev-3', title: 'Study Group — Algorithms', start: '16:00', end: '18:00',
    category: 'class', location: 'Library B2', daysOfWeek: [4],
    recurring: true, createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-ev-4', title: 'Gym Session', start: '07:00', end: '08:00',
    category: 'health', location: 'Campus Gym', daysOfWeek: [1, 3, 5],
    recurring: true, createdAt: new Date().toISOString(),
  },
];

// ─── Goals ────────────────────────────────────────────────────────────────────

export const SEED_GOALS: Goal[] = [
  {
    id: 'seed-goal-1', title: 'Master TypeScript & React Native',
    category: 'skill', priority: 1, weeklyHoursTarget: 10,
    linkedSkillPlanId: 'seed-sp-1', createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-goal-2', title: 'Finish Data Structures course with A grade',
    category: 'study', priority: 2, weeklyHoursTarget: 8,
    deadline: futureDate(45), createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-goal-3', title: 'Ship Portfolio Website by end of month',
    category: 'career', priority: 3, weeklyHoursTarget: 6,
    deadline: futureDate(21), createdAt: new Date().toISOString(),
  },
];

// ─── Skill Plans ──────────────────────────────────────────────────────────────

export const SEED_SKILL_PLANS: SkillPlan[] = [
  {
    id: 'seed-sp-1', title: 'TypeScript & React Native Mastery',
    level: 'intermediate', weeklyTargetHours: 10, goalId: 'seed-goal-1',
    steps: [
      { id: 'sp1-s1', title: 'TypeScript generics & utility types', completed: true, durationMinutes: 90 },
      { id: 'sp1-s2', title: 'React Native Animated API', completed: true, durationMinutes: 120 },
      { id: 'sp1-s3', title: 'Expo Router navigation patterns', completed: false, durationMinutes: 90 },
      { id: 'sp1-s4', title: 'Zustand state management', completed: false, durationMinutes: 60 },
      { id: 'sp1-s5', title: 'Build a real feature end-to-end', completed: false, durationMinutes: 180 },
    ],
    createdAt: new Date().toISOString(),
  },
];

// ─── Rules ────────────────────────────────────────────────────────────────────

export const SEED_RULES: Rule[] = [
  {
    id: 'seed-rule-1', title: 'No screens after 10 PM',
    enabled: true, type: 'screen', startTime: '22:00', endTime: '23:59',
    followedToday: false, createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-rule-2', title: 'Deep work block before noon',
    enabled: true, type: 'focus', startTime: '08:00', endTime: '12:00',
    followedToday: false, createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-rule-3', title: 'No social media until tasks done',
    enabled: true, type: 'screen',
    followedToday: false, createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-rule-4', title: 'Study session minimum 45 min',
    enabled: true, type: 'study',
    followedToday: true, createdAt: new Date().toISOString(),
  },
];

// ─── Focus Sessions ───────────────────────────────────────────────────────────

export const SEED_FOCUS_SESSIONS: FocusSession[] = [
  {
    id: 'seed-fs-1', goalId: 'seed-goal-1', durationMinutes: 90,
    start: pastISO(1, 9), end: pastISOEnd(1, 10, 30),
    notes: 'Finished TypeScript generics chapter. Utility types clicked today.',
  },
  {
    id: 'seed-fs-2', goalId: 'seed-goal-2', durationMinutes: 75,
    start: pastISO(2, 14), end: pastISOEnd(2, 15, 15),
    notes: 'Practiced BST insertion and deletion. Case 3 (two children) makes more sense now.',
  },
  {
    id: 'seed-fs-3', goalId: 'seed-goal-3', durationMinutes: 60,
    start: pastISO(3, 10), end: pastISOEnd(3, 11, 0),
    notes: 'Built the portfolio home page skeleton.',
  },
  {
    id: 'seed-fs-4', goalId: 'seed-goal-2', durationMinutes: 45,
    start: pastISO(5, 16), end: pastISOEnd(5, 16, 45),
    notes: 'Dynamic programming — Fibonacci with memoization.',
  },
  {
    id: 'seed-fs-5', goalId: 'seed-goal-1', durationMinutes: 120,
    start: pastISO(7, 9), end: pastISOEnd(7, 11, 0),
    notes: 'Built the Animated API animation sequence. Smooth interpolations working.',
  },
];

// ─── Student Intelligence — Courses ──────────────────────────────────────────

export const SEED_COURSES: Course[] = [
  {
    id:          'seed-course-1',
    name:        'Data Structures & Algorithms',
    code:        'CS301',
    creditHours: 3,
    color:       '#6C8EBF',
    createdAt:   new Date().toISOString(),
  },
  {
    id:          'seed-course-2',
    name:        'Operating Systems',
    code:        'CS401',
    creditHours: 3,
    color:       '#A78BFA',
    createdAt:   new Date().toISOString(),
  },
  {
    id:          'seed-course-3',
    name:        'Database Systems',
    code:        'CS302',
    creditHours: 3,
    color:       '#10B981',
    createdAt:   new Date().toISOString(),
  },
];

// ─── Topics (granular knowledge units) ───────────────────────────────────────

export const SEED_TOPICS: Topic[] = [
  // CS301 — Data Structures
  { id: 'seed-topic-1', courseId: 'seed-course-1', name: 'Binary Search Trees',    createdAt: new Date().toISOString() },
  { id: 'seed-topic-2', courseId: 'seed-course-1', name: 'Dynamic Programming',    createdAt: new Date().toISOString() },
  { id: 'seed-topic-3', courseId: 'seed-course-1', name: 'Graph Algorithms',       createdAt: new Date().toISOString() },
  { id: 'seed-topic-4', courseId: 'seed-course-1', name: 'Sorting Algorithms',     createdAt: new Date().toISOString() },
  // CS401 — Operating Systems
  { id: 'seed-topic-5', courseId: 'seed-course-2', name: 'Process Scheduling',     createdAt: new Date().toISOString() },
  { id: 'seed-topic-6', courseId: 'seed-course-2', name: 'Deadlock Detection',     createdAt: new Date().toISOString() },
  { id: 'seed-topic-7', courseId: 'seed-course-2', name: 'Virtual Memory & Paging',createdAt: new Date().toISOString() },
  // CS302 — Database Systems
  { id: 'seed-topic-8', courseId: 'seed-course-3', name: 'SQL Query Optimization', createdAt: new Date().toISOString() },
  { id: 'seed-topic-9', courseId: 'seed-course-3', name: 'ACID Transactions',      createdAt: new Date().toISOString() },
];

// ─── Assignments ──────────────────────────────────────────────────────────────

export const SEED_ASSIGNMENTS: Assignment[] = [
  {
    id: 'seed-asgn-1', courseId: 'seed-course-1',
    title: 'Binary Search Tree implementation', type: 'project',
    dueDate: futureDate(5), priority: 'high', completed: false,
    estimatedMins: 180, createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-asgn-2', courseId: 'seed-course-1',
    title: 'Big-O analysis problem set', type: 'homework',
    dueDate: futureDate(2), priority: 'medium', completed: false,
    estimatedMins: 60, createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-asgn-3', courseId: 'seed-course-2',
    title: 'Process scheduling simulator', type: 'project',
    dueDate: futureDate(12), priority: 'medium', completed: false,
    estimatedMins: 240, createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-asgn-4', courseId: 'seed-course-3',
    title: 'ER diagram — University database', type: 'homework',
    dueDate: futureDate(3), priority: 'high', completed: false,
    estimatedMins: 90, createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-asgn-5', courseId: 'seed-course-1',
    title: 'Graph traversal (BFS + DFS) worksheet', type: 'homework',
    dueDate: pastDate(1), priority: 'medium', completed: true,
    estimatedMins: 45, createdAt: new Date().toISOString(),
  },
];

// ─── Exams ────────────────────────────────────────────────────────────────────

export const SEED_EXAMS: Exam[] = [
  {
    id:        'seed-exam-1',
    courseId:  'seed-course-1',
    title:     'Midterm — Sorting & Tree Algorithms',
    date:      futureDate(14),
    topics:    ['Quicksort', 'Merge sort', 'BST', 'AVL trees', 'Heap'],
    type:      'midterm',
    createdAt: new Date().toISOString(),
  },
  {
    id:        'seed-exam-2',
    courseId:  'seed-course-2',
    title:     'Final — Process & Memory Management',
    date:      futureDate(30),
    topics:    ['Scheduling', 'Deadlocks', 'Virtual memory', 'Paging'],
    type:      'final',
    createdAt: new Date().toISOString(),
  },
  {
    // 5 days away — triggers CRITICAL academic risk
    id:        'seed-exam-3',
    courseId:  'seed-course-3',
    title:     'Midterm — SQL & Relational Algebra',
    date:      futureDate(5),
    topics:    ['SQL joins', 'Relational algebra', 'Normalization', 'ACID'],
    type:      'midterm',
    createdAt: new Date().toISOString(),
  },
];

// ─── Projects ─────────────────────────────────────────────────────────────────

export const SEED_PROJECTS: Project[] = [
  {
    // Healthy project — good progress, upcoming deadline
    id:          'seed-proj-1',
    title:       'Portfolio Website',
    description: 'Personal developer portfolio with project showcase and blog.',
    status:      'active',
    color:       '#6C8EBF',
    goalId:      'seed-goal-3',
    deadline:    futureDate(21),
    createdAt:   new Date(Date.now() - 8 * 86_400_000).toISOString(),
    updatedAt:   new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    // New project — just started
    id:          'seed-proj-2',
    title:       'Algorithm Visualizer',
    description: 'Interactive web app to visualize sorting and graph algorithms.',
    status:      'active',
    color:       '#C9A84C',
    createdAt:   new Date(Date.now() - 2 * 86_400_000).toISOString(),
    updatedAt:   new Date(Date.now() - 1 * 86_400_000).toISOString(),
  },
  {
    // AT-RISK project — has a blocked milestone, longer deadline
    id:          'seed-proj-3',
    title:       'CampusHub — Student Portal',
    description: 'Full-stack student portal with course management, events, and social feed.',
    status:      'active',
    color:       '#F87171',
    deadline:    futureDate(45),
    createdAt:   new Date(Date.now() - 20 * 86_400_000).toISOString(),
    updatedAt:   new Date(Date.now() - 4 * 86_400_000).toISOString(),
  },
];

// ─── Milestones ───────────────────────────────────────────────────────────────

export const SEED_MILESTONES: Milestone[] = [
  // ── Portfolio Website ─────────────────────────────────────────────────────
  {
    id: 'seed-ms-1', projectId: 'seed-proj-1', title: 'Design & wireframes',
    status: 'completed', order: 0,
    completedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    createdAt:   new Date(Date.now() - 8 * 86_400_000).toISOString(),
  },
  {
    id: 'seed-ms-2', projectId: 'seed-proj-1', title: 'Home page & about section',
    status: 'completed', order: 1,
    completedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    createdAt:   new Date(Date.now() - 8 * 86_400_000).toISOString(),
  },
  {
    id: 'seed-ms-3', projectId: 'seed-proj-1', title: 'Projects showcase section',
    status: 'in_progress', order: 2, dueDate: futureDate(7), estimatedHours: 6,
    createdAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
  },
  {
    id: 'seed-ms-4', projectId: 'seed-proj-1', title: 'Deploy to Vercel + custom domain',
    status: 'pending', order: 3, dueDate: futureDate(14), estimatedHours: 2,
    createdAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
  },

  // ── Algorithm Visualizer ──────────────────────────────────────────────────
  {
    id: 'seed-ms-5', projectId: 'seed-proj-2', title: 'Set up React + Vite project',
    status: 'completed', order: 0,
    completedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    createdAt:   new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    id: 'seed-ms-6', projectId: 'seed-proj-2', title: 'Implement bubble sort visualization',
    status: 'pending', order: 1, estimatedHours: 4,
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    id: 'seed-ms-7', projectId: 'seed-proj-2', title: 'Add graph traversal (BFS/DFS)',
    status: 'pending', order: 2, estimatedHours: 8,
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },

  // ── CampusHub ─────────────────────────────────────────────────────────────
  {
    id: 'seed-ms-8', projectId: 'seed-proj-3', title: 'System architecture + DB schema',
    status: 'completed', order: 0,
    completedAt: new Date(Date.now() - 18 * 86_400_000).toISOString(),
    createdAt:   new Date(Date.now() - 20 * 86_400_000).toISOString(),
  },
  {
    id: 'seed-ms-9', projectId: 'seed-proj-3', title: 'Authentication (Supabase Auth)',
    status: 'completed', order: 1,
    completedAt: new Date(Date.now() - 12 * 86_400_000).toISOString(),
    createdAt:   new Date(Date.now() - 20 * 86_400_000).toISOString(),
  },
  {
    id: 'seed-ms-10', projectId: 'seed-proj-3', title: 'Course enrollment flow',
    status: 'in_progress', order: 2, dueDate: futureDate(10), estimatedHours: 12,
    createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  },
  {
    // BLOCKED milestone — triggers AT-RISK health score
    id: 'seed-ms-11', projectId: 'seed-proj-3',
    title: 'Email notification system',
    status: 'blocked', order: 3, estimatedHours: 8,
    notes: 'Blocked on: email provider API keys not yet provisioned. Waiting on team.',
    createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  },
  {
    id: 'seed-ms-12', projectId: 'seed-proj-3', title: 'Student events feed & RSVP',
    status: 'pending', order: 4, estimatedHours: 16,
    createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  },
];

// ─── Memories ─────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

export const SEED_MEMORIES: MemoryEntry[] = [
  // ── Project notes ─────────────────────────────────────────────────────────
  {
    id:              'seed-mem-1',
    title:           'Algorithm Visualizer — architecture decision: React + Vite over Next.js',
    content:
      'Chose React with Vite instead of Next.js because this is a purely client-side animation app with no server-side data requirements. Vite gives faster HMR for tight animation feedback loops. Considered Three.js for 3D visualizations but decided 2D SVG is cleaner for algorithm education.',
    source:          'knowledge',
    tags:            ['react', 'vite', 'algorithm-visualizer', 'architecture'],
    linkedProjectId: 'seed-proj-2',
    createdAt:       new Date(Date.now() - 1 * 86_400_000).toISOString(),
    updatedAt:       new Date(Date.now() - 1 * 86_400_000).toISOString(),
  },
  {
    id:              'seed-mem-2',
    title:           'Portfolio — dark theme + gold accent design system rationale',
    content:
      'Went with dark background (#0D0D0D) and gold (#C9A84C) accent to stand out from typical dev portfolios. Inspired by Bloomberg Terminal aesthetic — serious and focused. Used Tailwind CSS for rapid iteration. Avoided heavy animations that slow perceived load time.',
    source:          'knowledge',
    tags:            ['portfolio', 'design', 'tailwind', 'dark-theme'],
    linkedProjectId: 'seed-proj-1',
    linkedMilestoneId: 'seed-ms-1',
    createdAt:       new Date(Date.now() - 6 * 86_400_000).toISOString(),
    updatedAt:       new Date(Date.now() - 6 * 86_400_000).toISOString(),
  },
  {
    id:              'seed-mem-3',
    title:           'CampusHub — email provider blocked by missing API keys',
    content:
      'Email notification milestone is blocked because the SMTP provider (SendGrid) API keys need to be provisioned by the university IT team. Submitted request 4 days ago — follow up Thursday. Meanwhile, continue with course enrollment flow which is unblocked.',
    source:          'note',
    tags:            ['campushub', 'blocker', 'email', 'sendgrid'],
    linkedProjectId:   'seed-proj-3',
    linkedMilestoneId: 'seed-ms-11',
    createdAt:       new Date(Date.now() - 4 * 86_400_000).toISOString(),
    updatedAt:       new Date(Date.now() - 4 * 86_400_000).toISOString(),
  },

  // ── Study notes ───────────────────────────────────────────────────────────
  {
    id:            'seed-mem-4',
    title:         'Dynamic Programming: memoization vs tabulation',
    content:
      'Memoization (top-down): recursive + cache — easier to write, only computes needed subproblems. Tabulation (bottom-up): iterative, fills entire table from base case — better space, no call stack risk. Use memoization for exploratory problems, tabulation for production. Key interview insight: both are O(n) for Fibonacci, but tabulation is more predictable.',
    source:        'knowledge',
    tags:          ['algorithms', 'dynamic-programming', 'cs301', 'interview'],
    linkedTopicId: 'seed-topic-2',
    createdAt:     new Date(Date.now() - 3 * 86_400_000).toISOString(),
    updatedAt:     new Date(Date.now() - 3 * 86_400_000).toISOString(),
  },
  {
    id:              'seed-mem-5',
    title:           'BST deletion — the three cases',
    content:
      'Case 1: leaf node — just remove. Case 2: one child — replace node with child, update parent pointer. Case 3: two children — replace with in-order successor (smallest value in right subtree), then delete the successor from its original position. Most exam questions test Case 3. Remember: in-order successor is always a leaf or has one right child.',
    source:          'note',
    tags:            ['bst', 'algorithms', 'cs301', 'exam-prep'],
    linkedTopicId:   'seed-topic-1',
    linkedCourseId:  'seed-course-1',
    createdAt:       new Date(Date.now() - 2 * 86_400_000).toISOString(),
    updatedAt:       new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    id:            'seed-mem-6',
    title:         'SQL vs NoSQL — when to use which (DB midterm prep)',
    content:
      'SQL: structured data with relationships, ACID transactions required, schema-on-write, vertical scaling. NoSQL: unstructured/semi-structured data, eventual consistency acceptable, schema-on-read, horizontal scaling. For the DB midterm: know that ACID = Atomicity, Consistency, Isolation, Durability. Isolation levels: READ UNCOMMITTED < READ COMMITTED < REPEATABLE READ < SERIALIZABLE.',
    source:        'knowledge',
    tags:          ['sql', 'nosql', 'cs302', 'database', 'exam-prep', 'acid'],
    linkedTopicId: 'seed-topic-9',
    linkedCourseId:'seed-course-3',
    createdAt:     new Date(Date.now() - 1 * 86_400_000).toISOString(),
    updatedAt:     new Date(Date.now() - 1 * 86_400_000).toISOString(),
  },

  // ── AI Insights ───────────────────────────────────────────────────────────
  {
    id:      'seed-mem-7',
    title:   'AI Insight: your Graph Algorithms knowledge is weakest',
    content:
      'Based on your study notes and focus sessions, Graph Algorithms (BFS, DFS, Dijkstra, Bellman-Ford) has the lowest memory density of all your CS301 topics. With the midterm in 14 days, this is your highest-leverage study area. Recommend 2 sessions this week specifically on shortest-path algorithms.',
    source:  'ai_insight',
    tags:    ['graph-algorithms', 'cs301', 'weakness', 'recommendation'],
    linkedTopicId: 'seed-topic-3',
    createdAt: new Date(Date.now() - 12 * 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 3600_000).toISOString(),
  },
  {
    id:      'seed-mem-8',
    title:   'Reflection: productive week but DB exam snuck up on me',
    content:
      'This week I focused heavily on the portfolio project and neglected CS302 entirely. The DB midterm is in 5 days and I haven\'t reviewed SQL joins or normalization. Need to shift priorities: portfolio can wait, exam cannot. Tomorrow morning session: SQL query optimization.',
    source:  'reflection',
    tags:    ['reflection', 'planning', 'cs302', 'db-exam', 'priority-shift'],
    linkedCourseId: 'seed-course-3',
    createdAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
  },
];
