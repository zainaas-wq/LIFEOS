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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDirection } from '../../src/hooks/useDirection';
import { useAppStore } from '../../src/store/useAppStore';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Badge } from '../../src/components/ui/Badge';
import { getGoalAllocation } from '../../src/lib/weeklyPlanner';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadow } from '../../src/constants/theme';
import type { Goal, GoalCategory, IdentityGoal, IdentityGoalType } from '../../src/types';

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<GoalCategory, keyof typeof Ionicons.glyphMap> = {
  study:  'book-outline',
  skill:  'code-slash-outline',
  health: 'fitness-outline',
  life:   'heart-outline',
  career: 'briefcase-outline',
};

const CATEGORY_COLOR: Record<GoalCategory, string> = {
  study: '#6C8EBF', skill: Colors.gold, health: '#4ADE80', life: '#F472B6', career: '#A78BFA',
};

const ALL_CATEGORIES: GoalCategory[] = ['study', 'skill', 'health', 'life', 'career'];

const PRIORITY_LABEL: Record<number, string> = {
  1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low', 5: 'Optional',
};

const IDENTITY_TYPES: IdentityGoalType[] = [
  'disciplined', 'fit', 'career', 'studying', 'less_distraction',
  'creative', 'spiritual', 'financial', 'social',
];

const IDENTITY_ICONS: Record<IdentityGoalType, keyof typeof Ionicons.glyphMap> = {
  disciplined:      'shield-checkmark-outline',
  fit:              'barbell-outline',
  career:           'briefcase-outline',
  studying:         'school-outline',
  less_distraction: 'phone-portrait-outline',
  creative:         'color-palette-outline',
  spiritual:        'moon-outline',
  financial:        'cash-outline',
  social:           'people-outline',
};

// ─── Identity Chip ────────────────────────────────────────────────────────────

function IdentityChip({
  goal, label, onRemove,
}: { goal: IdentityGoal; label: string; onRemove: () => void }) {
  const dir = useDirection();
  const icon = IDENTITY_ICONS[goal.type];
  return (
    <View style={[ic.wrap, { flexDirection: dir.rowDir }]}>
      <Ionicons name={icon} size={13} color={Colors.purpleLight} />
      <Text style={ic.label}>{goal.customLabel ?? label}</Text>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
        <Ionicons name="close" size={12} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const ic = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.purpleLight + '40' },
  label: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
});

// ─── Goal Card ────────────────────────────────────────────────────────────────

function GoalRow({
  goal, allocatedMins, onEdit, onDelete,
}: { goal: Goal; allocatedMins: number; onEdit: () => void; onDelete: () => void }) {
  const dir        = useDirection();
  const color      = CATEGORY_COLOR[goal.category];
  const neededMins = Math.round(goal.weeklyHoursTarget * 60);
  const pct        = neededMins > 0 ? Math.min(100, Math.round((allocatedMins / neededMins) * 100)) : 0;
  const covered    = pct >= 100;

  return (
    <View style={[gc.wrap, { flexDirection: dir.rowDir }]}>
      {/* Left accent */}
      <View style={[gc.accent, { backgroundColor: color }]} />

      <View style={gc.body}>
        {/* Header */}
        <View style={[gc.headerRow, { flexDirection: dir.rowDir }]}>
          <View style={[gc.iconWrap, { backgroundColor: color + '22' }]}>
            <Ionicons name={CATEGORY_ICONS[goal.category]} size={14} color={color} />
          </View>
          <Text style={gc.title} numberOfLines={1}>{goal.title}</Text>
          <TouchableOpacity onPress={onEdit} style={gc.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}>
            <Ionicons name="pencil-outline" size={15} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={gc.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
            <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Tags */}
        <View style={[gc.tagRow, { flexDirection: dir.rowDir }]}>
          <Text style={[gc.priorityTag, { color }]}>
            P{goal.priority} · {PRIORITY_LABEL[goal.priority] ?? ''}
          </Text>
          {goal.deadline && (
            <View style={[gc.deadlineChip, { flexDirection: dir.rowDir }]}>
              <Ionicons name="calendar-outline" size={10} color={Colors.textMuted} />
              <Text style={gc.deadlineText}>{goal.deadline}</Text>
            </View>
          )}
        </View>

        {/* Progress bar */}
        <View style={[gc.progressRow, { flexDirection: dir.rowDir }]}>
          <View style={gc.track}>
            <View style={[gc.fill, { width: `${pct}%` as any, backgroundColor: covered ? Colors.success : color }]} />
          </View>
          <Text style={[gc.progressLabel, covered && { color: Colors.success }]}>
            {(allocatedMins / 60).toFixed(1)}/{goal.weeklyHoursTarget.toFixed(1)}h
          </Text>
        </View>
      </View>
    </View>
  );
}

