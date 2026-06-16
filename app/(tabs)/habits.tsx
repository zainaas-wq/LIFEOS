import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import type { Habit, HabitFrequency } from '../../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLast7Days(): Date[] {
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function calcStreak(completedDates: string[]): number {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (completedDates.includes(toDateStr(d))) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

const FREQ_LABEL: Record<HabitFrequency, string> = {
  daily:    'Daily',
  weekdays: 'Weekdays',
  weekends: 'Weekends',
  custom:   'Custom',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ICON_OPTIONS: Array<keyof typeof Ionicons.glyphMap> = [
  'fitness-outline', 'book-outline', 'water-outline', 'moon-outline',
  'walk-outline', 'barbell-outline', 'musical-notes-outline', 'code-slash-outline',
  'leaf-outline', 'heart-outline', 'cafe-outline', 'bicycle-outline',
];

const COLOR_OPTIONS = [
  '#6C63FF', '#0D9488', '#FB923C', '#F87171',
  '#4ADE80', '#C9A84C', '#38BDF8', '#F472B6',
];

const FREQ_OPTIONS: HabitFrequency[] = ['daily', 'weekdays', 'weekends'];

// ─── Habit Row ────────────────────────────────────────────────────────────────

function HabitRow({
  habit,
  days,
  onToggleDate,
  onDelete,
}: {
  habit: Habit;
  days: Date[];
  onToggleDate: (date: string) => void;
  onDelete: () => void;
}) {
  const streak = useMemo(() => calcStreak(habit.completedDates), [habit.completedDates]);

  return (
    <View style={styles.habitRow}>
      <TouchableOpacity
        style={styles.habitDelete}
        onPress={() =>
          Alert.alert('Delete Habit', `Delete "${habit.title}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onDelete },
          ])
        }
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={[styles.iconCircle, { backgroundColor: habit.color + '33', borderColor: habit.color + '88' }]}>
          <Ionicons name={habit.icon as keyof typeof Ionicons.glyphMap} size={18} color={habit.color} />
        </View>
      </TouchableOpacity>

      <View style={styles.habitMeta}>
        <Text style={styles.habitTitle} numberOfLines={1}>{habit.title}</Text>
        <Text style={styles.habitFreq}>{FREQ_LABEL[habit.frequency]}</Text>
      </View>

      <View style={styles.dayGrid}>
        {days.map((day) => {
          const dateStr = toDateStr(day);
          const done = habit.completedDates.includes(dateStr);
          return (
            <TouchableOpacity
              key={dateStr}
              onPress={() => onToggleDate(dateStr)}
              style={[styles.dayDot, done && styles.dayDotDone]}
              activeOpacity={0.7}
            >
              {done && <Ionicons name="checkmark" size={12} color={Colors.background} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.streakBox}>
        <Ionicons name="flame" size={14} color={streak > 0 ? Colors.gold : Colors.textMuted} />
        <Text style={[styles.streakNum, { color: streak > 0 ? Colors.gold : Colors.textMuted }]}>
          {streak}
        </Text>
      </View>
    </View>
  );
}

// ─── Add Habit Modal ──────────────────────────────────────────────────────────

function AddHabitModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (h: Omit<Habit, 'id' | 'createdAt' | 'completedDates'>) => void;
}) {
  const [title, setTitle]       = useState('');
  const [frequency, setFreq]    = useState<HabitFrequency>('daily');
  const [icon, setIcon]         = useState<string>(ICON_OPTIONS[0]);
  const [color, setColor]       = useState(COLOR_OPTIONS[0]);
  const [error, setError]       = useState('');

  const reset = () => {
    setTitle(''); setFreq('daily'); setIcon(ICON_OPTIONS[0]); setColor(COLOR_OPTIONS[0]); setError('');
  };

  const handleSave = () => {
    if (!title.trim()) { setError('Habit title is required.'); return; }
    onSave({ title: title.trim(), frequency, icon, color });
    reset();
    onClose();
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Habit</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View>
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={[styles.textInput, error ? { borderColor: Colors.error } : undefined]}
                value={title}
                onChangeText={(t) => { setTitle(t); setError(''); }}
                placeholder="e.g. Morning workout, Read 20 pages"
                placeholderTextColor={Colors.textMuted}
                autoFocus
              />
              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            <View>
              <Text style={styles.fieldLabel}>Frequency</Text>
              <View style={styles.chipRow}>
                {FREQ_OPTIONS.map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.freqChip, frequency === f && styles.freqChipActive]}
                    onPress={() => setFreq(f)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.freqChipText, frequency === f && styles.freqChipTextActive]}>
                      {FREQ_LABEL[f]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={styles.fieldLabel}>Icon</Text>
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map((ic) => (
                  <TouchableOpacity
                    key={ic}
                    style={[styles.iconOption, icon === ic && { borderColor: color, backgroundColor: color + '22' }]}
                    onPress={() => setIcon(ic)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={ic} size={20} color={icon === ic ? color : Colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={styles.fieldLabel}>Color</Text>
              <View style={styles.colorRow}>
                {COLOR_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSwatchActive]}
                    onPress={() => setColor(c)}
                    activeOpacity={0.7}
                  >
                    {color === c && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>Add Habit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HabitsScreen() {
  const habits         = useAppStore((s) => s.habits);
  const addHabit       = useAppStore((s) => s.addHabit);
  const deleteHabit    = useAppStore((s) => s.deleteHabit);
  const toggleHabitDate = useAppStore((s) => s.toggleHabitDate);

  const [modalVisible, setModalVisible] = useState(false);

  const last7Days = useMemo(() => getLast7Days(), []);

  const completedToday = habits.filter((h) =>
    h.completedDates.includes(toDateStr(new Date()))
  ).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>Consistency</Text>
          <Text style={styles.headerTitle}>Habits</Text>
        </View>
        <TouchableOpacity style={styles.headerIcon} activeOpacity={0.7}>
          <Ionicons name="settings-outline" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {habits.length > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{habits.length}</Text>
            <Text style={styles.statLabel}>Habits</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: Colors.success }]}>{completedToday}</Text>
            <Text style={styles.statLabel}>Done Today</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{habits.length - completedToday}</Text>
            <Text style={styles.statLabel}>Remaining</Text>
          </View>
        </View>
      )}

      {habits.length > 0 && (
        <View style={styles.dayHeader}>
          <View style={styles.dayHeaderSpacer} />
          {last7Days.map((d) => (
            <View key={toDateStr(d)} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderText}>{DAY_INITIAL[d.getDay()]}</Text>
              <Text style={[
                styles.dayHeaderDate,
                toDateStr(d) === toDateStr(new Date()) && styles.dayHeaderDateToday,
              ]}>
                {d.getDate()}
              </Text>
            </View>
          ))}
          <View style={styles.streakHeaderSpacer} />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {habits.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="flame-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No habits yet</Text>
            <Text style={styles.emptyText}>
              Build consistency by tracking daily habits.{'\n'}Streaks keep you accountable.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setModalVisible(true)} activeOpacity={0.8}>
              <Text style={styles.emptyBtnText}>Add your first habit</Text>
            </TouchableOpacity>
          </View>
        ) : (
          habits.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              days={last7Days}
              onToggleDate={(date) => toggleHabitDate(habit.id, date)}
              onDelete={() => deleteHabit(habit.id)}
            />
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={Colors.textInverse} />
      </TouchableOpacity>

      <AddHabitModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={addHabit}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 100, gap: Spacing.sm },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  headerLabel: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 2 },
  headerIcon: { padding: Spacing.xs },

  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, padding: Spacing.md,
  },
  statItem:  { flex: 1, alignItems: 'center', gap: 3 },
  statNum:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs - 1, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  statDiv:   { width: 1, backgroundColor: Colors.border, marginVertical: 4 },

  dayHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dayHeaderSpacer:     { width: 52 + Spacing.md },
  dayHeaderCell:       { flex: 1, alignItems: 'center', gap: 2 },
  dayHeaderText:       { fontSize: FontSize.xs - 1, color: Colors.textMuted, fontWeight: FontWeight.semibold },
  dayHeaderDate:       { fontSize: FontSize.xs - 1, color: Colors.textMuted },
  dayHeaderDateToday:  { color: Colors.gold, fontWeight: FontWeight.bold },
  streakHeaderSpacer:  { width: 44 },

  habitRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  habitDelete: {},
  iconCircle: {
    width: 40, height: 40, borderRadius: Radius.full,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  habitMeta:  { flex: 1, minWidth: 0 },
  habitTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  habitFreq:  { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },

  dayGrid: { flexDirection: 'row', gap: 4 },
  dayDot: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dayDotDone: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },

  streakBox: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 36 },
  streakNum: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  emptyState: {
    alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.xxl, marginTop: Spacing.xl,
  },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  emptyText:  { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyBtn: {
    backgroundColor: Colors.gold, borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm + 2,
    marginTop: Spacing.sm,
  },
  emptyBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },

  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalBody:  { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  modalFooter: {
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border,
  },

  fieldLabel: {
    fontSize: FontSize.xs, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs,
    fontWeight: FontWeight.semibold,
  },
  textInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.md, color: Colors.textPrimary,
  },
  errorText: { fontSize: FontSize.xs, color: Colors.error, marginTop: 4 },

  chipRow:       { flexDirection: 'row', gap: Spacing.sm },
  freqChip: {
    flex: 1, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center',
  },
  freqChipActive:     { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  freqChipText:       { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  freqChipTextActive: { color: Colors.gold, fontWeight: FontWeight.bold },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  iconOption: {
    width: 48, height: 48, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },

  colorRow:         { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  colorSwatch: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  colorSwatchActive: { borderWidth: 2.5, borderColor: Colors.textPrimary },

  cancelBtn: {
    flex: 1, paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center',
  },
  cancelBtnText: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  saveBtn: {
    flex: 1, paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md, backgroundColor: Colors.gold, alignItems: 'center',
  },
  saveBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },
});
