import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NudgeItem, NudgeUrgency } from '../types';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../constants/theme';

interface NudgeBannerProps {
  nudge:    NudgeItem;
  onDone:   () => void;
  onSnooze: () => void;
  onSkip:   () => void;
}

const AUTO_DISMISS_MS = 45_000;

// Urgency → accent color
const URGENCY_COLOR: Record<NudgeUrgency, string> = {
  low:      Colors.gold,
  medium:   Colors.gold,
  high:     '#FB923C', // orange
  critical: '#F87171', // red
};

const URGENCY_LABEL: Record<NudgeUrgency, string> = {
  low:      'Suggested',
  medium:   'Time to start',
  high:     'High priority',
  critical: 'Critical — act now',
};

export function NudgeBanner({ nudge, onDone, onSnooze, onSkip }: NudgeBannerProps) {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0, useNativeDriver: true, tension: 70, friction: 12,
    }).start();

    timerRef.current = setTimeout(onSkip, AUTO_DISMISS_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [nudge.id]);

  const isMissed   = nudge.type === 'missed';
  const isRecovery = nudge.isRecovery ?? false;
  const urgency    = nudge.urgency ?? (isMissed ? 'medium' : 'low');
  const accent     = isRecovery ? Colors.error : (isMissed ? Colors.error : URGENCY_COLOR[urgency]);
  const headerLabel =
    isRecovery           ? 'Recovery mode' :
    isMissed             ? 'Missed start' :
    URGENCY_LABEL[urgency];

  const headerIcon =
    isRecovery ? 'refresh-circle-outline' :
    isMissed   ? 'alert-circle'           :
    urgency === 'critical' ? 'flash'      : 'alarm-outline';

  return (
    <Animated.View
      style={[
        styles.banner,
        { borderColor: accent + '88' },
        (isMissed || isRecovery) && { backgroundColor: Colors.errorMuted },
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Urgency accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      {/* Header row */}
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: accent + '22', borderColor: accent + '44' }]}>
          <Ionicons name={headerIcon} size={15} color={accent} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.label, { color: accent }]}>{headerLabel}</Text>
          <Text style={styles.title} numberOfLines={1}>{nudge.itemTitle}</Text>
        </View>
        <TouchableOpacity onPress={onSkip} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Context reason — the WHY */}
      {!!nudge.contextReason && (
        <View style={styles.contextRow}>
          <Ionicons name="information-circle-outline" size={12} color={Colors.textMuted} style={styles.contextIcon} />
          <Text style={styles.contextText}>{nudge.contextReason}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity onPress={onDone} style={[styles.actionBtn, styles.actionDone, { backgroundColor: accent }]}>
          <Ionicons name="checkmark" size={13} color={Colors.textInverse} />
          <Text style={styles.actionDoneText}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSnooze} style={styles.actionBtn}>
          <Ionicons name="time-outline" size={13} color={accent} />
          <Text style={[styles.actionText, { color: accent }]}>Snooze 10 min</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSkip} style={styles.actionBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  iconWrap: {
    width: 30, height: 30, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  textWrap:  { flex: 1, gap: 1 },
  label:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  title:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  closeBtn:  { padding: 4 },

  contextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  contextIcon: { marginTop: 1 },
  contextText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
  },

  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.xs + 2,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  actionDone:     { backgroundColor: Colors.gold },
  actionDoneText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textInverse },
  actionText:     { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  skipText:       { fontSize: FontSize.xs, color: Colors.textMuted },
});
