/**
 * CreditCostChip — inline pre-send cost preview.
 *
 * Shows the credit cost of the pending request before the user taps send.
 * Displayed near the input bar so the user always knows what they are about to spend.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { costPreviewLabel } from '../../ai/creditUX';
import type { RequestMode } from '../../ai/creditRules';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditCostChipProps {
  mode:    RequestMode;
  /** Dim the chip when balance is too low to afford this request. */
  canAfford?: boolean;
}

// ─── Icon per mode ────────────────────────────────────────────────────────────

const MODE_ICON: Record<RequestMode, string> = {
  text:  'chatbubble-outline',
  voice: 'mic-outline',
  image: 'image-outline',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CreditCostChip({ mode, canAfford = true }: CreditCostChipProps) {
  const label = costPreviewLabel(mode);
  const icon  = MODE_ICON[mode];
  const tint  = canAfford ? Colors.gold : '#F87171';

  return (
    <View style={[s.chip, !canAfford && s.chipDanger]}>
      <Ionicons name={icon as any} size={10} color={tint} />
      <Text style={[s.label, { color: tint }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  chip: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            3,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical:   2,
    borderRadius:   Radius.full,
    borderWidth:    1,
    borderColor:    Colors.goldDim,
    backgroundColor: Colors.goldMuted,
  },
  chipDanger: {
    borderColor:     'rgba(248,113,113,0.4)',
    backgroundColor: 'rgba(248,113,113,0.1)',
  },
  label: {
    fontSize:   FontSize.xs - 1,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },
});