const gc = StyleSheet.create({
  wrap:        { flexDirection: 'row', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  accent:      { width: 3 },
  body:        { flex: 1, padding: Spacing.md, gap: 8 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap:    { width: 28, height: 28, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  title:       { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  actionBtn:   { padding: 3 },
  tagRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  priorityTag: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  deadlineChip:{ flexDirection: 'row', alignItems: 'center', gap: 3 },
  deadlineText:{ fontSize: FontSize.xs, color: Colors.textMuted },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  track:       { flex: 1, height: 4, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, overflow: 'hidden' },
  fill:        { height: '100%', borderRadius: Radius.full },
  progressLabel:{ fontSize: FontSize.xs, color: Colors.textMuted, minWidth: 64, textAlign: 'right' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const { t } = useTranslation();
  const dir = useDirection();

  const CATEGORIES = useMemo(() => [
    { value: 'study'  as GoalCategory, label: t('goalCategories.study'),  icon: CATEGORY_ICONS.study  },
    { value: 'skill'  as GoalCategory, label: t('goalCategories.skill'),  icon: CATEGORY_ICONS.skill  },
    { value: 'health' as GoalCategory, label: t('goalCategories.health'), icon: CATEGORY_ICONS.health },
    { value: 'life'   as GoalCategory, label: t('goalCategories.life'),   icon: CATEGORY_ICONS.life   },
    { value: 'career' as GoalCategory, label: t('goalCategories.career'), icon: CATEGORY_ICONS.career },
  ], [t]);

  const goals            = useAppStore((s) => s.goals);
  const weeklyPlan       = useAppStore((s) => s.weeklyPlan);
  const identityGoals    = useAppStore((s) => s.identityGoals);
  const addGoal          = useAppStore((s) => s.addGoal);
  const updateGoal       = useAppStore((s) => s.updateGoal);
  const deleteGoal       = useAppStore((s) => s.deleteGoal);
  const addIdentityGoal  = useAppStore((s) => s.addIdentityGoal);
  const removeIdentityGoal = useAppStore((s) => s.removeIdentityGoal);

  const [showIdentityPicker, setShowIdentityPicker] = useState(false);
  const [activeFilter, setActiveFilter] = useState<GoalCategory | 'all'>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle]     = useState('');
  const [category, setCategory] = useState<GoalCategory>('skill');
  const [hoursStr, setHoursStr] = useState('5');
  const [priority, setPriority] = useState(2);
  const [deadline, setDeadline] = useState('');
  const [error, setError]     = useState('');

  const allocation       = getGoalAllocation(goals, weeklyPlan);
  const totalWeeklyHours = goals.reduce((s, g) => s + g.weeklyHoursTarget, 0);
  const coveredCount     = allocation.filter((a) => a.pct >= 100).length;

  const sortedGoals = useMemo(
    () => [...goals].sort((a, b) => a.priority - b.priority),
    [goals],
  );

  const filteredGoals = useMemo(
    () => activeFilter === 'all' ? sortedGoals : sortedGoals.filter(g => g.category === activeFilter),
    [sortedGoals, activeFilter],
  );

  const openAdd = () => {
    setEditingId(null);
    setTitle(''); setCategory('skill'); setHoursStr('5');
    setPriority(2); setDeadline(''); setError('');
    setModalVisible(true);
  };

  const openEdit = (goal: Goal) => {
    setEditingId(goal.id);
    setTitle(goal.title); setCategory(goal.category);
    setHoursStr(String(goal.weeklyHoursTarget));
    setPriority(goal.priority); setDeadline(goal.deadline ?? ''); setError('');
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!title.trim()) { setError(t('goals.error_title_required')); return; }
    const hours = parseFloat(hoursStr);
    if (isNaN(hours) || hours <= 0) { setError(t('goals.error_hours_invalid')); return; }

    if (editingId) {
      updateGoal(editingId, { title: title.trim(), category, weeklyHoursTarget: hours, priority, deadline: deadline || undefined });
    } else {
      addGoal({ title: title.trim(), category, weeklyHoursTarget: hours, priority, deadline: deadline || undefined });
    }
    setModalVisible(false);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* ── Fixed header ──────────────────────────────────────────────────── */}
      <View style={[s.header, { flexDirection: dir.rowDir }]}>
        <View>
          <Text style={s.title}>{t('goals.title')}</Text>
          {goals.length > 0 && (
            <Text style={s.subtitle}>{goals.length} active · {totalWeeklyHours.toFixed(0)}h/week</Text>
          )}
        </View>
        <TouchableOpacity onPress={openAdd} style={s.addBtn} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
      </View>

      {/* ── Summary strip ────────────────────────────────────────────────── */}
      {goals.length > 0 && (
        <View style={[s.summaryStrip, { flexDirection: dir.rowDir }]}>
          <View style={s.statCol}>
            <Text style={s.statVal}>{goals.length}</Text>
            <Text style={s.statLabel}>{t('goals.goals_stat')}</Text>
          </View>
          <View style={s.statSep} />
          <View style={s.statCol}>
            <Text style={[s.statVal, { color: Colors.gold }]}>{totalWeeklyHours.toFixed(1)}h</Text>
            <Text style={s.statLabel}>{t('goals.per_week')}</Text>
          </View>
          <View style={s.statSep} />
          <View style={s.statCol}>
            <Text style={[s.statVal, { color: coveredCount === goals.length ? Colors.success : Colors.textPrimary }]}>
              {coveredCount}/{goals.length}
            </Text>
            <Text style={s.statLabel}>{t('goals.covered')}</Text>
          </View>
        </View>
      )}

      {/* ── Category filter tabs ─────────────────────────────────────────── */}
      {goals.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
          style={s.filterScroll}
        >
          <TouchableOpacity
            onPress={() => setActiveFilter('all')}
            style={[s.filterTab, activeFilter === 'all' && s.filterTabActive]}
            activeOpacity={0.7}
          >
            <Text style={[s.filterTabText, activeFilter === 'all' && s.filterTabTextActive]}>All</Text>
          </TouchableOpacity>
          {CATEGORIES.map(({ value, label, icon }) => {
            const count = goals.filter(g => g.category === value).length;
            if (count === 0) return null;
            const color = CATEGORY_COLOR[value];
            const isActive = activeFilter === value;
            return (
              <TouchableOpacity
                key={value}
                onPress={() => setActiveFilter(value)}
                style={[s.filterTab, isActive && { borderColor: color, backgroundColor: color + '18' }]}
                activeOpacity={0.7}
              >
                <Ionicons name={icon} size={12} color={isActive ? color : Colors.textMuted} />
                <Text style={[s.filterTabText, isActive && { color }]}>{label}</Text>
                <View style={[s.filterCount, isActive && { backgroundColor: color + '30' }]}>
                  <Text style={[s.filterCountText, isActive && { color }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Identity section ─────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>{t('goals.identity_section')}</Text>
            <Text style={s.sectionSub}>{t('goals.identity_sub')}</Text>
          </View>
        </View>

        {identityGoals.length === 0 && !showIdentityPicker ? (
          <View style={s.identityEmpty}>
            <Text style={s.identityEmptyTitle}>{t('goals.identity_empty_title')}</Text>
            <Text style={s.identityEmptySub}>{t('goals.identity_empty_sub')}</Text>
            <TouchableOpacity onPress={() => setShowIdentityPicker(true)} style={[s.identityAddBtn, { flexDirection: dir.rowDir }]} activeOpacity={0.8}>
              <Ionicons name="add" size={14} color={Colors.purpleLight} />
              <Text style={s.identityAddText}>{t('goals.add_identity')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.identityChips}>
            {identityGoals.map((ig) => (
              <IdentityChip
                key={ig.id}
                goal={ig}
                label={t(`goals.identity_type_${ig.type}`)}
                onRemove={() => removeIdentityGoal(ig.id)}
              />
            ))}
            <TouchableOpacity onPress={() => setShowIdentityPicker((p) => !p)} style={[s.identityAddSmall, { flexDirection: dir.rowDir }]} activeOpacity={0.8}>
              <Ionicons name={showIdentityPicker ? 'chevron-up' : 'add'} size={14} color={Colors.purpleLight} />
              {!showIdentityPicker && <Text style={s.identityAddText}>{t('goals.add_identity')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {showIdentityPicker && (
          <View style={s.identityPickerWrap}>
            {IDENTITY_TYPES.filter((type) => !identityGoals.find((g) => g.type === type)).map((type) => {
              const icon = IDENTITY_ICONS[type];
              return (
                <TouchableOpacity
                  key={type}
                  style={[s.identityPickerBtn, { flexDirection: dir.rowDir }]}
                  onPress={() => {
                    addIdentityGoal(type);
                    setShowIdentityPicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={icon} size={15} color={Colors.purpleLight} />
                  <Text style={s.identityPickerLabel}>{t(`goals.identity_type_${type}`)}</Text>
                  <Ionicons name="add-circle-outline" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity onPress={() => setShowIdentityPicker(false)} style={s.identityPickerClose} activeOpacity={0.7}>
              <Text style={s.identityPickerCloseText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Projects separator ─────────────────────────────────────────── */}
        <View style={[s.sectionHeader, { marginTop: Spacing.lg }]}>
          <View>
            <Text style={s.sectionTitle}>{t('goals.projects_section')}</Text>
            <Text style={s.sectionSub}>{t('goals.projects_sub')}</Text>
          </View>
          <TouchableOpacity onPress={openAdd} style={s.sectionAddBtn} activeOpacity={0.8}>
            <Ionicons name="add" size={18} color={Colors.textInverse} />
          </TouchableOpacity>
        </View>

        {filteredGoals.length === 0 ? (
          goals.length === 0 ? (
            /* First-time user: no goals at all */
            <View style={s.emptyWrap}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="flag" size={28} color={Colors.gold} />
              </View>
              <Text style={s.emptyTitle}>{t('goals.no_goals_title')}</Text>
              <Text style={s.emptyText}>{t('goals.no_goals_text')}</Text>
              <TouchableOpacity onPress={openAdd} style={[s.emptyBtn, { flexDirection: dir.rowDir }]} activeOpacity={0.8}>
                <Ionicons name="add" size={16} color={Colors.textInverse} />
                <Text style={s.emptyBtnText}>{t('goals.add_first_goal')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Category filter is empty */
            <View style={s.emptyWrap}>
              <Ionicons name="filter-outline" size={32} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>No goals in this category</Text>
              <Text style={s.emptyText}>Try a different filter, or add a goal to this category.</Text>
              <TouchableOpacity onPress={openAdd} style={[s.emptyBtn, { flexDirection: dir.rowDir }]} activeOpacity={0.8}>
                <Ionicons name="add" size={16} color={Colors.textInverse} />
                <Text style={s.emptyBtnText}>Add goal here</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          <View style={s.goalList}>
            {filteredGoals.map((goal) => {
              const alloc = allocation.find((x) => x.goal.id === goal.id);
              return (
                <GoalRow
                  key={goal.id}
                  goal={goal}
                  allocatedMins={alloc?.allocatedMins ?? 0}
                  onEdit={() => openEdit(goal)}
                  onDelete={() => deleteGoal(goal.id)}
                />
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Add / Edit Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView style={s.modalRoot} behavior="padding" keyboardVerticalOffset={0}>
          <View style={s.modal}>
            {/* Modal header */}
            <View style={[s.modalHeader, { flexDirection: dir.rowDir }]}>
              <Text style={s.modalTitle}>
                {editingId ? t('goals.edit_modal_title') : t('goals.new_modal_title')}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              <Input
                label={t('goals.goal_title_label')}
                value={title}
                onChangeText={(v) => { setTitle(v); setError(''); }}
                placeholder={t('goals.goal_title_placeholder')}
                autoFocus
                error={error}
              />

              {/* Category picker */}
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>{t('goals.category_label')}</Text>
                <View style={s.catGrid}>
                  {CATEGORIES.map(({ value, label, icon }) => {
                    const active = category === value;
                    const color  = CATEGORY_COLOR[value];
                    return (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setCategory(value)}
                        style={[s.catBtn, active && { borderColor: color, backgroundColor: color + '18' }]}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={icon} size={16} color={active ? color : Colors.textMuted} />
                        <Text style={[s.catBtnText, active && { color }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <Input
                label={t('goals.weekly_hours_label')}
                value={hoursStr}
                onChangeText={setHoursStr}
                placeholder={t('goals.weekly_hours_placeholder')}
                keyboardType="decimal-pad"
                hint={t('goals.weekly_hours_hint')}
              />

              {/* Priority */}
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>{t('goals.priority_label')}</Text>
                <View style={s.priorityRow}>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setPriority(p)}
                      style={[s.priorityBtn, priority === p && s.priorityBtnActive]}
                    >
                      <Text style={[s.priorityBtnText, priority === p && s.priorityBtnTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.priorityHint}>{PRIORITY_LABEL[priority] ?? ''}</Text>
              </View>

              <Input
                label={t('goals.deadline_label')}
                value={deadline}
                onChangeText={setDeadline}
                placeholder={t('goals.deadline_placeholder')}
                keyboardType="numbers-and-punctuation"
              />
            </ScrollView>

            <View style={[s.modalFooter, { flexDirection: dir.rowDir }]}>
              <Button
                label={t('common.cancel')}
                onPress={() => setModalVisible(false)}
                variant="secondary"
                style={s.modalBtn}
              />
              <Button
                label={editingId ? t('goals.save_changes') : t('goals.add_goal')}
                onPress={handleSave}
                style={s.modalBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // Header
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

  // Summary strip
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  statCol:  { flex: 1, alignItems: 'center', gap: 3 },
  statSep:  { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.06)' },
  statVal:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -0.5 },
  statLabel:{ fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: FontWeight.medium },

  // Filter tabs
  filterScroll: { maxHeight: 48, marginBottom: Spacing.sm },
  filterRow:    { paddingHorizontal: Spacing.lg, gap: Spacing.xs, alignItems: 'center', height: 40 },
  filterTab:    {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  filterTabActive:    { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  filterTabText:      { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  filterTabTextActive:{ color: Colors.gold, fontWeight: FontWeight.semibold },
  filterCount:        { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.full, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterCountText:    { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.bold },

  // List
  scroll:   { flex: 1 },
  content:  { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  goalList: { gap: Spacing.sm },

  // Empty state
  emptyWrap:    { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl },
  emptyIconWrap:{ width: 64, height: 64, borderRadius: Radius.full, backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  emptyText:    { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyBtn:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.gold, borderRadius: Radius.lg, paddingVertical: 12, paddingHorizontal: Spacing.lg, marginTop: Spacing.sm, ...Shadow.gold },
  emptyBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },

  // Modal
  modalRoot:   { flex: 1 },
  modal:       { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalBody:  { padding: Spacing.lg, gap: Spacing.lg },
  fieldGroup: { gap: Spacing.sm },
  fieldLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: FontWeight.semibold },
  catGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  catBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: Spacing.sm, paddingHorizontal: 12,
    borderRadius: Radius.md, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  catBtnText:    { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  priorityRow:   { flexDirection: 'row', gap: Spacing.sm },
  priorityBtn:   { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  priorityBtnActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  priorityBtnText:   { fontSize: FontSize.md, color: Colors.textSecondary },
  priorityBtnTextActive: { color: Colors.gold, fontWeight: FontWeight.bold },
  priorityHint:      { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
  modalFooter: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  modalBtn:    { flex: 1 },

  // Identity section
  sectionHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  sectionTitle:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  sectionSub:         { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  sectionAddBtn:      { width: 30, height: 30, borderRadius: Radius.full, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 2 },

  identityEmpty:      { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.xs, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: Spacing.sm },
  identityEmptyTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  identityEmptySub:   { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18 },
  identityAddBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, alignSelf: 'flex-start' },
  identityAddSmall:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.purpleLight + '40', backgroundColor: Colors.surfaceElevated },
  identityAddText:    { fontSize: FontSize.xs, color: Colors.purpleLight, fontWeight: FontWeight.medium },
  identityChips:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },

  identityPickerWrap: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginBottom: Spacing.md, overflow: 'hidden' },
  identityPickerBtn:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  identityPickerLabel:{ flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },
  identityPickerClose:{ paddingHorizontal: Spacing.md, paddingVertical: 10, alignItems: 'center' },
  identityPickerCloseText: { fontSize: FontSize.sm, color: Colors.textMuted },
});
