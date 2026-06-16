import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { track } from '../../src/services/analyticsService';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { getGoalAllocation } from '../../src/lib/weeklyPlanner';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/constants/theme';
import type { Goal, GoalCategory } from '../../src/types';

const CATEGORIES: { value: GoalCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'study',  label: 'Study',  icon: 'book-outline'       },
  { value: 'skill',  label: 'Skill',  icon: 'code-slash-outline' },
  { value: 'health', label: 'Health', icon: 'fitness-outline'    },
  { value: 'life',   label: 'Life',   icon: 'heart-outline'      },
  { value: 'career', label: 'Career', icon: 'briefcase-outline'  },
];

const CATEGORY_COLOR: Record<GoalCategory, string> = {
  study: '#6C8EBF', skill: Colors.gold, health: '#4ADE80', life: '#F472B6', career: '#A78BFA',
};

const CATEGORY_ICON: Record<GoalCategory, keyof typeof Ionicons.glyphMap> = {
  study: 'book', skill: 'code-slash', health: 'fitness', life: 'heart', career: 'briefcase',
};

type GoalTab = 'active' | 'completed';

function isGoalCompleted(g: Goal): boolean {
  if (!g.deadline) return false;
  return new Date(g.deadline) < new Date();
}

function daysLeft(deadline: string): number {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
}

// ─── Goal card ────────────────────────────────────────────────────────────────

