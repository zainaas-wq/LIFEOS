import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../src/store/useAppStore";
import { getTodayDate } from "../../src/lib/utils";
import { Colors, Spacing, FontSize, FontWeight, Radius } from "../../src/constants/theme";
import type { PlanItem, Task } from "../../src/types";

type FilterTab = "today" | "upcoming" | "completed";

const BORDER_COLORS = ["#6C63FF", "#0D9488", "#FB923C", "#F87171"];

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function PlanItemRow({ item, index, onToggle }: { item: PlanItem; index: number; onToggle: () => void }) {
  const borderColor = BORDER_COLORS[index % BORDER_COLORS.length];
  return (
    <View style={[s.taskRow, { borderLeftColor: borderColor }]}>
      <View style={s.taskContent}>
        <Text style={[s.taskTitle, item.completed && s.taskTitleDone]} numberOfLines={1}>{item.title}</Text>
        <Text style={s.taskTime}>{fmtTime(item.startTime)} - {fmtTime(item.endTime)}</Text>
      </View>
      <TouchableOpacity onPress={onToggle} style={s.checkbox} activeOpacity={0.7}>
        <View style={[s.checkCircle, item.completed && s.checkCircleDone]}>
          {item.completed && <Ionicons name="checkmark" size={12} color={Colors.textInverse} />}
        </View>
      </TouchableOpacity>
    </View>
  );
}

function TaskRow({ task, index, onToggle }: { task: Task; index: number; onToggle: () => void }) {
  const borderColor = BORDER_COLORS[index % BORDER_COLORS.length];
  return (
    <View style={[s.taskRow, { borderLeftColor: borderColor }]}>
      <View style={s.taskContent}>
        <Text style={[s.taskTitle, task.completed && s.taskTitleDone]} numberOfLines={1}>{task.title}</Text>
        {task.date ? <Text style={s.taskTime}>{task.date}</Text> : null}
      </View>
      <TouchableOpacity onPress={onToggle} style={s.checkbox} activeOpacity={0.7}>
        <View style={[s.checkCircle, task.completed && s.checkCircleDone]}>
          {task.completed && <Ionicons name="checkmark" size={12} color={Colors.textInverse} />}
        </View>
      </TouchableOpacity>
    </View>
  );
}

export function ControlDailyView() {
  const controlPlan           = useAppStore((s) => s.controlPlan);
  const goals                 = useAppStore((s) => s.goals);
  const toggleControlPlanItem = useAppStore((s) => s.toggleControlPlanItem);
  const generateControlPlanAction = useAppStore((s) => s.generateControlPlanAction);
  const today = getTodayDate();

  const handleGenerate = useCallback(() => {
    if (!goals.length) { Alert.alert("No goals", "Add goals in the Goals section first."); return; }
    generateControlPlanAction(today);
  }, [goals.length, today, generateControlPlanAction]);

  const items = (controlPlan?.plan.items ?? []).filter((i) => i.type !== "break");

  if (!controlPlan) {
    return (
      <View style={s.emptyState}>
        <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
        <Text style={s.emptyTitle}>No plan for today</Text>
        <Text style={s.emptyText}>Generate your daily control plan to see your tasks.</Text>
        <TouchableOpacity style={s.generateBtn} onPress={handleGenerate} activeOpacity={0.85}>
          <Text style={s.generateBtnText}>Generate Today's Plan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={s.emptyState}>
        <Ionicons name="checkmark-circle-outline" size={40} color={Colors.textMuted} />
        <Text style={s.emptyTitle}>All clear today</Text>
        <Text style={s.emptyText}>No actionable items in today's plan.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {items.map((item, i) => (
        <PlanItemRow key={item.id} item={item} index={i} onToggle={() => toggleControlPlanItem(item.id)} />
      ))}
    </View>
  );
}

