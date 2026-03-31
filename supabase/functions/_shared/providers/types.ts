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
  result:            ProviderResult;
  providerSelected:  ProviderName;   // what the policy chose
  providerUsed:      ProviderName;   // what actually responded
  fallbackOccurred:  boolean;        // true if primary failed and secondary succeeded
  latencyMs:         number;
  // Batch 16 reliability fields
  timeoutOccurred:   boolean;        // true if primary (or fallback) timed out
  failureReason:     string | null;  // primary failure message when fallback was used; null on direct success
  healthAtSelection: Record<ProviderName, ProviderHealthState>; // snapshot at routing time
}

// ─── Route policy decision ────────────────────────────────────────────────────

export interface RoutingDecision {
  primary:  ProviderName;
  fallback: ProviderName;
  reason:   string;
}

// ─── Batch 16: provider health and reliability types ─────────────────────────

/** Per-provider health state at a point in time. */
export type ProviderHealthState = 'healthy' | 'unhealthy';

/**
 * Thrown by routeTextRequest when both primary and fallback providers fail.
 * Carries structured observability fields so index.ts can log even on total failure.
 */
export class GatewayError extends Error {
  constructor(
    message:                                                  string,
    public readonly timeoutOccurred:     boolean,
    public readonly healthAtSelection:   Record<ProviderName, ProviderHealthState>,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}
