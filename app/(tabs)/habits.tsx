import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDirection } from '../../src/hooks/useDirection';
import { useAppStore } from '../../src/store/useAppStore';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../src/constants/theme';
import { getTodayDate } from '../../src/lib/utils';
import type { RecurringTask, RecurringTaskCategory } from '../../src/types';

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<RecurringTaskCategory, keyof typeof Ionicons.glyphMap> = {
  deep_work: 'code-slash-outline',
  body:      'barbell-outline',
  recovery:  'leaf-outline',
  religion:  'moon-outline',
  admin:     'clipboard-outline',
  learning:  'book-outline',
};

const CATEGORY_COLORS: Record<RecurringTaskCategory, string> = {
  deep_work: Colors.gold,
  body:      '#4ADE80',
  recovery:  Colors.purpleLight,
  religion:  '#818CF8',
  admin:     Colors.textMuted,
  learning:  '#60A5FA',
};

const ALL_CATEGORIES: RecurringTaskCategory[] = [
  'deep_work', 'body', 'recovery', 'religion', 'admin', 'learning',
];

const ALL_DOW = [0, 1, 2, 3, 4, 5, 6]; // Sun=0 … Sat=6

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isActiveToday(task: RecurringTask, todayDOW: number, offDays: number[]): boolean {
  if (!task.daysOfWeek.includes(todayDOW)) return false;
  if (task.skipOnOffDays && offDays.includes(todayDOW)) return false;
  return true;
}

