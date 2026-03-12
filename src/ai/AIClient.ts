import type { ChatMessage, Goal, SkillPlan, Rule, ScheduleEvent, Plan, FocusSession } from '../types';

// ─── Context passed to every AI call ─────────────────────────────────────────

export interface AIContext {
  goals: Goal[];
  skillPlans: SkillPlan[];
  rules: Rule[];
  scheduleEvents: ScheduleEvent[];
  mainFocus?: string;
  biggestDistraction?: string;
  fixedScheduleStart?: string; // HH:MM — planning window start
  fixedScheduleEnd?: string;   // HH:MM — planning window end
  focusSessions?: FocusSession[];
  currentPlan?: Plan;
  todayDate: string; // YYYY-MM-DD
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

export type ClientMode = 'local' | 'remote';

let _client: AIClient | null = null;

export function getAIClient(mode: ClientMode = 'local', apiKey?: string): AIClient {
  if (_client) return _client;

  if (mode === 'remote' && apiKey) {
    // Lazy import to avoid bundling RemoteAIClient when not needed
    const { RemoteAIClient } = require('./RemoteAIClient');
    _client = new RemoteAIClient(apiKey);
  } else {
    const { LocalAIClient } = require('./LocalAIClient');
    _client = new LocalAIClient();
  }

  return _client!;
}

/** Reset the singleton (useful in tests or when switching modes). */
export function resetAIClient(): void {
  _client = null;
}
