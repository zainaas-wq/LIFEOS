/**
 * requestGuard.ts — Pure validation guards for AI request safety.
 *
 * Batch 20: Launch Hardening.
 *
 * All functions are pure and side-effect-free.
 * Safe for ts-node tests and use in BackendAIClient.
 *
 * The edge function (Deno) duplicates the constants inline — it cannot
 * import from src/. Keep both in sync when limits change.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum character count for a user message sent to the backend. */
export const MAX_MESSAGE_CHARS = 4_000;

/** Maximum number of history messages included in a single request. */
export const MAX_HISTORY_ITEMS = 20;

/**
 * Maximum character count of the serialized JSON payload sent to the backend.
 * Checked before the network call to avoid unnecessary upstream traffic.
 */
export const MAX_PAYLOAD_CHARS = 150_000;

/** Valid AI request mode strings. Mirrors orchestrationEngine.AIRequestMode. */
export const KNOWN_AI_MODES = [
  'quick_nudge',
  'focused_answer',
  'recovery_coach',
  'strategic_planning',
  'review_reflection',
] as const;

export type KnownAIMode = typeof KNOWN_AI_MODES[number];

// ─── Guards ───────────────────────────────────────────────────────────────────

/**
 * Returns true when the serialized JSON payload string exceeds the character cap.
 * Pass the result of JSON.stringify(wirePayload).
 *
 * Uses character count (string.length) which is a safe proxy for byte size for
 * primarily-ASCII JSON payloads. Slightly underestimates for multi-byte chars —
 * conservative enough at 150 K chars.
 */
export function isPayloadTooLarge(
  payloadStr: string,
  maxChars: number = MAX_PAYLOAD_CHARS,
): boolean {
  return payloadStr.length > maxChars;
}

/**
 * Returns true when the message string is within the allowed character limit.
 */
export function isValidMessageLength(
  msg: string,
  max: number = MAX_MESSAGE_CHARS,
): boolean {
  return typeof msg === 'string' && msg.length <= max;
}

/**
 * Returns true when the history array does not exceed the item cap.
 */
export function isValidHistoryDepth(
  history: unknown[],
  max: number = MAX_HISTORY_ITEMS,
): boolean {
  return Array.isArray(history) && history.length <= max;
}

/**
 * Returns the mode string if it is a known AI mode, otherwise null.
 * Used to sanitize client-supplied aiMode before logging or routing.
 */
export function sanitizeAIMode(raw: string | null | undefined): KnownAIMode | null {
  if (!raw || typeof raw !== 'string') return null;
  return (KNOWN_AI_MODES as readonly string[]).includes(raw)
    ? (raw as KnownAIMode)
    : null;
}
