/**
 * ReentryBanner
 *
 * Soft re-entry surface shown when the user returns after missing ≥ 1 day.
 *
 * Design rules:
 *   - No guilt. No "you failed". Forward motion only.
 *   - Dismissible — if the user closes it, don't show it again this session.
 *   - No CTA button — the user just needs reassurance, not a task assigned.
 *   - Compact — one text line + dismiss. Does not displace other content.
 *
 * Props:
 *   message   — from buildReentryMessage(missedDays) — soft re-entry copy
 *   missedDays — number of missed days (used for intensity hint)
 *   onDismiss — called when user taps X
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

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  message: string;
  missedDays: number;
  onDismiss: () => void;
}

export function ReentryBanner({ message, missedDays, onDismiss }: Props) {
  // Intensity hint — purely informational, never critical
  const intensityHint = missedDays >= 3
    ? 'Light start recommended.'
    : missedDays >= 2
    ? 'Start with one task.'
    : null;

  return (
    <View style={rb.wrap}>
      <View style={rb.iconWrap}>
        <Ionicons name="leaf-outline" size={14} color={Colors.success} />
      </View>
      <View style={rb.content}>
        <Text style={rb.message}>{message}</Text>
        {intensityHint && (
          <Text style={rb.hint}>{intensityHint}</Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        activeOpacity={0.6}
        style={rb.dismiss}
      >
        <Ionicons name="close" size={14} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const rb = StyleSheet.create({
  wrap: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius:   Radius.md,
    borderWidth:    1,
    borderColor:    Colors.success + '30',
    paddingHorizontal: Spacing.md,
    paddingVertical:   10,
  },
  iconWrap: {
    width:          26,
    height:         26,
    borderRadius:   13,
    backgroundColor: Colors.success + '15',
    alignItems:     'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap:  2,
  },
  message: {
    fontSize:   FontSize.sm,
    color:      Colors.textPrimary,
    fontWeight: FontWeight.medium,
    lineHeight: 18,
  },
  hint: {
    fontSize:   FontSize.xs,
    color:      Colors.textSecondary,
    lineHeight: 16,
  },
  dismiss: {
    padding: 2,
  },
});
