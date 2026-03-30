/**
 * StreakBadge
 *
 * Compact, non-gamified streak indicator.
 * Communicates consistency at a glance — no points, no big animations,
 * no childish flame characters. Just a clear signal of continuity.
 *
 * Status → icon mapping:
 *   active    → flame-outline    (sustained momentum)
 *   recovered → flash-outline    (came back after a gap)
 *   at_risk   → alert-circle-outline (yesterday was the last active day)
 *   new       → radio-button-off (just getting started)
 *
 * Props:
 *   streak    — current streak count
 *   status    — from computeStreakData
 *   label     — pre-computed label from computeStreakData (streakLabel)
 */

import React from 'react';
import {
  View,
  Text,
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
import type { StreakStatus } from '../ai/retentionEngine';

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StreakStatus, {
  icon:  React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}> = {
  active:    { icon: 'flame-outline',         color: Colors.warning },
  recovered: { icon: 'flash-outline',          color: Colors.purpleLight },
  at_risk:   { icon: 'alert-circle-outline',   color: Colors.error },
  new:       { icon: 'radio-button-off-outline', color: Colors.textMuted },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  streak: number;
  status: StreakStatus;
  label: string;
}

export function StreakBadge({ streak, status, label }: Props) {
  const { icon, color } = STATUS_CONFIG[status];

  return (
    <View style={[sb.wrap, { borderColor: color + '40' }]}>
      <Ionicons name={icon} size={11} color={color} />
      <Text style={[sb.label, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sb = StyleSheet.create({
  wrap: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            4,
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:   Radius.full ?? 99,
    borderWidth:    1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  label: {
    fontSize:   FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.3,
  },
});