function taskStreak(completedDates: string[], today: string): number {
  if (completedDates.length === 0) return 0;
  const set = new Set(completedDates);
  const startDate = set.has(today)
    ? today
    : (() => {
        const d = new Date(today);
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
      })();
  let streak = 0;
  const cursor = new Date(startDate + 'T12:00:00');
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function daysCoverageLabel(daysOfWeek: number[], t: (k: string) => string): string {
  if (daysOfWeek.length === 7) return t('routines.days_everyday');
  const weekdays = [1, 2, 3, 4, 5];
  const weekends = [0, 6];
  if (weekdays.every((d) => daysOfWeek.includes(d)) && daysOfWeek.length === 5)
    return t('routines.days_weekdays');
  if (weekends.every((d) => daysOfWeek.includes(d)) && daysOfWeek.length === 2)
    return t('routines.days_weekends');
  return (t('routines.days_custom') as string).replace('{{count}}', String(daysOfWeek.length));
}

// ─── Routine Row ──────────────────────────────────────────────────────────────

function RoutineRow({
  task, isDone, streak, isTodayActive, onComplete, onDelete,
}: {
  task: RecurringTask;
  isDone: boolean;
  streak: number;
  isTodayActive: boolean;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const dir   = useDirection();
  const color = CATEGORY_COLORS[task.category];

  return (
    <View style={[rr.wrap, isDone && rr.wrapDone, { flexDirection: dir.rowDir }]}>
      {/* Category accent */}
      <View style={[rr.accent, { backgroundColor: color }]} />

      <View style={rr.body}>
        {/* Title row */}
        <View style={[rr.titleRow, { flexDirection: dir.rowDir }]}>
          <TouchableOpacity
            onPress={isDone || !isTodayActive ? undefined : onComplete}
            style={[rr.checkbox, isDone && rr.checkboxDone, !isTodayActive && rr.checkboxInactive]}
            activeOpacity={isDone || !isTodayActive ? 1 : 0.7}
          >
            {isDone && <Ionicons name="checkmark" size={13} color={Colors.textInverse} />}
          </TouchableOpacity>
          <Text style={[rr.title, isDone && rr.titleDone]} numberOfLines={2}>{task.title}</Text>
          <TouchableOpacity onPress={onDelete} style={rr.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Meta chips */}
        <View style={[rr.metaRow, { flexDirection: dir.rowDir }]}>
          {/* Category chip */}
          <View style={[rr.catChip, { backgroundColor: color + '18', borderColor: color + '40' }]}>
            <Ionicons name={CATEGORY_ICONS[task.category]} size={10} color={color} />
            <Text style={[rr.catChipText, { color }]}>{t(`routines.cat_${task.category}`)}</Text>
          </View>
          {/* Duration */}
          <View style={[rr.metaChip, { flexDirection: dir.rowDir }]}>
            <Ionicons name="time-outline" size={10} color={Colors.textMuted} />
            <Text style={rr.metaText}>{task.durationMinutes} min</Text>
          </View>
          {/* Coverage */}
          <View style={[rr.metaChip, { flexDirection: dir.rowDir }]}>
            <Ionicons name="repeat-outline" size={10} color={Colors.textMuted} />
            <Text style={rr.metaText}>{daysCoverageLabel(task.daysOfWeek, t)}</Text>
          </View>
          {/* Active today badge */}
          {isTodayActive && !isDone && (
            <View style={[rr.todayBadge, { flexDirection: dir.rowDir }]}>
              <View style={rr.todayDot} />
              <Text style={rr.todayText}>{t('routines.active_today')}</Text>
            </View>
          )}
          {/* Skip-on-offdays indicator */}
          {task.skipOnOffDays && (
            <View style={[rr.skipChip, { flexDirection: dir.rowDir }]}>
              <Ionicons name="moon-outline" size={10} color={Colors.textMuted} />
              <Text style={rr.metaText}>{t('routines.skip_off_days')}</Text>
            </View>
          )}
          {/* Done badge */}
          {isDone && (
            <View style={[rr.doneChip, { flexDirection: dir.rowDir }]}>
              <Ionicons name="checkmark-circle" size={10} color={Colors.success} />
              <Text style={rr.doneText}>{t('routines.done_today')}</Text>
            </View>
          )}
          {/* Streak */}
          {streak >= 2 && (
            <View style={[rr.streakChip, { flexDirection: dir.rowDir }]}>
              <Text style={rr.streakEmoji}>🔥</Text>
              <Text style={rr.streakText}>
                {(t('routines.streak_days') as string).replace('{{count}}', String(streak))}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const rr = StyleSheet.create({
  wrap:        { flexDirection: 'row', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  wrapDone:    { opacity: 0.55 },
  accent:      { width: 3, alignSelf: 'stretch' },
  body:        { flex: 1, padding: Spacing.md, gap: 8 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkbox:    { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: Colors.borderLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkboxDone:    { backgroundColor: Colors.success, borderColor: Colors.success },
  checkboxInactive:{ borderColor: Colors.border, opacity: 0.4 },
  title:       { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, lineHeight: 22 },
  titleDone:   { textDecorationLine: 'line-through', color: Colors.textMuted },
  deleteBtn:   { padding: 3 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs, paddingStart: 34 },
  metaChip:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 3, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  metaText:    { fontSize: FontSize.xs, color: Colors.textSecondary },
  catChip:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  catChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  todayBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 3, backgroundColor: Colors.goldMuted, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.goldDim },
  todayDot:    { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.gold },
  todayText:   { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.semibold },
  skipChip:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 3, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  doneChip:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 3, backgroundColor: Colors.successMuted, borderRadius: Radius.full },
  doneText:    { fontSize: FontSize.xs, color: Colors.success },
  streakChip:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 3, backgroundColor: Colors.goldMuted, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.goldDim },
  streakEmoji: { fontSize: 10 },
  streakText:  { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.bold },
});

// ─── Category Group Header ────────────────────────────────────────────────────

function CategoryHeader({ category, count }: { category: RecurringTaskCategory; count: number }) {
  const { t } = useTranslation();
  const color = CATEGORY_COLORS[category];
  return (
    <View style={[cg.wrap]}>
      <View style={[cg.iconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={CATEGORY_ICONS[category]} size={13} color={color} />
      </View>
      <Text style={[cg.label, { color }]}>{t(`routines.cat_${category}`)}</Text>
      <Text style={cg.count}>{count}</Text>
    </View>
  );
}

const cg = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, paddingStart: 2 },
  iconWrap:{ width: 22, height: 22, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  label:   { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.8 },
  count:   { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
});

// ─── Day picker ───────────────────────────────────────────────────────────────

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function DayPicker({
  selected, onChange,
}: { selected: number[]; onChange: (days: number[]) => void }) {
  const toggle = (d: number) => {
    if (selected.includes(d)) {
      if (selected.length > 1) onChange(selected.filter((x) => x !== d));
    } else {
      onChange([...selected, d].sort((a, b) => a - b));
    }
  };

  return (
    <View style={dp.row}>
      {ALL_DOW.map((d) => {
        const active = selected.includes(d);
        return (
          <TouchableOpacity
            key={d}
            onPress={() => toggle(d)}
            style={[dp.btn, active && dp.btnActive]}
            activeOpacity={0.7}
          >
            <Text style={[dp.label, active && dp.labelActive]}>{DOW_LABELS[d]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const dp = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 6 },
  btn:        { width: 36, height: 36, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  btnActive:  { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  label:      { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  labelActive:{ color: Colors.gold, fontWeight: FontWeight.bold },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RoutinesScreen() {
  const { t } = useTranslation();
  const dir   = useDirection();
  const today = getTodayDate();
  const todayDOW = new Date(today + 'T12:00:00').getDay();

  const recurringTasks          = useAppStore((s) => s.recurringTasks);
  const addRecurringTask        = useAppStore((s) => s.addRecurringTask);
  const removeRecurringTask     = useAppStore((s) => s.removeRecurringTask);
  const completeRecurringTaskToday = useAppStore((s) => s.completeRecurringTaskToday);
  const offDays                 = useAppStore((s) => s.profile?.offDays ?? []);

  const [modalVisible, setModalVisible]   = useState(false);
  const [mTitle, setMTitle]               = useState('');
  const [mDuration, setMDuration]         = useState('30');
  const [mTime, setMTime]                 = useState('');
  const [mCategory, setMCategory]         = useState<RecurringTaskCategory>('body');
  const [mDays, setMDays]                 = useState<number[]>([...ALL_DOW]);
  const [mSkipOffDays, setMSkipOffDays]   = useState(false);
  const [mError, setMError]               = useState('');

  // Today's active + done counts
  const { todayActive, todayDone } = useMemo(() => {
    let active = 0;
    let done   = 0;
    recurringTasks.forEach((t) => {
      if (!isActiveToday(t, todayDOW, offDays)) return;
      active++;
      if (t.completedDates.includes(today)) done++;
    });
    return { todayActive: active, todayDone: done };
  }, [recurringTasks, todayDOW, offDays, today]);

  // Group by category — maintain consistent category order
  const grouped = useMemo(() => {
    const map = new Map<RecurringTaskCategory, RecurringTask[]>();
    ALL_CATEGORIES.forEach((c) => map.set(c, []));
    recurringTasks.forEach((t) => {
      map.get(t.category)?.push(t);
    });
    // Sort within category: active today first, pending before done
    map.forEach((tasks, cat) => {
      map.set(cat, [...tasks].sort((a, b) => {
        const aActive = isActiveToday(a, todayDOW, offDays);
        const bActive = isActiveToday(b, todayDOW, offDays);
        if (aActive !== bActive) return aActive ? -1 : 1;
        const aDone = a.completedDates.includes(today) ? 1 : 0;
        const bDone = b.completedDates.includes(today) ? 1 : 0;
        return aDone - bDone;
      }));
    });
    return map;
  }, [recurringTasks, todayDOW, offDays, today]);

  const openAdd = () => {
    setMTitle(''); setMDuration('30'); setMTime('');
    setMCategory('body'); setMDays([...ALL_DOW]); setMSkipOffDays(false); setMError('');
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!mTitle.trim()) { setMError(t('routines.error_title')); return; }
    const dur = parseInt(mDuration, 10);
    if (isNaN(dur) || dur <= 0) { setMError(t('routines.error_duration')); return; }
    if (mDays.length === 0) { setMError(t('schedule.error_days')); return; }
    addRecurringTask({
      title:           mTitle.trim(),
      durationMinutes: dur,
      category:        mCategory,
      daysOfWeek:      mDays,
      skipOnOffDays:   mSkipOffDays,
      preferredTime:   mTime.trim() || undefined,
    });
    setModalVisible(false);
  };

  const handleDelete = (task: RecurringTask) => {
    Alert.alert(task.title, t('routines.delete_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('routines.delete_btn'), style: 'destructive', onPress: () => removeRecurringTask(task.id) },
    ]);
  };

  const hasAny = recurringTasks.length > 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={[s.header, { flexDirection: dir.rowDir }]}>
        <View>
          <Text style={s.title}>{t('routines.title')}</Text>
          {hasAny && todayActive > 0 && (
            <Text style={s.subtitle}>
              {(t('routines.subtitle_today') as string)
                .replace('{{done}}', String(todayDone))
                .replace('{{total}}', String(todayActive))}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={openAdd} style={s.addBtn} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
      </View>

      {/* ── Progress strip ────────────────────────────────────────────────── */}
      {hasAny && todayActive > 0 && (
        <View style={s.progressStrip}>
          <View style={s.progressTrack}>
            <View style={[
              s.progressFill,
              { width: `${Math.round((todayDone / todayActive) * 100)}%` as any,
                backgroundColor: todayDone === todayActive ? Colors.success : Colors.gold },
            ]} />
          </View>
        </View>
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {!hasAny ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="repeat-outline" size={32} color={Colors.textMuted} />
            </View>
            <Text style={s.emptyTitle}>{t('routines.no_routines_title')}</Text>
            <Text style={s.emptySub}>{t('routines.no_routines_sub')}</Text>
            <TouchableOpacity onPress={openAdd} style={[s.emptyBtn, { flexDirection: dir.rowDir }]} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={Colors.textInverse} />
              <Text style={s.emptyBtnText}>{t('routines.add_first')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.list}>
            {ALL_CATEGORIES.map((cat) => {
              const tasks = grouped.get(cat) ?? [];
              if (tasks.length === 0) return null;
              return (
                <View key={cat}>
                  <CategoryHeader category={cat} count={tasks.length} />
                  <View style={s.catGroup}>
                    {tasks.map((task) => {
                      const isDone      = task.completedDates.includes(today);
                      const isTodayActive = isActiveToday(task, todayDOW, offDays);
                      const streak      = taskStreak(task.completedDates, today);
                      return (
                        <RoutineRow
                          key={task.id}
                          task={task}
                          isDone={isDone}
                          streak={streak}
                          isTodayActive={isTodayActive}
                          onComplete={() => completeRecurringTaskToday(task.id, today)}
                          onDelete={() => handleDelete(task)}
                        />
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Add Modal ────────────────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={[s.modalHeader, { flexDirection: dir.rowDir }]}>
              <Text style={s.modalTitle}>{t('routines.add_modal_title')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              <Input
                label={t('routines.title_label')}
                value={mTitle}
                onChangeText={(v) => { setMTitle(v); setMError(''); }}
                placeholder={t('routines.title_placeholder')}
                autoFocus
                error={mError}
              />

              {/* Category picker */}
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>{t('routines.category_label')}</Text>
                <View style={s.catGrid}>
                  {ALL_CATEGORIES.map((cat) => {
                    const active = mCategory === cat;
                    const color  = CATEGORY_COLORS[cat];
                    return (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => setMCategory(cat)}
                        style={[s.catBtn, active && { borderColor: color, backgroundColor: color + '18' }]}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={CATEGORY_ICONS[cat]} size={14} color={active ? color : Colors.textMuted} />
                        <Text style={[s.catBtnText, active && { color }]}>{t(`routines.cat_${cat}`)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <Input
                label={t('routines.duration_label')}
                value={mDuration}
                onChangeText={setMDuration}
                placeholder={t('routines.duration_placeholder')}
                keyboardType="number-pad"
              />

              <Input
                label={t('routines.time_label')}
                value={mTime}
                onChangeText={setMTime}
                placeholder={t('routines.time_placeholder')}
                keyboardType="numbers-and-punctuation"
              />

              {/* Day picker */}
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>{t('routines.days_label')}</Text>
                <DayPicker selected={mDays} onChange={setMDays} />
              </View>

              {/* Skip on off days */}
              <View style={[s.switchRow, { flexDirection: dir.rowDir }]}>
                <Text style={s.switchLabel}>{t('routines.skip_offdays_label')}</Text>
                <Switch
                  value={mSkipOffDays}
                  onValueChange={setMSkipOffDays}
                  trackColor={{ false: Colors.border, true: Colors.gold }}
                  thumbColor={Colors.textInverse}
                />
              </View>
            </ScrollView>

            <View style={[s.modalFooter, { flexDirection: dir.rowDir }]}>
              <Button label={t('common.cancel')} onPress={() => setModalVisible(false)} variant="secondary" style={s.modalBtn} />
              <Button label={t('routines.add_routine')} onPress={handleSave} style={s.modalBtn} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.background },
  flex:  { flex: 1 },
  scroll:{ flex: 1 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title:    { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  addBtn:   { width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', ...Shadow.gold },

  progressStrip: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  progressTrack: { height: 3, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: Radius.full },

  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  list:    { gap: Spacing.md },
  catGroup:{ gap: Spacing.sm, marginBottom: Spacing.xs },

  emptyWrap:    { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl },
  emptyIconWrap:{ width: 72, height: 72, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  emptyTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  emptySub:     { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  emptyBtn:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.gold, borderRadius: Radius.lg, paddingVertical: 12, paddingHorizontal: Spacing.lg, marginTop: Spacing.sm, ...Shadow.gold },
  emptyBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },

  // Modal
  modal:       { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  modalTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalBody:   { padding: Spacing.lg, gap: Spacing.lg },
  fieldGroup:  { gap: Spacing.sm },
  fieldLabel:  { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: FontWeight.semibold },
  catGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  catBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: Spacing.sm, paddingHorizontal: 12, borderRadius: Radius.md, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border },
  catBtnText:  { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  switchRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  switchLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary },
  modalFooter: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  modalBtn:    { flex: 1 },
});
