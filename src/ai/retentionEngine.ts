/**
 * retentionEngine.ts — Behavior-aware retention + streak logic.
 *
 * Design rules:
 *   - Pure functions only. No store, no React, no side effects.
 *   - Node-testable. Do not import from planGenerator / lib/utils (react-native chain).
 *   - Streak is behavior-aware, not simplistic. Recovery saves the streak.
 *   - Re-entry copy is soft — no guilt, no shame, just a clean restart.
 *
 * Streak model:
 *   A day "counts" when completedCount > 0.
 *   A 1-day gap is preserved (status: at_risk) — the user is not punished immediately.
 *   A recovery day (recoveryUsed: true, completedCount > 0) after a 1-day gap
 *   extends the streak and marks it as "recovered" — the recovery saved the streak.
 *   A 2+ day gap with no recovery resets the streak to 0.
 *
 * Consumers:
 *   - StreakBadge (compact indicator in home header)
 *   - ReentryBanner (re-entry surface after missed days)
 *   - home.tsx commitment signal (inline NowAction context)
 *   - notificationPlanner (retention nudge content)
 *   - store/useAppStore (track streak_continued / streak_recovered events)
 */

import type { DailyReview, AdaptationHints } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StreakStatus = 'active' | 'at_risk' | 'recovered' | 'new';

export interface StreakData {
  /** Consecutive active days (recovery days count). */
  currentStreak: number;
  /** Longest streak the user has ever maintained. */
  bestStreak: number;
  /** Qualitative streak status. */
  streakStatus: StreakStatus;
  /** Short human-readable label ready for UI display. */
  streakLabel: string;
  /** Days since the user's last review (0 = reviewed today, 1 = yesterday). */
  missedDays: number;
  /** True when a recovery save extended the streak across a 1-day gap. */
  recoveryBoostApplied: boolean;
  /** Total review records for lifetime context. */
  totalReviews: number;
}

