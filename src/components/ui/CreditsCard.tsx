/**
 * CreditsCard — compact AI credit balance display.
 *
 * Shows current balance, allowance, a visual fill bar, and next-refill context.
 * Used in the Coach screen and Profile screen.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { AIBalance } from '../../services/aiCreditsService';
import { getRefillCountdown } from '../../ai/creditUX';
import { CreditUsageBreakdown } from './CreditUsageBreakdown';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditsCardProps {
  balance:   AIBalance | null;
  isLoading: boolean;
  onUpgrade?: () => void;
  compact?:  boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fillColor(pct: number): string {
  if (pct <= 10) return '#F87171';  // red — exhausted
  if (pct <= 30) return Colors.gold; // amber — low
  return '#4ADE80';                  // green — healthy
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreditsCard({ balance, isLoading, onUpgrade, compact = false }: CreditsCardProps) {
  if (isLoading) {
    return (
      <View style={[s.card, compact && s.cardCompact]}>
        <View style={s.row}>
          <Ionicons name="sparkles" size={13} color={Colors.gold} />
          <Text style={s.label}>AI Credits</Text>
        </View>
        <Text style={s.loading}>Loading…</Text>
      </View>
    );
  }

  if (!balance) return null;

  const { currentBalance, tierAllowance, pctRemaining, isExhausted, lastRefillAt } = balance;
  const barColor = fillColor(pctRemaining);
  const barWidth = `${Math.max(2, pctRemaining)}%` as any;

  return (
    <View style={[s.card, compact && s.cardCompact]}>
      {/* Header row */}
      <View style={s.row}>
        <Ionicons name="sparkles" size={13} color={Colors.gold} />
        <Text style={s.label}>AI Credits</Text>
        <View style={s.spacer} />
        <Text style={[s.balance, isExhausted && s.balanceExhausted]}>
          {currentBalance}
          <Text style={s.allowance}> / {tierAllowance}</Text>
        </Text>
      </View>

      {/* Fill bar */}
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: barWidth, backgroundColor: barColor }]} />
      </View>

      {/* Footer row */}
      {!compact && (
        <View style={s.footer}>
          <Text style={s.refill}>{getRefillCountdown(lastRefillAt)}</Text>
          {isExhausted && onUpgrade && (
            <TouchableOpacity onPress={onUpgrade} activeOpacity={0.8} style={s.upgradeBtn}>
              <Text style={s.upgradeBtnText}>Get more →</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {isExhausted && !compact && (
        <View style={s.exhaustedNote}>
          <Text style={s.exhaustedText}>
            You've used all credits for this cycle. Local Coach is still available.
          </Text>
        </View>
      )}

      {/* Requests remaining breakdown — non-compact only */}
      {!compact && !isExhausted && (
        <CreditUsageBreakdown balance={currentBalance} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius:    Radius.xl,
    borderWidth:     1,
    borderColor:     Colors.goldDim,
    padding:         Spacing.md,
    gap:             Spacing.xs,
  },
  cardCompact: {
    padding:      Spacing.sm,
    borderRadius: Radius.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.xs,
  },
  spacer: { flex: 1 },
  label: {
    fontSize:    FontSize.xs,
    fontWeight:  FontWeight.semibold,
    color:       Colors.gold,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  balance: {
    fontSize:   FontSize.sm,
    fontWeight: FontWeight.bold,
    color:      Colors.textPrimary,
  },
  balanceExhausted: { color: '#F87171' },
  allowance: {
    fontSize:   FontSize.xs,
    fontWeight: FontWeight.regular,
    color:      Colors.textMuted,
  },
  barTrack: {
    height:          4,
    borderRadius:    Radius.full,
    backgroundColor: Colors.border,
    overflow:        'hidden' as const,
    marginVertical:  2,
  },
  barFill: {
    height:       4,
    borderRadius: Radius.full,
  },
  footer: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.xs,
  },
  refill: {
    fontSize: FontSize.xs,
    color:    Colors.textMuted,
    flex:     1,
  },
  upgradeBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical:   3,
    backgroundColor:   Colors.goldMuted,
    borderRadius:      Radius.sm,
  },
  upgradeBtnText: {
    fontSize:   FontSize.xs,
    fontWeight: FontWeight.semibold,
    color:      Colors.gold,
  },
  exhaustedNote: {
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderRadius:    Radius.sm,
    padding:         Spacing.sm,
    marginTop:       2,
  },
  exhaustedText: {
    fontSize:   FontSize.xs,
    color:      '#F87171',
    lineHeight: 16,
  },
  loading: {
    fontSize: FontSize.xs,
    color:    Colors.textMuted,
  },
});
