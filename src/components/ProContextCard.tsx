/**
 * ProContextCard
 *
 * Compact, contextual upgrade nudge.
 * Shown at specific moments where Pro adds immediate, visible value.
 *
 * Design rules:
 *   - Always dismissible — never block the flow
 *   - One sentence — no lengthy pitch
 *   - Relevant copy driven by the feature triggering it
 *   - Appears max once per app session per trigger (parent controls dismiss state)
 *
 * Usage:
 *   <ProContextCard
 *     feature="predictive_insights"
 *     onUpgrade={() => router.push('/upgrade')}
 *     onDismiss={() => setProCardDismissed(true)}
 *   />
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
import { PRO_FEATURE_LABELS } from '../config/proGating';
import type { ProFeature } from '../config/proGating';

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  feature: ProFeature;
  onUpgrade: () => void;
  onDismiss: () => void;
}

export function ProContextCard({ feature, onUpgrade, onDismiss }: Props) {
  const { nudge } = PRO_FEATURE_LABELS[feature];

  return (
    <View style={pc.wrap}>
      <Ionicons name="sparkles-outline" size={13} color={Colors.gold} />
      <Text style={pc.text} numberOfLines={2}>{nudge}</Text>
      <TouchableOpacity onPress={onUpgrade} style={pc.cta} activeOpacity={0.8}>
        <Text style={pc.ctaText}>Try Pro</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        activeOpacity={0.6}
      >
        <Ionicons name="close" size={14} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pc = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.goldMuted,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.goldDim,
  },
  text:    { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16 },
  cta:     { backgroundColor: Colors.gold, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 5 },
  ctaText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textInverse },
});
