/**
 * CreditUsageBreakdown — compact "requests remaining" display.
 *
 * Shows how many text / voice / image requests the user can still make
 * given their current balance. Each estimate assumes the full balance
 * is spent on that mode alone.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { estimateUsageBreakdown } from '../../ai/creditUX';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditUsageBreakdownProps {
  balance: number;
}

// ─── Row config ───────────────────────────────────────────────────────────────

const ROWS = [
  { key: 'text'  as const, label: 'Text',  icon: 'chatbubble-outline', color: Colors.gold       },
  { key: 'voice' as const, label: 'Voice', icon: 'mic-outline',        color: '#6C8EBF'         },
  { key: 'image' as const, label: 'Image', icon: 'image-outline',      color: Colors.purpleLight },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function CreditUsageBreakdown({ balance }: CreditUsageBreakdownProps) {
  const est = estimateUsageBreakdown(balance);

  return (
    <View style={s.wrap}>
      <Text style={s.heading}>Requests remaining</Text>
      <View style={s.rows}>
        {ROWS.map(({ key, label, icon, color }) => {
          const count = est[key];
          return (
            <View key={key} style={s.row}>
              <Ionicons name={icon as any} size={12} color={color} />
              <Text style={s.rowLabel}>{label}</Text>
              <View style={s.spacer} />
              <Text style={[s.count, count === 0 && s.countZero]}>
                {count === 0 ? 'none' : count}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.sm,
    gap:             Spacing.xs,
  },
  heading: {
    fontSize:    FontSize.xs - 1,
    fontWeight:  FontWeight.semibold,
    color:       Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  rows: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.xs,
  },
  spacer:     { flex: 1 },
  rowLabel: {
    fontSize:  FontSize.xs,
    color:     Colors.textSecondary,
  },
  count: {
    fontSize:   FontSize.xs,
    fontWeight: FontWeight.bold,
    color:      Colors.textPrimary,
  },
  countZero: { color: '#F87171' },
});
