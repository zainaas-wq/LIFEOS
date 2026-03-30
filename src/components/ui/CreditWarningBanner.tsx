/**
 * CreditWarningBanner — contextual low-credit alert.
 *
 * Severity tiers:
 *   soft      (≤5)  → amber hint — "Running low"
 *   strong    (≤2)  → orange warning — "Almost out"
 *   exhausted (=0)  → red CTA — "No credits left"
 *   ok              → renders nothing
 *
 * Never blocks interaction. Always dismissible at soft/strong.
 * Upgrade CTA only shown at exhausted.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { getLowCreditState } from '../../ai/creditUX';
import type { LowCreditState } from '../../ai/creditUX';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditWarningBannerProps {
  balance:    number;
  onUpgrade?: () => void;
  onDismiss?: () => void;
}

// ─── Config per state ─────────────────────────────────────────────────────────

const CONFIG: Record<Exclude<LowCreditState, 'ok'>, {
  bg:      string;
  border:  string;
  icon:    string;
  iconColor: string;
  text:    string;
  textColor: string;
}> = {
  soft: {
    bg:        'rgba(201,168,76,0.08)',
    border:    Colors.goldDim,
    icon:      'warning-outline',
    iconColor: Colors.gold,
    text:      'Running low on AI credits',
    textColor: Colors.gold,
  },
  strong: {
    bg:        'rgba(251,146,60,0.1)',
    border:    'rgba(251,146,60,0.4)',
    icon:      'alert-circle-outline',
    iconColor: '#FB923C',
    text:      'Almost out of AI credits',
    textColor: '#FB923C',
  },
  exhausted: {
    bg:        'rgba(248,113,113,0.08)',
    border:    'rgba(248,113,113,0.4)',
    icon:      'close-circle-outline',
    iconColor: '#F87171',
    text:      'No AI credits left this cycle',
    textColor: '#F87171',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CreditWarningBanner({ balance, onUpgrade, onDismiss }: CreditWarningBannerProps) {
  const state = getLowCreditState(balance);
  if (state === 'ok') return null;

  const cfg = CONFIG[state];

  return (
    <View style={[s.banner, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Ionicons name={cfg.icon as any} size={14} color={cfg.iconColor} />
      <Text style={[s.text, { color: cfg.textColor }]}>{cfg.text}</Text>

      <View style={s.actions}>
        {state === 'exhausted' && onUpgrade && (
          <TouchableOpacity style={s.upgradeBtn} onPress={onUpgrade} activeOpacity={0.8}>
            <Text style={s.upgradeBtnText}>Upgrade</Text>
          </TouchableOpacity>
        )}
        {state !== 'exhausted' && onDismiss && (
          <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={13} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  banner: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs + 2,
    borderBottomWidth: 1,
  },
  text: {
    flex:       1,
    fontSize:   FontSize.xs,
    fontWeight: FontWeight.medium,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.xs,
  },
  upgradeBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical:   3,
    backgroundColor:   'rgba(248,113,113,0.15)',
    borderRadius:      Radius.sm,
    borderWidth:       1,
    borderColor:       'rgba(248,113,113,0.4)',
  },
  upgradeBtnText: {
    fontSize:   FontSize.xs,
    fontWeight: FontWeight.semibold,
    color:      '#F87171',
  },
});
