import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NudgeItem } from '../types';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../constants/theme';

interface NudgeBannerProps {
  nudge: NudgeItem;
  onDone: () => void;
  onSnooze: () => void;
  onSkip: () => void;
  /** Optional: show a "Start Focus" button for 'start' type nudges. */
  onFocus?: () => void;
}

const AUTO_DISMISS_MS = 30_000;

// Per-type display config
const TYPE_CONFIG = {
  start: {
    label:     'Time to start',
    icon:      'alarm-outline' as const,
    iconColor: Colors.gold,
    banner:    null,
  },
  missed: {
    label:     'Missed start',
    icon:      'alert-circle' as const,
    iconColor: Colors.error,
    banner:    'bannerMissed' as const,
  },
  checkin: {
    label:     'Recovery check-in',
    icon:      'refresh-circle-outline' as const,
    iconColor: Colors.gold,
    banner:    'bannerCheckin' as const,
  },
};

export function NudgeBanner({ nudge, onDone, onSnooze, onSkip, onFocus }: NudgeBannerProps) {
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 70,
      friction: 12,
    }).start();

    timerRef.current = setTimeout(onSkip, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [nudge.id]);

  const cfg         = TYPE_CONFIG[nudge.type] ?? TYPE_CONFIG.start;
  const isCheckin   = nudge.type === 'checkin';
  const showFocus   = nudge.type === 'start' && !!onFocus;

  return (
    <Animated.View
      style={[
        styles.banner,
        cfg.banner === 'bannerMissed'  && styles.bannerMissed,
        cfg.banner === 'bannerCheckin' && styles.bannerCheckin,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.iconWrap, isCheckin && styles.iconWrapCheckin]}>
          <Ionicons name={cfg.icon} size={16} color={cfg.iconColor} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.label}>{cfg.label}</Text>
          <Text style={styles.title} numberOfLines={2}>{nudge.itemTitle}</Text>
        </View>
        <TouchableOpacity onPress={onSkip} style={styles.closeBtn}>
          <Ionicons name="close" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        {isCheckin ? (
          /* Check-in type: no "Done", just acknowledge or snooze */
          <>
            <TouchableOpacity onPress={onDone} style={[styles.actionBtn, styles.actionDone]}>
              <Ionicons name="checkmark" size={13} color={Colors.textInverse} />
              <Text style={styles.actionDoneText}>Got it</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSnooze} style={styles.actionBtn}>
              <Ionicons name="time-outline" size={13} color={Colors.gold} />
              <Text style={styles.actionText}>Remind later</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSkip} style={styles.actionBtn}>
              <Text style={styles.skipText}>Dismiss</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Start / missed type: Done + optionally Start Focus + Snooze + Skip */
          <>
            <TouchableOpacity onPress={onDone} style={[styles.actionBtn, styles.actionDone]}>
              <Ionicons name="checkmark" size={13} color={Colors.textInverse} />
              <Text style={styles.actionDoneText}>Done</Text>
            </TouchableOpacity>
            {showFocus && (
              <TouchableOpacity onPress={onFocus} style={[styles.actionBtn, styles.actionFocus]}>
                <Ionicons name="play" size={13} color={Colors.textInverse} />
                <Text style={styles.actionFocusText}>Focus</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onSnooze} style={styles.actionBtn}>
              <Ionicons name="time-outline" size={13} color={Colors.gold} />
              <Text style={styles.actionText}>Snooze 10 min</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSkip} style={styles.actionBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  bannerMissed: {
    borderColor: Colors.error,
    backgroundColor: Colors.errorMuted,
  },
  bannerCheckin: {
    borderColor: Colors.goldDim,
    backgroundColor: Colors.goldMuted,
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
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapCheckin: {
    backgroundColor: Colors.goldDim,
  },
  textWrap: { flex: 1 },
  label:    { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  title:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  closeBtn: { padding: 4 },
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
  actionDone: {
    backgroundColor: Colors.gold,
  },
  actionFocus: {
    backgroundColor: Colors.goldDim,
  },
  actionDoneText:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textInverse },
  actionFocusText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textInverse },
  actionText:      { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.medium },
  skipText:        { fontSize: FontSize.xs, color: Colors.textMuted },
});
