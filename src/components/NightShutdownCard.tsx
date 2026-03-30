/**
 * NightShutdownCard
 *
 * Day-end ritual card. Shown on Home in the evening (≥19:00).
 * Summarises the day and offers a direct path into the review flow.
 *
 * Receives pre-computed NightShutdownData — no store access.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  Radius,
  Shadow,
} from '../constants/theme';
import type { NightShutdownData } from '../ai/ritualEngine';

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  data: NightShutdownData;
  onReview: () => void;
}

export function NightShutdownCard({ data, onReview }: Props) {
  const { completedCount, totalCount, completionRate, focusMins, criticalDone } = data;
  const pct = Math.round(completionRate * 100);

  const summaryColor =
    completionRate >= 0.8 ? Colors.success :
    completionRate >= 0.5 ? Colors.warning :
    Colors.error;

  const focusLabel =
    focusMins >= 60
      ? `${Math.floor(focusMins / 60)}h${focusMins % 60 > 0 ? ` ${focusMins % 60}m` : ''}`
      : focusMins > 0 ? `${focusMins}m` : '—';

  return (
    <View style={ns.card}>
      {/* Header */}
      <View style={ns.headerRow}>
        <Ionicons name="moon-outline" size={13} color={Colors.purpleLight} />
        <Text style={ns.heading}>Wind Down</Text>
      </View>

      {/* Day stats */}
      <View style={ns.statsRow}>
        <View style={ns.stat}>
          <Text style={[ns.statValue, { color: summaryColor }]}>{pct}%</Text>
          <Text style={ns.statLabel}>done</Text>
        </View>

        <View style={ns.divider} />

        <View style={ns.stat}>
          <Text style={ns.statValue}>{completedCount}/{totalCount}</Text>
          <Text style={ns.statLabel}>tasks</Text>
        </View>

        <View style={ns.divider} />

        <View style={ns.stat}>
          <Text style={ns.statValue}>{focusLabel}</Text>
          <Text style={ns.statLabel}>focus</Text>
        </View>

        {criticalDone && (
          <>
            <View style={ns.divider} />
            <View style={ns.stat}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={[ns.statLabel, { color: Colors.success }]}>critical</Text>
            </View>
          </>
        )}
      </View>

      {/* Review CTA */}
      <TouchableOpacity onPress={onReview} style={ns.cta} activeOpacity={0.85}>
        <Text style={ns.ctaText}>Complete Today's Review</Text>
        <Ionicons name="arrow-forward" size={14} color={Colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ns = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.purpleLight + '33',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heading: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.purpleLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.purpleMuted,
    borderRadius: Radius.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.purpleLight + '44',
    ...Shadow.sm,
  },
  ctaText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.purpleLight,
  },
});
