/**
 * PredictiveWarningCard
 *
 * Compact, dismissible card for displaying the top predictive drift warning.
 * Shown on Home when a high/medium-confidence prediction is active.
 *
 * Design constraints:
 *   - Low noise: only shown for medium+ confidence
 *   - Dismissible: disappears when the user taps X; does not reappear until next render cycle
 *   - High signal: shows headline + action hint, never raw internals
 *   - No store dependency: receives pre-computed DriftPrediction as prop
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
import type { DriftPrediction } from '../ai/predictiveEngine';

// ─── Config ───────────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<
  DriftPrediction['riskType'],
  { icon: string; accentColor: string }
> = {
  likely_late_start:   { icon: 'time-outline',          accentColor: Colors.warning },
  likely_avoidance:    { icon: 'eye-off-outline',        accentColor: Colors.warning },
  likely_overload:     { icon: 'barbell-outline',        accentColor: Colors.error },
  likely_distraction:  { icon: 'notifications-off-outline', accentColor: Colors.gold },
  likely_fragmentation:{ icon: 'layers-outline',         accentColor: Colors.gold },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  prediction: DriftPrediction;
  onDismiss: () => void;
}

export function PredictiveWarningCard({ prediction, onDismiss }: Props) {
  const { icon, accentColor } = RISK_CONFIG[prediction.riskType];

  return (
    <View style={[pw.card, { borderColor: accentColor + '40' }]}>
      {/* Left accent bar */}
      <View style={[pw.accentBar, { backgroundColor: accentColor }]} />

      {/* Content */}
      <View style={pw.body}>
        {/* Header row */}
        <View style={pw.headerRow}>
          <Ionicons name={icon as any} size={14} color={accentColor} />
          <Text style={[pw.headline, { color: accentColor }]}>
            {prediction.headline}
          </Text>
          <View style={pw.spacer} />

          {/* Confidence pip */}
          <View style={[pw.pip, { backgroundColor: accentColor + '33', borderColor: accentColor + '66' }]}>
            <Text style={[pw.pipText, { color: accentColor }]}>
              {prediction.confidence}
            </Text>
          </View>

          {/* Dismiss */}
          <TouchableOpacity
            onPress={onDismiss}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Action hint — the high-value line */}
        <Text style={pw.actionHint}>{prediction.actionHint}</Text>

        {/* Rationale — smaller, explains the signal */}
        <Text style={pw.rationale}>{prediction.rationale}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pw = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accentBar: {
    width: 3,
  },
  body: {
    flex: 1,
    padding: Spacing.md,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headline: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  spacer: { flex: 1 },
  pip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  pipText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  actionHint: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  rationale: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 16,
  },
});
