import React, { useState } from 'react';
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
import { useAppStore } from '../../src/store/useAppStore';
import { GoalCard } from '../../src/components/GoalCard';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { SectionHeader } from '../../src/components/SectionHeader';
import { getGoalAllocation } from '../../src/lib/weeklyPlanner';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/constants/theme';
import type { Goal, GoalCategory } from '../../src/types';

const CATEGORIES: { value: GoalCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'study',  label: 'Study',  icon: 'book-outline'         },
  { value: 'skill',  label: 'Skill',  icon: 'code-slash-outline'   },
  { value: 'health', label: 'Health', icon: 'fitness-outline'      },
  { value: 'life',   label: 'Life',   icon: 'heart-outline'        },
  { value: 'career', label: 'Career', icon: 'briefcase-outline'    },
];

const CATEGORY_COLOR: Record<GoalCategory, string> = {
  study: '#6C8EBF', skill: Colors.gold, health: '#4ADE80', life: '#F472B6', career: '#A78BFA',
};

export default function GoalsScreen() {
  const goals = useAppStore((s) => s.goals);
  const weeklyPlan = useAppStore((s) => s.weeklyPlan);
  const addGoal = useAppStore((s) => s.addGoal);
  const updateGoal = useAppStore((s) => s.updateGoal);
  const deleteGoal = useAppStore((s) => s.deleteGoal);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<GoalCategory>('skill');
  const [hoursStr, setHoursStr] = useState('5');
  const [priority, setPriority] = useState(2);
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');

  const allocation = getGoalAllocation(goals, weeklyPlan);
  const totalWeeklyHours = goals.reduce((s, g) => s + g.weeklyHoursTarget, 0);

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
    }
    setModalVisible(false);
  };

  const sortedGoals = [...goals].sort((a, b) => a.priority - b.priority);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.screenLabel}>Goals</Text>
            <Text style={styles.screenTitle}>Weekly Targets</Text>
          </View>
          <TouchableOpacity onPress={openAdd} style={styles.addBtn} activeOpacity={0.7}>
            <Ionicons name="add" size={22} color={Colors.gold} />
          </TouchableOpacity>
        </View>

        {/* Summary card */}
        {goals.length > 0 && (
          <Card gold>
            <View style={styles.summaryRow}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryNum}>{goals.length}</Text>
                <Text style={styles.summaryLabel}>Goals</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryStat}>
                <Text style={styles.summaryNum}>{totalWeeklyHours.toFixed(1)}h</Text>
                <Text style={styles.summaryLabel}>Per week</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryStat}>
                <Text style={styles.summaryNum}>
                  {allocation.filter((a) => a.pct >= 100).length}/{goals.length}
                </Text>
                <Text style={styles.summaryLabel}>Covered</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Goals list */}
        <View style={styles.section}>
          <SectionHeader title="Your Goals" />
          {sortedGoals.length === 0 ? (
            <Card>
              <View style={styles.emptyCard}>
                <Ionicons name="flag-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No goals yet</Text>
                <Text style={styles.emptyText}>
                  Define what you want to achieve this week.{'\n'}
                  LifeOS will schedule sessions for you.
                </Text>
                <Button label="Add First Goal" onPress={openAdd} variant="ghost" size="sm" />
              </View>
            </Card>
          ) : (
            sortedGoals.map((goal) => {
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
            })
          )}
        </View>

        {/* Category breakdown */}
        {goals.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="By Category" />
            <Card elevated>
              {CATEGORIES.map(({ value, label, icon }) => {
                const cat = goals.filter((g) => g.category === value);
                if (!cat.length) return null;
                const hrs = cat.reduce((s, g) => s + g.weeklyHoursTarget, 0);
                return (
                  <View key={value} style={styles.catRow}>
                    <Ionicons name={icon} size={14} color={CATEGORY_COLOR[value]} />
                    <Text style={styles.catLabel}>{label}</Text>
                    <Text style={styles.catCount}>{cat.length} goal{cat.length > 1 ? 's' : ''}</Text>
                    <Text style={[styles.catHours, { color: CATEGORY_COLOR[value] }]}>{hrs.toFixed(1)}h/wk</Text>
                  </View>
                );
              })}
            </Card>
          </View>
        )}
      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Goal' : 'New Goal'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Input label="Goal Title" value={title}
                onChangeText={(t) => { setTitle(t); setError(''); }}
                placeholder="e.g. Learn TypeScript, Run 5k, Read books"
                autoFocus error={error} />

              {/* Category picker */}
              <View>
                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.catGrid}>
                  {CATEGORIES.map(({ value, label, icon }) => {
                    const active = category === value;
                    const color = CATEGORY_COLOR[value];
                    return (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setCategory(value)}
                        style={[
                          styles.catBtn,
                          active && { borderColor: color, backgroundColor: color + '18' },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={icon} size={16} color={active ? color : Colors.textMuted} />
                        <Text style={[styles.catBtnText, active && { color }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Hours target */}
              <Input label="Weekly Hours Target" value={hoursStr}
                onChangeText={setHoursStr} placeholder="e.g. 5"
                keyboardType="decimal-pad"
                hint="How many hours per week do you want to dedicate to this goal?" />

              {/* Priority */}
              <View>
                <Text style={styles.fieldLabel}>Priority  (1 = Highest)</Text>
                <View style={styles.priorityRow}>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setPriority(p)}
                      style={[styles.priorityBtn, priority === p && styles.priorityBtnActive]}
                    >
                      <Text style={[styles.priorityBtnText, priority === p && styles.priorityBtnTextActive]}>
                        {p}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Input label="Deadline (optional)" value={deadline}
                onChangeText={setDeadline} placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation" />
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button label="Cancel" onPress={() => setModalVisible(false)} variant="secondary" style={styles.modalBtn} />
              <Button label={editingId ? 'Save Changes' : 'Add Goal'} onPress={handleSave} style={styles.modalBtn} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  screenLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  screenTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 2 },
  addBtn: {
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryStat: { flex: 1, alignItems: 'center', gap: 2 },
  summaryNum: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.gold },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDivider: { width: 1, height: 32, backgroundColor: Colors.goldDim, opacity: 0.4 },
  section: { gap: Spacing.xs },
  emptyCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  catLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },
  catCount: { fontSize: FontSize.xs, color: Colors.textMuted },
  catHours: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, minWidth: 48, textAlign: 'right' },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalBody: { padding: Spacing.lg, gap: Spacing.md },
  fieldLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },
  catGrid: { flexDirection: 'row', gap: Spacing.sm },
  catBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', gap: 4,
  },
  catBtnText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  priorityRow: { flexDirection: 'row', gap: Spacing.sm },
  priorityBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  priorityBtnActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  priorityBtnText: { fontSize: FontSize.md, color: Colors.textSecondary },
  priorityBtnTextActive: { color: Colors.gold, fontWeight: FontWeight.bold },
  modalFooter: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
  modalBtn: { flex: 1 },
});
