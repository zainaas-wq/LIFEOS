/**
 * MorningLaunchCard
 *
 * Day-start ritual card. Shown on Home in the morning (before ~11:00).
 * Communicates day intensity, first action, and yesterday's pattern.
 *
 * Receives pre-computed MorningLaunchData — no store access.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  Radius,
} from '../constants/theme';
import type { MorningLaunchData } from '../ai/ritualEngine';

// ─── Config ───────────────────────────────────────────────────────────────────

const INTENSITY_CONFIG: Record<
  'light' | 'moderate' | 'heavy',
  { color: string; icon: string; label: string }
> = {
  light:    { color: Colors.success,  icon: 'leaf-outline',   label: 'Light Day' },
  moderate: { color: Colors.gold,     icon: 'sunny-outline',  label: 'Full Day' },
  heavy:    { color: Colors.error,    icon: 'flash-outline',  label: 'Heavy Day' },
};

const PATTERN_LABELS: Record<string, string> = {
  clean_day:          'Yesterday was a clean day.',
  recovered_strong:   'You recovered strong yesterday.',
  solid_day:          'Solid execution yesterday.',
  avoidance_pattern:  'Avoidance pattern detected yesterday.',
  overload_pattern:   'Yesterday felt heavy. Staying lighter today.',
  distraction_heavy:  'Distraction was high yesterday.',
  recovery_effective: 'Recovery worked well yesterday.',
  low_execution:      'Low execution yesterday. Starting fresh.',
  mixed_day:          'Mixed day yesterday.',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  data: MorningLaunchData;
  /**
   * Optional inline warning signal absorbed from PredictiveWarningCard.
   * When provided, shows a compact warning line at the bottom of this card
   * so morning launch and predictive warning read as one surface, not two.
   */
  warningLine?: string | null;
}

export function MorningLaunchCard({ data, warningLine }: Props) {
  const { firstAction, dayIntensity, yesterdayPattern, taskCount, totalFocusMins } = data;
  const cfg = INTENSITY_CONFIG[dayIntensity];

  const patternLabel =
    yesterdayPattern && PATTERN_LABELS[yesterdayPattern]
      ? PATTERN_LABELS[yesterdayPattern]
      : null;

  const focusLabel =
    totalFocusMins >= 60
      ? `${(totalFocusMins / 60).toFixed(1).replace('.0', '')}h`
      : `${totalFocusMins}m`;

  return (
    <View style={[ml.card, { borderColor: cfg.color + '33' }]}>
      {/* Intensity row */}
      <View style={ml.headerRow}>
        <Ionicons name={cfg.icon as any} size={13} color={cfg.color} />
        <Text style={[ml.intensityLabel, { color: cfg.color }]}>{cfg.label}</Text>
        <View style={ml.spacer} />
        <Text style={ml.stats}>{taskCount} tasks · {focusLabel}</Text>
      </View>

      {/* First action block */}
      {firstAction && (
        <View style={ml.actionRow}>
          <Text style={ml.actionTag}>START WITH</Text>
          <Text style={ml.actionTitle} numberOfLines={2}>{firstAction.title}</Text>
          <Text style={ml.actionTime}>{firstAction.startTime}</Text>
        </View>
      )}

      {/* Yesterday pattern reflection */}
      {patternLabel && (
        <Text style={ml.pattern}>{patternLabel}</Text>
      )}

      {/* Inline predictive warning — absorbed from PredictiveWarningCard when morning is active */}
      {warningLine && (
        <View style={ml.warningRow}>
          <Ionicons name="warning-outline" size={11} color={Colors.warning} />
          <Text style={ml.warningText} numberOfLines={2}>{warningLine}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ml = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  intensityLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  spacer: { flex: 1 },
  stats: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  actionRow: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 3,
  },
  actionTag: {
    fontSize: 9,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: FontWeight.bold,
  },
  actionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  actionTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  pattern: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  warningText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.warning,
    lineHeight: 16,
  },
});
