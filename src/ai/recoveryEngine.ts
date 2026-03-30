/**
 * LifeOS Recovery Engine
 *
 * Inserts recovery, meal, recharge, and reward blocks into the daily plan.
 * This is Step 2 in generateControlPlan — runs after constraint blocks are
 * placed but before free-time allocation.
 *
 * Design principles:
 *   - Progress over perfection: if a full recovery block doesn't fit,
 *     insert a shortened version rather than skipping entirely.
 *   - Recovery blocks are non-skippable in terms of rendering (BlockKind='recovery')
 *     but the user can mark them done early.
 *   - Titles are i18n keys — resolved by the UI layer, never hardcoded strings.
 *   - This file is pure logic. No React, no store, no side effects.
 */

import { generateId } from '../lib/utils';
import { timeToMins, minsToTime } from './planGenerator';
import type { PlanItem, RecoveryType } from '../types';

// ─── Recovery Rule ─────────────────────────────────────────────────────────────

export interface RecoveryRule {
  /**
   * What kind of block triggers this recovery insertion.
   * 'work'       — employee work shift block
   * 'class'      — student class block
   * 'high_energy'— any goal/skill block with energyRequired='high'
   */
  afterType: 'work' | 'class' | 'high_energy';
  /** Minimum duration of the preceding block to trigger this rule (minutes). */
  minDurationMins: number;
  /** Desired recovery block duration (minutes). */
  recoveryDurationMins: number;
  /**
   * Minimum acceptable recovery duration if full slot is unavailable.
   * Recovery is skipped entirely only when available < this value.
   */
  minRecoveryMins: number;
  recoveryType: RecoveryType;
  /** i18n key for the block title shown in the timeline. */
  labelKey: string;
}

// ─── Default rules ─────────────────────────────────────────────────────────────

/**
 * Default recovery rules applied to all users.
 * Override per user mode in the future by passing custom rules to insertRecoveryBlocks.
 */
export const DEFAULT_RECOVERY_RULES: RecoveryRule[] = [
  {
    afterType: 'work',
    minDurationMins: 240,      // trigger after ≥4h work shift
    recoveryDurationMins: 60,
    minRecoveryMins: 20,       // insert at least 20 min if full 60 doesn't fit
    recoveryType: 'meal_recovery',
    labelKey: 'recovery.meal_after_work',
  },
  {
    afterType: 'class',
    minDurationMins: 60,       // trigger after ≥1h class
    recoveryDurationMins: 25,
    minRecoveryMins: 10,
    recoveryType: 'rest',
    labelKey: 'recovery.rest_after_class',
  },
  {
    afterType: 'high_energy',
    minDurationMins: 45,       // trigger after ≥45 min high-energy task
    recoveryDurationMins: 15,
    minRecoveryMins: 8,
    recoveryType: 'recharge',
    labelKey: 'recovery.recharge',
  },
];

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Scans a sorted list of plan items and inserts recovery blocks
 * immediately after qualifying blocks.
 *
 * @param items         Sorted plan items (constraint + event blocks already placed)
 * @param dayEndMins    Day boundary in minutes since midnight (e.g. 22*60 = 1320)
 * @param rules         Recovery rules to apply (defaults to DEFAULT_RECOVERY_RULES)
 * @returns             New sorted array with recovery blocks inserted
 */
export function insertRecoveryBlocks(
  items: PlanItem[],
  dayEndMins: number,
  rules: RecoveryRule[] = DEFAULT_RECOVERY_RULES,
): PlanItem[] {
  if (items.length === 0) return items;

  const result: PlanItem[] = [];

  for (let i = 0; i < items.length; i++) {
    result.push(items[i]);

    const rule = matchRule(items[i], rules);
    if (!rule) continue;

    // Determine the available gap between this block and the next
    const blockEndMins  = timeToMins(items[i].endTime);
    const nextStartMins = i + 1 < items.length
      ? timeToMins(items[i + 1].startTime)
      : dayEndMins;

    const gapMins = nextStartMins - blockEndMins;

    // Skip if the gap is below the minimum viable recovery duration
    if (gapMins < rule.minRecoveryMins) continue;

    // Use full duration if it fits, otherwise shrink to available gap
    const actualDuration = Math.min(rule.recoveryDurationMins, gapMins);

    result.push(makeRecoveryItem(
      blockEndMins,
      blockEndMins + actualDuration,
      rule,
    ));
  }

  return result;
}

