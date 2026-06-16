import type {
  ChatMessage, Goal, SkillPlan, Rule, ScheduleEvent, Plan, FocusSession,
  MemoryEntry, AgentType, DailyReflection, GoalIntelligence,
  Course, Assignment, Exam, Topic, Project, Milestone,
} from '../types';

// ─── Context passed to every AI call ─────────────────────────────────────────

export interface AIContext {
  goals:               Goal[];
  skillPlans:          SkillPlan[];
  rules:               Rule[];
  scheduleEvents:      ScheduleEvent[];
  mainFocus?:          string;
  biggestDistraction?: string;
  fixedScheduleStart?: string;
  fixedScheduleEnd?:   string;
  focusSessions?:      FocusSession[];
  currentPlan?:        Plan;
  todayDate:           string;
  memories?:           MemoryEntry[];
  // Phase A: full context for agent routing
  reflections?:        DailyReflection[];
  goalIntelligence?:   Record<string, GoalIntelligence>;
  courses?:            Course[];
  assignments?:        Assignment[];
  exams?:              Exam[];
  projects?:           Project[];
  milestones?:         Milestone[];
  distractionCount?:   number;
  energyStyle?:        string;
  workStyle?:          string;
  // Phase B: academic intelligence
  courseReadiness?:    Record<string, import('./readinessEngine').CourseReadiness>;
  academicRisks?:      import('./academicRiskEngine').AcademicRisk[];
  // Phase B.5: topic intelligence
  topics?:             Topic[];
  topicWeakness?:      Record<string, import('./weaknessEngine').TopicWeakness>;
  // Phase C: project intelligence
  projectIntelligence?: Record<string, import('./projectIntelligenceEngine').ProjectIntelligence>;
  projectRisks?:        import('./projectIntelligenceEngine').ProjectRisk[];
}

// ─── Agent-type detection ─────────────────────────────────────────────────────

export function detectAgentType(message: string, hasMemories: boolean): AgentType {
  const m = message.toLowerCase();
  if (
    hasMemories &&
    /\b(remember|recall|learned|where did|what did i (learn|write|note|store)|find.*note|my note|memory)\b/.test(m)
  ) return 'memory';
  if (/\b(plan|schedule|organize|prioritiz|calendar|daily|weekly|today)\b/.test(m)) return 'planning';
  if (/\b(study|learn|exam|course|quiz|flashcard|lecture|assignment|weak|topic)\b/.test(m)) return 'learning';
  if (/\b(project|milestone|blocker|blocked|sprint|build|ship|deadline|velocity|stalled|release|feature|bug|implement|architect)\b/.test(m)) return 'builder';
  if (/\b(focus|distract|habit|productivity|deep work|session|procrastin|energy)\b/.test(m)) return 'productivity';
  return 'life';
}

// ─── Abstract interface ───────────────────────────────────────────────────────

export interface AIClient {
  /** Send a user message and get an assistant reply. */
  chat(userMessage: string, history: ChatMessage[], context: AIContext): Promise<ChatMessage>;
  /** Directly generate a daily plan without a chat turn. */
  generateDailyPlan(date: string, context: AIContext): Promise<Plan>;
  /** Directly generate a weekly plan. */
  generateWeeklyPlan(startDate: string, context: AIContext): Promise<Plan>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export type ClientMode = 'local' | 'backend';

let _client: AIClient | null = null;

export function getAIClient(mode: ClientMode = 'local'): AIClient {
  if (_client) return _client;
  const { LocalAIClient } = require('./LocalAIClient');
  _client = new LocalAIClient();
  return _client!;
}

/** Reset the singleton (useful in tests or when switching modes). */
export function resetAIClient(): void {
  _client = null;
}
