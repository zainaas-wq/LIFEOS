import type { ChatMessage, Goal, SkillPlan, Rule, ScheduleEvent, Plan, FocusSession, RecoveryMode } from '../types';
import type { PredictedRiskType } from './predictiveEngine';
import type { AIRequestMode, ContextDepth } from './orchestrationEngine';

// ─── Context passed to every AI call ─────────────────────────────────────────

/**
 * Review-derived coaching signals injected into every AI context call.
 * Populated by useAIContext() from computeAdaptationHints().
 * All fields are optional so callers without review history still type-check.
 */
export interface ReviewSignalSummary {
  /** systemTakeaway values from the last 1–3 reviews (most recent first). */
  recentPatterns: string[];
  /** Human-readable rationale for any active planning adaptations. */
  adaptationRationale: string;
  /** Recovery modes ranked by past effectiveness for this user. */
  preferredRecoveryModes: RecoveryMode[];
  /** Total number of saved daily reviews in local store. */
  reviewCount: number;
}

/**
 * A single predicted drift risk — shape subset of DriftPrediction,
 * safe to embed in AIContext without importing the full engine type.
 */
export interface PredictedRiskEntry {
  riskType:   PredictedRiskType;
  confidence: 'low' | 'medium' | 'high';
  headline:   string;
  rationale:  string;
}

/**
 * Plan-intensity explanation — why the system made this plan lighter/heavier.
 * Deterministic and traceable to specific review signals.
 */
export interface PlanExplanationEntry {
  decision:   string;
  reason:     string;
  signal:     string;
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Predictive + explanation signals for the coach.
 * Added in Batch 8 — present when controlPlan exists for today.
 */
export interface PredictionSignalSummary {
  /** Up to 2 predicted drift risks, sorted high→low confidence. */
  topRisks: PredictedRiskEntry[];
  /** Plain-text prediction summary ready for coach system-prompt injection. */
  predictionContext: string;
  /** Why today's plan intensity was chosen. */
  planExplanation: PlanExplanationEntry;
}

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
  /** Review-derived behavioral signals — present when the user has saved ≥1 review. */
  reviewSignals?: ReviewSignalSummary;
  /** Predictive + explanation signals — present when a plan exists for today. */
  predictionSignals?: PredictionSignalSummary;
  // ── Orchestration metadata (set by orchestrationEngine before each call) ──
  /** Derived AI request mode for this specific turn. */
  aiMode?: AIRequestMode;
  /** Style instruction injected into the backend system prompt. */
  responseStyleHint?: string;
  /** Context depth selected by the orchestration layer. */
  contextDepth?: ContextDepth;
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