/**
 * Insert a reward break immediately after a specific completed item.
 * Called when an isCritical item is toggled complete.
 * Inserts only if there is enough gap before the next item.
 *
 * @param items             Current plan items
 * @param completedItemId   ID of the item that was just completed
 * @param dayEndMins        Day boundary in minutes
 * @param rewardDurationMins Duration of the reward break (default: 20 min)
 * @returns                 Items array with reward break inserted, or unchanged
 */
export function insertRewardBreak(
  items: PlanItem[],
  completedItemId: string,
  dayEndMins: number,
  rewardDurationMins = 20,
): PlanItem[] {
  const idx = items.findIndex(i => i.id === completedItemId);
  if (idx === -1) return items;

  const completedItem = items[idx];
  // Only insert reward after critical completions
  if (!completedItem.isCritical) return items;

  const blockEnd   = timeToMins(completedItem.endTime);
  const nextStart  = idx + 1 < items.length
    ? timeToMins(items[idx + 1].startTime)
    : dayEndMins;
  const available  = nextStart - blockEnd;

  const MIN_REWARD = 10;
  if (available < MIN_REWARD) return items;

  const actual = Math.min(rewardDurationMins, available);

  const rewardItem: PlanItem = {
    id:        generateId(),
    startTime: minsToTime(blockEnd),
    endTime:   minsToTime(blockEnd + actual),
    title:     'recovery.reward_break',   // i18n key
    type:      'break',
    completed: false,
    notes:     '[recovery:reward_break]',
    source:    'insight',
    blockKind: 'reward',
  };

  const result = [...items];
  result.splice(idx + 1, 0, rewardItem);
  return result;
}

/**
 * Returns true if the given plan item is a recovery/break block
 * inserted by this engine. Used by home.tsx to render recovery
 * command instead of task command.
 */
export function isRecoveryBlock(item: PlanItem): boolean {
  return (
    item.blockKind === 'recovery' ||
    item.blockKind === 'reward' ||
    (item.type === 'break' && !!item.notes?.startsWith('[recovery:'))
  );
}

/**
 * Returns the RecoveryType from a recovery block's notes field.
 * Returns undefined for non-recovery blocks.
 */
export function getRecoveryType(item: PlanItem): RecoveryType | undefined {
  const match = item.notes?.match(/^\[recovery:([^\]]+)\]/);
  if (!match) return undefined;
  return match[1] as RecoveryType;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function matchRule(item: PlanItem, rules: RecoveryRule[]): RecoveryRule | null {
  const durationMins = timeToMins(item.endTime) - timeToMins(item.startTime);

  // Work block: event with [work] in notes, or blockKind='constraint' + type='event'
  if (
    item.type === 'event' &&
    (item.notes?.includes('[work]') || item.blockKind === 'constraint')
  ) {
    const rule = rules.find(r => r.afterType === 'work');
    if (rule && durationMins >= rule.minDurationMins) return rule;
  }

  // Class block: event with [class] in notes
  if (item.type === 'event' && item.notes?.includes('[class]')) {
    const rule = rules.find(r => r.afterType === 'class');
    if (rule && durationMins >= rule.minDurationMins) return rule;
  }

  // High energy goal/skill block
  if (
    (item.type === 'goal' || item.type === 'skill') &&
    item.energyRequired === 'high'
  ) {
    const rule = rules.find(r => r.afterType === 'high_energy');
    if (rule && durationMins >= rule.minDurationMins) return rule;
  }

  return null;
}

function makeRecoveryItem(
  startMins: number,
  endMins: number,
  rule: RecoveryRule,
): PlanItem {
  return {
    id:        generateId(),
    startTime: minsToTime(startMins),
    endTime:   minsToTime(endMins),
    title:     rule.labelKey,       // i18n key — resolved by the UI
    type:      'break',
    completed: false,
    notes:     `[recovery:${rule.recoveryType}]`,
    source:    'insight',
    blockKind: rule.recoveryType === 'reward_break' ? 'reward' : 'recovery',
  };
}
