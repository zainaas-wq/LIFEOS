/**
 * Provider adapter types — shared across all AI provider modules.
 *
 * Every provider adapter must implement ProviderAdapter.
 * The router uses these types exclusively — no provider-specific
 * code leaks outside its adapter module.
 */

// ─── Wire types (shared with index.ts) ───────────────────────────────────────

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens:     number;
  completionTokens: number;
  totalTokens:      number;
  provider:         ProviderName;
}

export interface ProviderResult {
  content: string;
  usage:   TokenUsage;
}

// ─── Provider names ───────────────────────────────────────────────────────────

export type ProviderName = 'openai' | 'nim';

// ─── AI request modes (mirrors client orchestrationEngine.ts) ────────────────

export type AIRequestMode =
  | 'quick_nudge'
  | 'focused_answer'
  | 'recovery_coach'
  | 'strategic_planning'
  | 'review_reflection';

// ─── Provider adapter interface ───────────────────────────────────────────────

/**
 * Every provider must implement this interface.
 * The router calls callText() and never talks to providers directly.
 */
export interface ProviderAdapter {
  readonly name: ProviderName;
  callText(
    systemPrompt: string,
    history:      HistoryMessage[],
    userMessage:  string,
    signal:       AbortSignal,
  ): Promise<ProviderResult>;
}

// ─── Routing result ───────────────────────────────────────────────────────────

/**
 * Full execution record returned by the router.
 * Contains everything needed for logging and credit accounting.
 */
export interface RouteExecutionResult {
  result:           ProviderResult;
  providerSelected: ProviderName;   // what the policy chose
  providerUsed:     ProviderName;   // what actually responded
  fallbackOccurred: boolean;        // true if primary failed and secondary succeeded
  latencyMs:        number;
}

// ─── Route policy decision ────────────────────────────────────────────────────

export interface RoutingDecision {
  primary:  ProviderName;
  fallback: ProviderName;
  reason:   string;
}