function GoalCard({
  goal, allocatedMins, onEdit, onDelete,
}: {
  goal: Goal;
  allocatedMins: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const color     = CATEGORY_COLOR[goal.category];
  const iconName  = CATEGORY_ICON[goal.category];
  const targetMins = goal.weeklyHoursTarget * 60;
  const pct       = targetMins > 0 ? Math.min(100, Math.round((allocatedMins / targetMins) * 100)) : 0;
  const completed = isGoalCompleted(goal);
  const days      = goal.deadline && !completed ? daysLeft(goal.deadline) : null;

  return (
    <TouchableOpacity style={gcS.card} onPress={onEdit} activeOpacity={0.75}>
      <View style={gcS.row}>
        <View style={[gcS.iconWrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Ionicons name={iconName} size={18} color={color} />
        </View>
        <View style={gcS.body}>
          <Text style={gcS.title} numberOfLines={1}>{goal.title}</Text>
          <Text style={gcS.meta}>
            {goal.weeklyHoursTarget}h/wk
            {days !== null ? `  ·  ${days}d left` : ''}
          </Text>
        </View>
        <View style={gcS.right}>
          <Text style={[gcS.pct, { color }]}>{pct}%</Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Delete Goal', `Delete "${goal.title}"?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: onDelete },
            ])}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={gcS.track}>
        <View style={[gcS.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      {completed && (
        <View style={[gcS.badge, { backgroundColor: color + '18' }]}>
          <Ionicons name="checkmark-circle" size={12} color={color} />
          <Text style={[gcS.badgeText, { color }]}>Deadline passed</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const gcS = StyleSheet.create({
  card:    { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  row:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap:{ width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  body:    { flex: 1, gap: 3 },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  meta:    { fontSize: FontSize.xs, color: Colors.textMuted },
  right:   { alignItems: 'flex-end', gap: 6 },
  pct:     { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  track:   { height: 5, backgroundColor: Colors.surfaceHigh, borderRadius: 3, overflow: 'hidden' },
  fill:    { height: '100%', borderRadius: 3 },
  badge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start' },
  badgeText:{ fontSize: FontSize.xs, fontWeight: FontWeight.medium },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const goals                  = useAppStore((s) => s.goals);
  const weeklyPlan             = useAppStore((s) => s.weeklyPlan);
  const addGoal                = useAppStore((s) => s.addGoal);
  const updateGoal             = useAppStore((s) => s.updateGoal);
  const deleteGoal             = useAppStore((s) => s.deleteGoal);
  const computeGoalIntelligence = useAppStore((s) => s.computeGoalIntelligence);

  useEffect(() => { computeGoalIntelligence(); }, [goals]);

  const [tab,         setTab]         = useState<GoalTab>('active');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);

  const [title,    setTitle]    = useState('');
  const [category, setCategory] = useState<GoalCategory>('skill');
  const [hoursStr, setHoursStr] = useState('5');
  const [priority, setPriority] = useState(2);
  const [deadline, setDeadline] = useState('');
  const [error,    setError]    = useState('');

  const allocation = getGoalAllocation(goals, weeklyPlan);

  const activeGoals    = useMemo(() => goals.filter((g) => !isGoalCompleted(g)).sort((a, b) => a.priority - b.priority), [goals]);
  const completedGoals = useMemo(() => goals.filter(isGoalCompleted).sort((a, b) => a.priority - b.priority), [goals]);
  const displayGoals   = tab === 'active' ? activeGoals : completedGoals;

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
    if (!title.trim()) { setError('Goal title is required.'); return; }
    const hours = parseFloat(hoursStr);
    if (isNaN(hours) || hours <= 0) { setError('Enter a valid number of hours (e.g. 5).'); return; }
    if (editingId) {
      updateGoal(editingId, { title: title.trim(), category, weeklyHoursTarget: hours, priority, deadline: deadline || undefined });
    } else {
      addGoal({ title: title.trim(), category, weeklyHoursTarget: hours, priority, deadline: deadline || undefined });
      track('goal_created', { category, has_deadline: !!deadline });
    }
    setModalVisible(false);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <Text style={s.screenTitle}>Goals</Text>
          <TouchableOpacity onPress={openAdd} style={s.addBtn} activeOpacity={0.7}>
            <Ionicons name="add" size={22} color={Colors.gold} />
          </TouchableOpacity>
        </View>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <View style={s.tabRow}>
          {(['active', 'completed'] as GoalTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && s.tabActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'active' ? `Active  ${activeGoals.length}` : `Completed  ${completedGoals.length}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Goals list ──────────────────────────────────────────────────── */}
        {displayGoals.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="flag-outline" size={36} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>
              {tab === 'active' ? 'No active goals' : 'No completed goals'}
            </Text>
            {tab === 'active' && (
              <Button label="Add First Goal" onPress={openAdd} variant="ghost" size="sm" />
            )}
          </View>
        ) : (
          <View style={s.list}>
            {displayGoals.map((goal) => {
              const a = allocation.find((x) => x.goal.id === goal.id);
              return (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  allocatedMins={a?.allocatedMins ?? 0}
                  onEdit={() => openEdit(goal)}
                  onDelete={() => deleteGoal(goal.id)}
                />
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Add / Edit Modal ────────────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingId ? 'Edit Goal' : 'New Goal'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              <Input
                label="Goal Title"
                value={title}
                onChangeText={(t) => { setTitle(t); setError(''); }}
                placeholder="e.g. Learn TypeScript, Run 5k"
                autoFocus
                error={error}
              />

              <View>
                <Text style={s.fieldLabel}>Category</Text>
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
                        <Ionicons name={icon} size={15} color={active ? color : Colors.textMuted} />
                        <Text style={[s.catBtnText, active && { color }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <Input
                label="Weekly Hours Target"
                value={hoursStr}
                onChangeText={setHoursStr}
                placeholder="5"
                keyboardType="decimal-pad"
                hint="Hours per week you want to dedicate to this goal"
              />

              <View>
                <Text style={s.fieldLabel}>Priority  (1 = Highest)</Text>
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
              </View>

              <Input
                label="Deadline (optional)"
                value={deadline}
                onChangeText={setDeadline}
                placeholder="YYYY-MM-DD"
              />
            </ScrollView>

            <View style={s.modalFooter}>
              <Button label="Cancel" onPress={() => setModalVisible(false)} variant="secondary" style={{ flex: 1 }} />
              <Button label={editingId ? 'Save' : 'Add Goal'} onPress={handleSave} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  screenTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  addBtn:      { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },

  tabRow: { flexDirection: 'row', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 4, gap: 4 },
  tab:    { flex: 1, paddingVertical: 8, borderRadius: Radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.surfaceHigh },
  tabText:   { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  tabTextActive: { color: Colors.textPrimary, fontWeight: FontWeight.semibold },

  list:  { gap: Spacing.sm },
  empty: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  emptyTitle: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.medium },

  modal:       { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalBody:   { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  modalFooter: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },

  fieldLabel:  { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },
  catGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  catBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceElevated },
  catBtnText:  { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  priorityRow: { flexDirection: 'row', gap: Spacing.xs },
  priorityBtn: { flex: 1, height: 40, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  priorityBtnActive:    { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  priorityBtnText:      { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  priorityBtnTextActive:{ color: Colors.gold, fontWeight: FontWeight.bold },
});
