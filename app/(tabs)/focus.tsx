import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import { getTodayDate, generateId } from '../../src/lib/utils';

const DURATIONS = [25, 50, 90] as const;

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function FocusTab() {
  const goals           = useAppStore((s) => s.goals);
  const activeFocus     = useAppStore((s) => s.activeFocus);
  const focusSessions   = useAppStore((s) => s.focusSessions);
  const startFocus      = useAppStore((s) => s.startFocus);
  const endFocus        = useAppStore((s) => s.endFocus);
  const logDistraction  = useAppStore((s) => s.logDistraction);

  const [selectedGoalId, setSelectedGoalId]     = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(50);
  const [showEndModal, setShowEndModal]         = useState(false);
  const [sessionNotes, setSessionNotes]         = useState('');
  const [showDistrInput, setShowDistrInput]     = useState(false);
  const [distractionText, setDistractionText]   = useState('');
  const [elapsedSeconds, setElapsedSeconds]     = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drive elapsed-time counter from activeFocus.startedAt
  useEffect(() => {
    if (activeFocus) {
      const startMs = new Date(activeFocus.startedAt).getTime();
      const tick = () => setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      setElapsedSeconds(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeFocus]);

  const today = getTodayDate();
  const todaySessions = focusSessions.filter((s) => s.start.startsWith(today));
  const totalTodayMins = todaySessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);

  const handleStart = () => {
    const goal = goals.find((g) => g.id === selectedGoalId);
    startFocus({
      id: generateId(),
      goalId: selectedGoalId ?? undefined,
      goalTitle: goal?.title ?? 'Focus Session',
      durationMinutes: selectedDuration,
      startedAt: new Date().toISOString(),
    });
  };

  const handleEndConfirm = () => {
    endFocus(sessionNotes.trim() || undefined);
    setSessionNotes('');
    setShowEndModal(false);
  };

  const handleLogDistraction = () => {
    logDistraction(distractionText.trim() || undefined);
    setDistractionText('');
    setShowDistrInput(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <Text style={styles.title}>Focus</Text>

        {activeFocus ? (
          /* ── Active session ─────────────────────────────────────────────── */
          <View style={styles.activeCard}>
            <View style={styles.activeTopRow}>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>ACTIVE</Text>
              </View>
              <Text style={styles.elapsedTime}>{formatElapsed(elapsedSeconds)}</Text>
            </View>

            <Text style={styles.activeGoalTitle}>{activeFocus.goalTitle}</Text>
            <Text style={styles.activeSubtitle}>
              {activeFocus.durationMinutes} min session · started{' '}
              {new Date(activeFocus.startedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>

            {/* Distraction logger */}
            {showDistrInput ? (
              <View style={styles.distrRow}>
                <TextInput
                  style={styles.distrInput}
                  placeholder="What distracted you?"
                  placeholderTextColor={Colors.textMuted}
                  value={distractionText}
                  onChangeText={setDistractionText}
                  returnKeyType="done"
                  onSubmitEditing={handleLogDistraction}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={handleLogDistraction}
                  style={styles.distrConfirm}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark" size={18} color={Colors.textInverse} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.distrBtn}
                onPress={() => setShowDistrInput(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="warning-outline" size={15} color={Colors.textSecondary} />
                <Text style={styles.distrBtnText}>Log distraction</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.endBtn}
              onPress={() => setShowEndModal(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.endBtnText}>End Session</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── Start session ───────────────────────────────────────────────── */
          <>
            {/* Goal selector */}
            <Text style={styles.sectionLabel}>Focus on</Text>
            {goals.length === 0 ? (
              <Text style={styles.emptyNote}>
                Add life tracks in the Plan tab to link focus sessions.
              </Text>
            ) : (
              <View style={styles.chipGrid}>
                {goals.map((g) => {
                  const active = selectedGoalId === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.goalChip, active && styles.goalChipActive]}
                      onPress={() => setSelectedGoalId(active ? null : g.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.goalChipText, active && styles.goalChipTextActive]}>
                        {g.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Duration selector */}
            <Text style={styles.sectionLabel}>Duration</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map((d) => {
                const active = selectedDuration === d;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.durationChip, active && styles.durationChipActive]}
                    onPress={() => setSelectedDuration(d)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.durationText, active && styles.durationTextActive]}>
                      {d} min
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Start button */}
            <TouchableOpacity
              style={styles.startBtn}
              onPress={handleStart}
              activeOpacity={0.8}
            >
              <Ionicons name="flash" size={20} color={Colors.textInverse} />
              <Text style={styles.startBtnText}>Start Focus</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Today's sessions ─────────────────────────────────────────────── */}
        {todaySessions.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <Text style={styles.sectionLabel}>Today</Text>
              <Text style={styles.totalLabel}>{totalTodayMins} min total</Text>
            </View>
            {todaySessions.map((session) => {
              const goalTitle = goals.find((g) => g.id === session.goalId)?.title;
              return (
                <View key={session.id} style={styles.sessionRow}>
                  <View style={styles.sessionDot} />
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionGoal}>{goalTitle ?? 'Focus Session'}</Text>
                    <Text style={styles.sessionMeta}>
                      {session.durationMinutes ?? '—'} min
                      {session.notes ? ` · ${session.notes}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── End session modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showEndModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEndModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>End Session</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Session notes (optional)"
              placeholderTextColor={Colors.textMuted}
              value={sessionNotes}
              onChangeText={setSessionNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowEndModal(false)}
                style={styles.modalCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEndConfirm}
                style={styles.modalConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.modalConfirmText}>End Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },

  // ── Header
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },

  // ── Section labels
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  emptyNote: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },

  // ── Goal chips
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  goalChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  goalChipActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldMuted,
  },
  goalChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  goalChipTextActive: {
    color: Colors.gold,
  },

  // ── Duration chips
  durationRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  durationChip: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  durationChipActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldMuted,
  },
  durationText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  durationTextActive: {
    color: Colors.gold,
  },

  // ── Start button
  startBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  startBtnText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },

  // ── Active session card
  activeCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  activeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    backgroundColor: Colors.goldMuted,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  activeBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
    letterSpacing: 1,
  },
  elapsedTime: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  activeGoalTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  activeSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: -Spacing.sm,
  },

  // ── Distraction logger
  distrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
  },
  distrBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  distrRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  distrInput: {
    flex: 1,
    backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },
  distrConfirm: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── End button
  endBtn: {
    backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  endBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },

  // ── Today's sessions
  historySection: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.success,
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  sessionGoal: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
  },
  sessionMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // ── End session modal
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  notesInput: {
    backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    minHeight: 80,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  modalConfirm: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
});
