import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PlanBlock, Goal } from '../types';
import { useAppStore } from '../store/useAppStore';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { formatTime } from '../lib/utils';

interface FocusModalProps {
  block: PlanBlock | null;
  goal?: Goal;
  visible: boolean;
  onClose: () => void;
}

const STAY_ON_TRACK_MESSAGES = [
  'Deep work. No interruptions.',
  'Every minute counts.',
  'Stay locked in. This is your time.',
  'One thing. Full attention.',
  'Silence everything else.',
  'You decided to be here. Honor that.',
  'Progress over perfection.',
  'Block the noise. Do the work.',
];

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function FocusModal({ block, goal, visible, onClose }: FocusModalProps) {
  const startFocus = useAppStore((s) => s.startFocus);
  const endFocus = useAppStore((s) => s.endFocus);
  const togglePlanBlockCompleted = useAppStore((s) => s.togglePlanBlockCompleted);

  const [phase, setPhase] = useState<'idle' | 'active' | 'done'>('idle');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [messageIdx, setMessageIdx] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const durationMins = block
    ? (() => {
        const [sh, sm] = block.startTime.split(':').map(Number);
        const [eh, em] = block.endTime.split(':').map(Number);
        return (eh * 60 + em) - (sh * 60 + sm);
      })()
    : 25;

  // Pulse animation for active timer
  useEffect(() => {
    if (phase === 'active') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [phase]);

  // Rotate message every 30 s
  useEffect(() => {
    if (phase !== 'active') return;
    const t = setInterval(() => {
      setMessageIdx((i) => (i + 1) % STAY_ON_TRACK_MESSAGES.length);
    }, 30_000);
    return () => clearInterval(t);
  }, [phase]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleStart = useCallback(() => {
    if (!block) return;
    setSecondsLeft(durationMins * 60);
    setPhase('active');
    setMessageIdx(0);

    startFocus({
      id: Math.random().toString(36).slice(2),
      goalId: block.goalId,
      goalTitle: goal?.title ?? 'Focus Session',
      durationMinutes: durationMins,
      startedAt: new Date().toISOString(),
    });

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          setPhase('done');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [block, durationMins, goal, startFocus, clearTimer]);

  const handleEnd = useCallback(
    (markDone = false) => {
      clearTimer();
      endFocus();
      if (markDone && block) togglePlanBlockCompleted(block.id);
      setPhase('idle');
      onClose();
    },
    [clearTimer, endFocus, togglePlanBlockCompleted, block, onClose],
  );

  // Reset when modal reopens
  useEffect(() => {
    if (!visible) {
      clearTimer();
      setPhase('idle');
    }
  }, [visible, clearTimer]);

  if (!block) return null;

  const pct = phase === 'active' ? secondsLeft / (durationMins * 60) : 1;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => handleEnd(false)}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>Focus Session</Text>
          <TouchableOpacity onPress={() => handleEnd(false)} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Goal info */}
        <View style={styles.goalRow}>
          <Ionicons name="flash" size={16} color={Colors.gold} />
          <Text style={styles.goalTitle}>{goal?.title ?? 'Focus Session'}</Text>
        </View>
        <Text style={styles.timeRange}>
          {formatTime(block.startTime)} – {formatTime(block.endTime)} · {durationMins} min
        </Text>

        {/* Timer ring */}
        <Animated.View style={[styles.timerRing, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.timerText}>
            {phase === 'done'
              ? '✓'
              : phase === 'active'
              ? formatCountdown(secondsLeft)
              : formatCountdown(durationMins * 60)}
          </Text>
          <Text style={styles.timerLabel}>
            {phase === 'done' ? 'Completed' : phase === 'active' ? 'remaining' : 'duration'}
          </Text>
        </Animated.View>

        {/* Progress bar */}
        {phase === 'active' && (
          <View style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressFill, { width: `${Math.round((1 - pct) * 100)}%` as any }]}
            />
          </View>
        )}

        {/* Stay-on-track message */}
        {phase === 'active' && (
          <View style={styles.messageBox}>
            <Text style={styles.message}>
              {STAY_ON_TRACK_MESSAGES[messageIdx]}
            </Text>
          </View>
        )}

        {/* Done message */}
        {phase === 'done' && (
          <View style={styles.doneBox}>
            <Text style={styles.doneTitle}>Session complete.</Text>
            <Text style={styles.doneSubtitle}>
              {durationMins} minutes of focused work done.
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {phase === 'idle' && (
            <TouchableOpacity onPress={handleStart} style={styles.startBtn} activeOpacity={0.8}>
              <Ionicons name="flash" size={18} color={Colors.textInverse} />
              <Text style={styles.startLabel}>Start Focus</Text>
            </TouchableOpacity>
          )}

          {phase === 'active' && (
            <TouchableOpacity
              onPress={() => handleEnd(false)}
              style={styles.stopBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.stopLabel}>End Session</Text>
            </TouchableOpacity>
          )}

          {phase === 'done' && (
            <TouchableOpacity
              onPress={() => handleEnd(true)}
              style={styles.startBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark" size={18} color={Colors.textInverse} />
              <Text style={styles.startLabel}>Mark Complete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 4,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  goalTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    flex: 1,
  },
  timeRange: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  timerRing: {
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 3,
    borderColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xxl,
    backgroundColor: Colors.goldMuted,
  },
  timerText: {
    fontSize: 48,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
    letterSpacing: -1,
  },
  timerLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  progressTrack: {
    height: 2,
    backgroundColor: Colors.surfaceHigh,
    marginTop: Spacing.xl,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
  },
  messageBox: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.goldMuted,
    borderRadius: Radius.md,
    borderLeftWidth: 2,
    borderLeftColor: Colors.gold,
  },
  message: {
    fontSize: FontSize.md,
    color: Colors.gold,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
  },
  doneBox: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  doneTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.success,
  },
  doneSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  actions: {
    position: 'absolute',
    bottom: Spacing.xxl,
    left: Spacing.lg,
    right: Spacing.lg,
  },
  startBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  startLabel: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
  stopBtn: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  stopLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
});
