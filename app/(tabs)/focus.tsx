import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { getTodayDate, generateId, getLocalDateStr } from '../../src/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatStudyTime(minutes: number): string {
  if (minutes === 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const DURATIONS = [25, 50, 90] as const;

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function TopicBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <View style={barStyles.row}>
      <Text style={barStyles.label} numberOfLines={1}>{label}</Text>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={barStyles.pct}>{pct}%</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { width: 90, fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  track: { flex: 1, height: 6, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: Radius.full },
  pct:   { width: 34, fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'right' },
});

// ─── Focus Screen ─────────────────────────────────────────────────────────────

export default function FocusScreen() {
  const goals          = useAppStore((s) => s.goals);
  const courses        = useAppStore((s) => s.courses);
  const topics         = useAppStore((s) => s.topics);
  const activeFocus    = useAppStore((s) => s.activeFocus);
  const focusSessions  = useAppStore((s) => s.focusSessions);
  const startFocus     = useAppStore((s) => s.startFocus);
  const endFocus       = useAppStore((s) => s.endFocus);
  const logDistraction = useAppStore((s) => s.logDistraction);

  const [selectedGoalId, setSelectedGoalId]     = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(50);
  const [showEndModal, setShowEndModal]         = useState(false);
  const [sessionNotes, setSessionNotes]         = useState('');
  const [elapsedSeconds, setElapsedSeconds]     = useState(0);
  const [showDistrInput, setShowDistrInput]     = useState(false);
  const [distractionText, setDistractionText]   = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (activeFocus) {
      const startMs = new Date(activeFocus.startedAt).getTime();
      const tick = () => setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      setElapsedSeconds(0);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeFocus]);

  const today = getTodayDate();
  const todaySessions = focusSessions.filter((s) => getLocalDateStr(new Date(s.start)) === today);
  const totalTodayMins = todaySessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);

  // Topics for active goal
  const goalTopics = useMemo(() => {
    const gid = activeFocus?.goalId ?? selectedGoalId;
    if (!gid) return [];
    const course = courses[0];
    if (!course) return [];
    const TOPIC_COLORS = [Colors.success, Colors.gold, '#6C63FF', '#F472B6', Colors.error];
    return topics
      .filter((t) => t.courseId === course.id)
      .slice(0, 5)
      .map((t, i) => ({
        label: t.name,
        pct:   Math.round(40 + Math.sin(i * 1.5) * 30 + 20),
        color: TOPIC_COLORS[i % TOPIC_COLORS.length],
      }));
  }, [activeFocus, selectedGoalId, courses, topics]);

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

  // Progress ring percentage
  const ringPct = activeFocus
    ? Math.min(1, elapsedSeconds / (activeFocus.durationMinutes * 60))
    : 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Focus</Text>

        {activeFocus ? (
          /* ── Active session ─────────────────────────────────────────────── */
          <View style={styles.activeCard}>
            {/* Subject + focus mode badge */}
            <View style={styles.activeTopRow}>
              <View>
                <Text style={styles.activeSubject}>{activeFocus.goalTitle}</Text>
                <Text style={styles.activeSubtitle}>Study Session</Text>
              </View>
              <View style={styles.focusBadge}>
                <Ionicons name="eye-off-outline" size={12} color={Colors.gold} />
                <Text style={styles.focusBadgeText}>Focus Mode</Text>
              </View>
            </View>

            {/* Big timer */}
            <View style={styles.timerWrap}>
              <Text style={styles.timer}>{formatTimer(elapsedSeconds)}</Text>
              <Text style={styles.timerSub}>
                {activeFocus.durationMinutes} min session · {Math.round(ringPct * 100)}% complete
              </Text>
            </View>

            {/* Focus mode hint */}
            <View style={styles.focusHint}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.focusHintText}>Eliminate distractions and stay focused.</Text>
            </View>

            {/* Topic progress bars */}
            {goalTopics.length > 0 && (
              <View style={styles.topicsSection}>
                <Text style={styles.topicsTitle}>Topics</Text>
                <View style={styles.topicsList}>
                  {goalTopics.map((t) => (
                    <TopicBar key={t.label} label={t.label} pct={t.pct} color={t.color} />
                  ))}
                </View>
              </View>
            )}

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
                <TouchableOpacity onPress={handleLogDistraction} style={styles.distrConfirm} activeOpacity={0.8}>
                  <Ionicons name="checkmark" size={16} color="#000" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.distrBtn} onPress={() => setShowDistrInput(true)} activeOpacity={0.7}>
                <Ionicons name="warning-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.distrBtnText}>Log distraction</Text>
              </TouchableOpacity>
            )}

            {/* Action buttons */}
            <View style={styles.sessionBtns}>
              <TouchableOpacity style={styles.pauseBtn} onPress={() => {}} activeOpacity={0.7}>
                <Ionicons name="pause" size={16} color={Colors.textSecondary} />
                <Text style={styles.pauseBtnText}>Pause</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.endBtn} onPress={() => setShowEndModal(true)} activeOpacity={0.8}>
                <Text style={styles.endBtnText}>End Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* ── Start session ────────────────────────────────────────────── */
          <>
            {/* Focus On */}
            <Text style={styles.sectionLabel}>FOCUS ON</Text>
            {goals.length === 0 ? (
              <Text style={styles.emptyNote}>Add goals in the Plan tab to link focus sessions.</Text>
            ) : (
              <View style={styles.chipWrap}>
                {goals.slice(0, 6).map((g) => {
                  const active = selectedGoalId === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setSelectedGoalId(active ? null : g.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                        {g.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Duration */}
            <Text style={styles.sectionLabel}>DURATION</Text>
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

            {/* Start */}
            <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.85}>
              <Ionicons name="flash" size={20} color="#000" />
              <Text style={styles.startBtnText}>Start Focus</Text>
            </TouchableOpacity>

            {/* Today's sessions */}
            {todaySessions.length > 0 && (
              <View style={styles.historySection}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Today</Text>
                  <Text style={styles.historyTotal}>{formatStudyTime(totalTodayMins)} total</Text>
                </View>
                {todaySessions.map((s) => {
                  const gTitle = goals.find((g) => g.id === s.goalId)?.title;
                  return (
                    <View key={s.id} style={styles.sessionRow}>
                      <View style={styles.sessionDot} />
                      <View style={styles.sessionInfo}>
                        <Text style={styles.sessionGoal}>{gTitle ?? 'Focus Session'}</Text>
                        <Text style={styles.sessionMeta}>
                          {s.durationMinutes ?? '—'} min{s.notes ? ` · ${s.notes}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* End session modal */}
      <Modal visible={showEndModal} transparent animationType="slide" onRequestClose={() => setShowEndModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
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
              <TouchableOpacity onPress={() => setShowEndModal(false)} style={styles.modalCancel} activeOpacity={0.7}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleEndConfirm} style={styles.modalConfirm} activeOpacity={0.8}>
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
  root:        { flex: 1, backgroundColor: Colors.background },
  content:     { padding: Spacing.lg, paddingBottom: Spacing.xxl + 20, gap: Spacing.md },
  screenTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.sm },

  // ── Active card
  activeCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  activeTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  activeSubject: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  activeSubtitle:{ fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  focusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.goldMuted, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.goldDim,
  },
  focusBadgeText: { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.semibold },

  // ── Timer
  timerWrap: { alignItems: 'center', paddingVertical: Spacing.md },
  timer:     { fontSize: 64, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  timerSub:  { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },

  // ── Focus hint
  focusHint: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  focusHintText: { fontSize: FontSize.xs, color: Colors.textMuted, flex: 1 },

  // ── Topics
  topicsSection: { gap: Spacing.sm },
  topicsTitle:   { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.8 },
  topicsList:    { gap: Spacing.sm },

  // ── Distraction
  distrBtn:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'flex-start' },
  distrBtnText:{ fontSize: FontSize.sm, color: Colors.textMuted },
  distrRow:    { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  distrInput: {
    flex: 1, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs + 2,
    color: Colors.textPrimary, fontSize: FontSize.sm,
  },
  distrConfirm: {
    backgroundColor: Colors.gold, borderRadius: Radius.sm,
    padding: Spacing.sm, alignItems: 'center', justifyContent: 'center',
  },

  // ── Session buttons
  sessionBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  pauseBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
    paddingVertical: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border,
  },
  pauseBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  endBtn: {
    flex: 2, paddingVertical: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.error + '22', borderWidth: 1, borderColor: Colors.error + '55',
    alignItems: 'center',
  },
  endBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.error },

  // ── Start session
  sectionLabel: {
    fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted,
    letterSpacing: 1, textTransform: 'uppercase', marginTop: Spacing.sm,
  },
  emptyNote: { fontSize: FontSize.sm, color: Colors.textMuted },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface, maxWidth: 200,
  },
  chipActive:     { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  chipText:       { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  chipTextActive: { color: Colors.gold, fontWeight: FontWeight.semibold },

  durationRow: { flexDirection: 'row', gap: Spacing.sm },
  durationChip: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface, alignItems: 'center',
  },
  durationChipActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  durationText:       { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  durationTextActive: { color: Colors.gold },

  startBtn: {
    backgroundColor: Colors.gold, borderRadius: Radius.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md + 2, gap: Spacing.sm, marginTop: Spacing.sm,
  },
  startBtnText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: '#000' },

  // ── History
  historySection: { marginTop: Spacing.md, gap: Spacing.sm },
  historyHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTitle:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  historyTotal:   { fontSize: FontSize.sm, color: Colors.textMuted },
  sessionRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sessionDot:     { width: 8, height: 8, borderRadius: Radius.full, backgroundColor: Colors.success },
  sessionInfo:    { flex: 1, gap: 2 },
  sessionGoal:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  sessionMeta:    { fontSize: FontSize.xs, color: Colors.textMuted },

  // ── End modal
  overlay:    { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surfaceElevated, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl,
  },
  modalTitle:       { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  notesInput: {
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.sm, minHeight: 80,
  },
  modalActions:     { flexDirection: 'row', gap: Spacing.sm },
  modalCancel: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  modalCancelText:  { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  modalConfirm:     { flex: 2, paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.gold, alignItems: 'center' },
  modalConfirmText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#000' },
});