export interface GapInfo {
  /** Days since last review (0 if reviewed today). -1 if never. */
  missedDays: number;
  /** Date of last review or null if none. */
  lastActivityDate: string | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Signed day difference: returns dateA - dateB in days.
 * dateDiffDays('2026-03-30', '2026-03-29') = 1.
 * Does NOT inline from lib/utils to avoid react-native import chain.
 */
function dateDiffDays(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00Z').getTime();
  const b = new Date(dateB + 'T00:00:00Z').getTime();
  return Math.round((a - b) / 86_400_000);
}

function buildStreakLabel(streak: number, status: StreakStatus, recoveryBoost: boolean): string {
  if (status === 'new' && streak === 0) return 'Start your streak';
  if (status === 'at_risk')             return streak > 0 ? `${streak}d — at risk` : 'At risk';
  if (status === 'recovered')           return recoveryBoost ? `${streak}d — recovered` : `${streak}d`;
  if (streak === 1)                     return '1 day';
  return `${streak} days`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the behavior-aware composite streak.
 *
 * Walk backwards from todayDate through sorted reviews:
 *   - consecutive active day (completedCount > 0): streak++
 *   - 1-day gap with recovery (recoveryUsed && completedCount > 0): streak++, mark boost
 *   - 2+ day gap or empty day: stop
 *
 * @param reviews    All DailyReview records (unsorted, any window).
 * @param todayDate  YYYY-MM-DD — used as the reference point for gap computation.
 */
export function computeStreakData(
  reviews: DailyReview[],
  todayDate: string,
): StreakData {
  const totalReviews = reviews.length;

  // All reviews sorted descending (most recent first)
  const allSorted = [...reviews].sort((a, b) => b.date.localeCompare(a.date));

  // missedDays: days since ANY review (not just active ones)
  const lastReviewDate = allSorted[0]?.date ?? null;
  const missedDays     = lastReviewDate ? dateDiffDays(todayDate, lastReviewDate) : -1;

  // Streak computation — only active days matter
  const activeSorted = allSorted.filter(
    (r) => r.completedCount > 0 || r.recoveryUsed,
  );

  if (activeSorted.length === 0) {
    return {
      currentStreak:        0,
      bestStreak:           0,
      streakStatus:         'new',
      streakLabel:          'Start your streak',
      missedDays:           Math.max(0, missedDays),
      recoveryBoostApplied: false,
      totalReviews,
    };
  }

  // Walk backwards from today.
  // Recovery save rule: if the previously counted day had recoveryUsed=true
  // AND the next gap is exactly 2 (1 missed day), the recovery bridges the gap.
  // This models "the user recovered from a hard day, and that recovery saves continuity."
  let streak               = 0;
  let recoveryBoostApplied = false;
  let prevDate             = todayDate;
  let lastRecoveryUsed     = false; // was the most recently counted review a recovery day?

  for (const r of activeSorted) {
    const gap = dateDiffDays(prevDate, r.date);

    if (gap < 0) continue; // future date — skip

    if (gap === 0) {
      // Same date as prevDate (e.g. today's review already saved)
      if (r.completedCount > 0) {
        streak++;
        lastRecoveryUsed = r.recoveryUsed;
      }
      prevDate = r.date;
    } else if (gap === 1) {
      // Consecutive day — normal streak extension
      if (r.completedCount > 0) {
        streak++;
        lastRecoveryUsed = r.recoveryUsed;
        prevDate = r.date;
      }
    } else if (gap === 2 && lastRecoveryUsed && r.completedCount > 0) {
      // 1-day gap bridged because the previously counted day was a recovery day.
      // Recovery days absorb the preceding gap — the user bounced back, streak lives.
      streak++;
      recoveryBoostApplied = true;
      lastRecoveryUsed = r.recoveryUsed;
      prevDate = r.date;
    } else {
      // Gap >= 2 without a recovery bridge: streak breaks.
      break;
    }
  }

  // Best streak — full all-time scan
  const completedDates = reviews
    .filter((r) => r.completedCount > 0)
    .map((r) => r.date)
    .sort(); // ascending

  let bestStreak = completedDates.length > 0 ? 1 : 0;
  let run        = completedDates.length > 0 ? 1 : 0;
  for (let i = 1; i < completedDates.length; i++) {
    if (dateDiffDays(completedDates[i], completedDates[i - 1]) === 1) {
      run++;
    } else {
      bestStreak = Math.max(bestStreak, run);
      run = 1;
    }
  }
  bestStreak = Math.max(bestStreak, run);

  // Status
  let streakStatus: StreakStatus;
  if (streak === 0) {
    streakStatus = 'new';
  } else if (recoveryBoostApplied) {
    streakStatus = 'recovered';
  } else if (missedDays >= 1 && streak > 0) {
    // User was active but hasn't been seen today yet
    streakStatus = missedDays === 1 ? 'active' : 'at_risk';
  } else {
    streakStatus = 'active';
  }

  return {
    currentStreak: streak,
    bestStreak,
    streakStatus,
    streakLabel: buildStreakLabel(streak, streakStatus, recoveryBoostApplied),
    missedDays:  Math.max(0, missedDays),
    recoveryBoostApplied,
    totalReviews,
  };
}

/**
 * Lightweight gap detection without full streak computation.
 * Used for analytics event triggering (reentry_after_gap).
 */
export function detectGap(
  reviews: DailyReview[],
  todayDate: string,
): GapInfo {
  const sorted = [...reviews].sort((a, b) => b.date.localeCompare(a.date));
  const last   = sorted[0] ?? null;
  const missedDays = last
    ? Math.max(0, dateDiffDays(todayDate, last.date))
    : -1;
  return { missedDays, lastActivityDate: last?.date ?? null };
}

/**
 * Soft re-entry message when user missed ≥ 1 day.
 * No guilt. No "you failed". Just forward motion.
 *
 * @param missedDays - How many days since last activity.
 */
export function buildReentryMessage(missedDays: number): string {
  if (missedDays <= 0) return '';
  if (missedDays === 1) return 'Yesterday slipped — today is clean.';
  if (missedDays === 2) return "You're back. One task at a time.";
  if (missedDays === 3) return 'No pressure. Let\'s start light today.';
  return 'Clean slate. Pick the most important thing first.';
}

/**
 * Contextual commitment signal shown below the current task in NowAction.
 * Grounded in real review history — never invented, never guilt-inducing.
 * Returns null when there is no meaningful signal to show.
 *
 * @param reviews   All daily reviews (sorted internally).
 * @param hints     AdaptationHints from adaptationEngine.
 * @param streak    Current computed streak value.
 */
export function buildCommitmentSignal(
  reviews: DailyReview[],
  hints: AdaptationHints,
  streak: number,
): string | null {
  const sorted = [...reviews].sort((a, b) => b.date.localeCompare(a.date));
  const last   = sorted[0];

  // Most recent day was a strong recovery — acknowledge the momentum
  if (
    last?.systemTakeaway === 'recovered_strong' ||
    last?.systemTakeaway === 'recovery_effective'
  ) {
    return 'Yesterday was a comeback. Momentum is yours.';
  }

  // Active streak signals — meaningful consistency feedback
  if (streak >= 7)  return `${streak} days running. This is your baseline now.`;
  if (streak >= 5)  return `${streak}-day streak — your rhythm is forming.`;
  if (streak >= 3)  return `${streak} in a row. Consistency is compounding.`;
  if (streak === 2) return 'Back-to-back. Keep the thread going.';

  // Adaptation signal: light load mode
  if (hints.capMultiplier <= 0.62) return 'Light day by design — your best work starts easy.';

  // No meaningful signal
  return null;
}

/**
 * Retention-aware notification body content.
 * Called by notificationPlanner to build a re-engagement nudge.
 *
 * @param missedDays - How many days the user has been absent.
 */
export function buildRetentionNudgeContent(missedDays: number): {
  title: string;
  body: string;
} {
  if (missedDays === 1) {
    return {
      title: 'LifeOS: Start small today',
      body:  'Just do the first task — nothing else needed',
    };
  }
  if (missedDays === 2) {
    return {
      title: 'LifeOS: Pick up where you left off',
      body:  'One step at a time. Your plan is still here.',
    };
  }
  return {
    title: 'LifeOS is ready when you are',
    body:  'Start light. The system adjusts to where you are.',
  };
}
