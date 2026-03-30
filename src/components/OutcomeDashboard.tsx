/**
 * OutcomeDashboard
 *
 * Glanceable "Is LifeOS helping me?" panel.
 * Shows execution trend, drift frequency, recovery effectiveness, review consistency.
 *
 * Free  → 7-day window  + "See 30-day trends" Pro nudge
 * Pro   → 30-day window + no nudge
 *
 * Props:
 *   trend     — pre-computed OutcomeTrend (parent memoises computeOutcomeTrend)
 *   isPro     — controls window label and whether to show upgrade nudge
 *   onUpgrade — called when user taps the Pro nudge
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
} from '../constants/theme';
import type { OutcomeTrend } from '../ai/outcomeEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Green ≥ 70%, Gold 45–69%, Red < 45%. Higher is better by default. */
function statColor(val: number, higherIsBetter = true): string {
  if (higherIsBetter) {
    if (val >= 0.7)  return Colors.success;
    if (val >= 0.45) return Colors.gold;
    return Colors.error;
  }
  // Inverse: lower is better (e.g. drift fraction)
  if (val <= 0.25) return Colors.success;
  if (val <= 0.45) return Colors.gold;
  return Colors.error;
}

// ─── Stat cell ────────────────────────────────────────────────────────────────

function StatCell({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={od.cell}>
      <Text style={[od.stat, { color }]}>{value}</Text>
      <Text style={od.cellLabel}>{label}</Text>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  trend: OutcomeTrend;
  isPro: boolean;
  onUpgrade: () => void;
}

export function OutcomeDashboard({ trend, isPro, onUpgrade }: Props) {
  const driftFraction  = trend.driftDays / Math.max(trend.windowDays, 1);
  const recoveryValue  = trend.recoveryRate === -1 ? '—' : pct(trend.recoveryRate);
  const recoveryColor  = trend.recoveryRate === -1 ? Colors.textMuted : statColor(trend.recoveryRate);

  return (
    <View style={od.wrap}>
      {/* Header */}
      <View style={od.header}>
        <Text style={od.title}>IS LIFEOS WORKING?</Text>
        <View style={od.windowBadge}>
          <Text style={od.windowText}>{isPro ? '30d' : '7d'}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={od.grid}>
        <StatCell
          value={pct(trend.avgCompletion)}
          label="EXECUTION"
          color={statColor(trend.avgCompletion)}
        />
        <View style={od.divider} />
        <StatCell
          value={`${trend.driftDays}d`}
          label="DRIFT"
          color={statColor(driftFraction, false)}
        />
        <View style={od.divider} />
        <StatCell
          value={recoveryValue}
          label="RECOVERY"
          color={recoveryColor}
        />
        <View style={od.divider} />
        <StatCell
          value={pct(trend.reviewConsistency)}
          label="REVIEWS"
          color={statColor(trend.reviewConsistency)}
        />
      </View>

      {/* Pro nudge — 30-day window */}
      {!isPro && (
        <TouchableOpacity onPress={onUpgrade} style={od.nudge} activeOpacity={0.8}>
          <Ionicons name="trending-up-outline" size={12} color={Colors.gold} />
          <Text style={od.nudgeText}>See 30-day trends with Pro</Text>
          <Ionicons name="chevron-forward" size={11} color={Colors.gold} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const od = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: 8,
  },
  title:       { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, letterSpacing: 1.5, textTransform: 'uppercase' },
  windowBadge: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  windowText:  { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.medium },
  grid:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  cell:        { flex: 1, alignItems: 'center', gap: 4 },
  divider:     { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.06)' },
  stat:        { fontSize: FontSize.xl, fontWeight: FontWeight.bold, letterSpacing: -0.5 },
  cellLabel:   { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: FontWeight.medium },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.goldMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: Colors.goldDim,
  },
  nudgeText:   { flex: 1, fontSize: FontSize.xs, color: Colors.goldLight, fontWeight: FontWeight.medium },
});