export default function PlannerScreen() {
  const controlPlan               = useAppStore((s) => s.controlPlan);
  const tasks                     = useAppStore((s) => s.tasks);
  const toggleControlPlanItem     = useAppStore((s) => s.toggleControlPlanItem);
  const toggleTask                = useAppStore((s) => s.toggleTask);
  const generateControlPlanAction = useAppStore((s) => s.generateControlPlanAction);
  const goals                     = useAppStore((s) => s.goals);

  const [activeTab, setActiveTab] = useState<FilterTab>("today");
  const today = getTodayDate();

  const planItems: PlanItem[] = controlPlan?.plan.items ?? [];
  const todayItems            = planItems.filter((i) => i.type !== "break");
  const upcomingTasks         = tasks.filter((t) => !t.completed);
  const completedPlanItems    = planItems.filter((i) => i.completed);
  const completedTasks        = tasks.filter((t) => t.completed);
  const totalCount            = planItems.length + tasks.length;

  const handleGeneratePlan = useCallback(() => {
    if (!goals.length) { Alert.alert("No goals", "Add goals in the Goals section first."); return; }
    generateControlPlanAction(today);
  }, [goals.length, today, generateControlPlanAction]);

  const handleFAB = () => {
    if (!controlPlan) {
      Alert.alert("No Plan Yet", "Generate today’s plan first?", [
        { text: "Cancel", style: "cancel" },
        { text: "Generate", onPress: handleGeneratePlan },
      ]);
    } else {
      Alert.alert("Tasks", "Add tasks via Goals or the Study screens.");
    }
  };

  const renderContent = () => {
    if (activeTab === "today") {
      if (!controlPlan) {
        return (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No plan yet</Text>
            <Text style={s.emptyText}>Generate your daily plan to see tasks here.</Text>
            <TouchableOpacity style={s.generateBtn} onPress={handleGeneratePlan} activeOpacity={0.85}>
              <Text style={s.generateBtnText}>Generate Today’s Plan</Text>
            </TouchableOpacity>
          </View>
        );
      }
      if (todayItems.length === 0) {
        return (
          <View style={s.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={48} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No tasks today</Text>
            <Text style={s.emptyText}>Your plan has no actionable items.</Text>
          </View>
        );
      }
      return todayItems.map((item, i) => (
        <PlanItemRow key={item.id} item={item} index={i} onToggle={() => toggleControlPlanItem(item.id)} />
      ));
    }

    if (activeTab === "upcoming") {
      if (upcomingTasks.length === 0) {
        return (
          <View style={s.emptyState}>
            <Ionicons name="list-outline" size={48} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No upcoming tasks</Text>
            <Text style={s.emptyText}>Tasks added via Goals and Study will appear here.</Text>
          </View>
        );
      }
      return upcomingTasks.map((task, i) => (
        <TaskRow key={task.id} task={task} index={i} onToggle={() => toggleTask(task.id)} />
      ));
    }

    const allDone = [...completedPlanItems, ...completedTasks];
    if (allDone.length === 0) {
      return (
        <View style={s.emptyState}>
          <Ionicons name="trophy-outline" size={48} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>Nothing completed yet</Text>
          <Text style={s.emptyText}>Completed tasks will show up here.</Text>
        </View>
      );
    }
    return (
      <>
        {completedPlanItems.map((item, i) => (
          <PlanItemRow key={item.id} item={item} index={i} onToggle={() => toggleControlPlanItem(item.id)} />
        ))}
        {completedTasks.map((task, i) => (
          <TaskRow key={task.id} task={task} index={completedPlanItems.length + i} onToggle={() => toggleTask(task.id)} />
        ))}
      </>
    );
  };

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "today",     label: "Today"     },
    { key: "upcoming",  label: "Upcoming"  },
    { key: "completed", label: "Completed" },
  ];

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.screenTitle}>Tasks</Text>
          {totalCount > 0 && (
            <View style={s.countBadge}>
              <Text style={s.countBadgeText}>{totalCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={s.settingsBtn} activeOpacity={0.7}>
          <Ionicons name="settings-outline" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={s.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity key={tab.key} style={s.tab} onPress={() => setActiveTab(tab.key)} activeOpacity={0.7}>
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
            {activeTab === tab.key && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {renderContent()}
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={handleFAB} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color={Colors.textInverse} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: Colors.background },
  content:         { padding: Spacing.lg, paddingBottom: 96, gap: Spacing.sm },
  header:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  headerLeft:      { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  screenTitle:     { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  countBadge:      { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  settingsBtn:     { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  tabBar:          { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: Spacing.lg },
  tab:             { marginRight: Spacing.lg, paddingBottom: Spacing.sm, alignItems: "center" },
  tabText:         { fontSize: FontSize.md, color: Colors.textMuted, fontWeight: FontWeight.medium },
  tabTextActive:   { color: Colors.textPrimary, fontWeight: FontWeight.semibold },
  tabUnderline:    { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, backgroundColor: Colors.gold, borderRadius: 1 },
  taskRow:         { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.sm },
  taskContent:     { flex: 1 },
  taskTitle:       { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  taskTitleDone:   { textDecorationLine: "line-through", color: Colors.textMuted },
  taskTime:        { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 3 },
  checkbox:        { padding: 2 },
  checkCircle:     { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  checkCircleDone: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  emptyState:      { alignItems: "center", gap: Spacing.md, paddingVertical: Spacing.xxl },
  emptyTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  emptyText:       { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },
  generateBtn:     { backgroundColor: Colors.gold, borderRadius: Radius.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, marginTop: Spacing.sm },
  generateBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },
  fab:             { position: "absolute", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.gold, alignItems: "center", justifyContent: "center", shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
});
