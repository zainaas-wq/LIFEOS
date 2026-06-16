import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { WelcomeFlow } from '../../src/components/WelcomeFlow';
import { SkeletonSection } from '../../src/components/SkeletonLoader';
import { computeProgressScore } from '../../src/ai/progressEngine';
import { getTodayDate, getLocalDateStr, generateId } from '../../src/lib/utils';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import { getMostAtRiskGoal } from '../../src/ai/goalIntelligence';
import type { NudgeItem, NudgeUrgency } from '../../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatStudyTime(minutes: number): string {
  if (minutes === 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function computeStreak(focusSessions: any[]): number {
  if (!focusSessions.length) return 0;
  const days = new Set(focusSessions.map((s) => getLocalDateStr(new Date(s.start))));
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = getLocalDateStr(d);
    if (!days.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon, iconBg, iconColor, value, label, sub,
}: {
  icon: string; iconBg: string; iconColor: string;
  value: string; label: string; sub?: string;
}) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
      {sub ? <Text style={[statStyles.sub, { color: iconColor }]}>{sub}</Text> : null}
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 4,
    minHeight: 112,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  value: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  sub:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
});

// ─── Plan Item Row ─────────────────────────────────────────────────────────────

const PLAN_COLORS = ['#6C63FF', '#4ADE80', '#FB923C', '#38BDF8', '#F472B6'];

function PlanRow({
  title, time, color, completed, onPress,
}: {
  title: string; time: string; color: string; completed: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={planStyles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[planStyles.dot, { backgroundColor: color }]} />
      <View style={planStyles.info}>
        <Text style={[planStyles.title, completed && planStyles.done]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={planStyles.time}>{time}</Text>
      </View>
      <Ionicons
        name={completed ? 'checkmark-circle' : 'chevron-forward'}
        size={16}
        color={completed ? Colors.success : Colors.textMuted}
      />
    </TouchableOpacity>
  );
}

const planStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dot:   { width: 10, height: 10, borderRadius: Radius.full },
  info:  { flex: 1, gap: 2 },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  done:  { color: Colors.textMuted, textDecorationLine: 'line-through' },
  time:  { fontSize: FontSize.xs, color: Colors.textSecondary },
});

// ─── Nudge Banner ─────────────────────────────────────────────────────────────

const URGENCY_COLOR: Record<NudgeUrgency, string> = {
  low: Colors.gold, medium: Colors.gold, high: '#FB923C', critical: '#F87171',
};

function NudgeBanner({ nudge, onStart, onDismiss }: {
  nudge: NudgeItem;
  onStart: (id: string, title: string) => void;
  onDismiss: () => void;
}) {
  const accent = nudge.isRecovery ? Colors.error : URGENCY_COLOR[nudge.urgency ?? 'medium'];
  return (
    <View style={[nudgeStyles.card, { borderColor: accent + '44' }]}>
      <View style={[nudgeStyles.bar, { backgroundColor: accent }]} />
      <View style={nudgeStyles.body}>
        <View style={nudgeStyles.topRow}>
          <View style={[nudgeStyles.badge, { backgroundColor: accent + '22' }]}>
            <Ionicons name="sparkles" size={10} color={accent} />
            <Text style={[nudgeStyles.badgeText, { color: accent }]}>
              {nudge.isRecovery ? 'RECOVERY' : 'BEST ACTION'}
            </Text>
          </View>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
        {!!nudge.contextReason && (
          <Text style={nudgeStyles.reason}>{nudge.contextReason}</Text>
        )}
        <View style={nudgeStyles.actionRow}>
          <Text style={nudgeStyles.actionTitle} numberOfLines={1}>{nudge.itemTitle}</Text>
          <TouchableOpacity
            style={[nudgeStyles.startBtn, { backgroundColor: accent }]}
            onPress={() => onStart(nudge.itemId, nudge.itemTitle)}
            activeOpacity={0.85}
          >
            <Ionicons name="flash" size={12} color="#000" />
            <Text style={nudgeStyles.startBtnText}>Start</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const nudgeStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden',
  },
  bar:  { width: 4 },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full,
  },
  badgeText:  { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.8 },
  reason:     { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
  actionRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  actionTitle:{ flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md,
  },
  startBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#000' },
});

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const profile            = useAppStore((s) => s.profile);
  const hasSeenWelcome     = useAppStore((s) => s.hasSeenWelcome);
  const isHydrating        = useAppStore((s) => s.isHydrating);
  const session            = useAppStore((s) => s.session);
  const rules              = useAppStore((s) => s.rules);
  const focusSessions      = useAppStore((s) => s.focusSessions);
  const controlPlan        = useAppStore((s) => s.controlPlan);
  const loadSeedData       = useAppStore((s) => s.loadSeedData);
  const seedLoaded         = useAppStore((s) => s.seedLoaded);
  const startFocus         = useAppStore((s) => s.startFocus);
  const computeSmartNudge  = useAppStore((s) => s.computeSmartNudge);
  const goals              = useAppStore((s) => s.goals);
  const goalIntelligence   = useAppStore((s) => s.goalIntelligence);
  const computeGoalIntelligence = useAppStore((s) => s.computeGoalIntelligence);
  const distractionLogs    = useAppStore((s) => s.distractionLogs);
  const reflections        = useAppStore((s) => s.reflections);

  const [smartNudge, setSmartNudge] = useState<NudgeItem | null>(null);

  useEffect(() => {
    if (__DEV__ && !seedLoaded && !profile) loadSeedData();
  }, []);

  useEffect(() => {
    const compute = () => setSmartNudge(computeSmartNudge());
    compute();
    const interval = setInterval(compute, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [controlPlan, goals]);

  useEffect(() => {
    if (goals.length > 0) computeGoalIntelligence();
  }, [goals, controlPlan]);

  const today = getTodayDate();

  const todaySessions = useMemo(
    () => focusSessions.filter((s) => getLocalDateStr(new Date(s.start)) === today),
    [focusSessions, today],
  );
  const todayFocusMin = useMemo(
    () => todaySessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0),
    [todaySessions],
  );
  const streak = useMemo(() => computeStreak(focusSessions), [focusSessions]);

  const planItems = useMemo(
    () => (controlPlan?.plan.items ?? []).filter((i) => i.type !== 'break' && i.type !== 'event'),
    [controlPlan],
  );

  const todayDistractions = useMemo(
    () => distractionLogs.filter((d) => getLocalDateStr(new Date(d.timestamp)) === today).length,
    [distractionLogs, today],
  );

  const todayReflection = useMemo(
    () => reflections?.find((r) => r.date === today) ?? null,
    [reflections, today],
  );

  const alignmentResult = useMemo(
    () => computeProgressScore({
      planItems,
      rules,
      criticalActionCompleted: controlPlan?.plan.items.some((i) => !!i.isCritical && i.completed) ?? false,
      hasReflection: !!todayReflection,
      distractionCount: todayDistractions,
      seriousnessScore: profile?.seriousnessScore ?? 7,
    }),
    [planItems, rules, controlPlan, todayReflection, todayDistractions, profile],
  );

  const focusScore = Math.min(
    100,
    Math.round(
      (alignmentResult.taskScore / 40) * 60 +
      (alignmentResult.ruleScore / 30) * 25 +
      (alignmentResult.criticalScore / 20) * 15,
    ),
  );

  const tasksTotal = planItems.length;
  const tasksDone  = planItems.filter((i) => i.completed).length;

  // Greeting
  const hour = new Date().getHours();
  const greetingEmoji = hour < 12 ? '☀️' : hour < 17 ? '👋' : '🌙';
  const greetingWord  = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const greetingName  = profile?.name ? `, ${profile.name}` : '';

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const displayItems = useMemo(() => planItems.slice(0, 5), [planItems]);

  const handleStartFromNudge = useCallback((itemId: string, title: string) => {
    const linkedGoal = goals.find((g) =>
      controlPlan?.plan.items.find((i) => i.id === itemId)?.goalId === g.id,
    );
    startFocus({
      id: generateId(),
      goalId: linkedGoal?.id,
      goalTitle: title,
      durationMinutes: 50,
      startedAt: new Date().toISOString(),
    });
    setSmartNudge(null);
    router.push('/(tabs)/focus' as any);
  }, [goals, controlPlan, startFocus]);

  const showWelcome = !!profile?.onboardingComplete && !hasSeenWelcome;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <WelcomeFlow visible={showWelcome} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateText}>{dateLabel}</Text>
            <Text style={styles.greeting}>
              {greetingWord}{greetingName} {greetingEmoji}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/(tabs)/more' as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {isHydrating && !!session && <SkeletonSection cards={3} />}

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatCard
              icon="flash"
              iconBg="rgba(108,99,255,0.18)"
              iconColor="#6C63FF"
              value={String(focusScore)}
              label="Focus Score"
              sub={focusScore >= 80 ? 'Great Focus!' : focusScore >= 50 ? 'Keep Going' : 'Needs Work'}
            />
            <StatCard
              icon="checkbox-outline"
              iconBg="rgba(74,222,128,0.15)"
              iconColor="#4ADE80"
              value={`${tasksDone}/${tasksTotal || 0}`}
              label="Tasks"
              sub="To do today"
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              icon="time-outline"
              iconBg="rgba(251,146,60,0.15)"
              iconColor="#FB923C"
              value={formatStudyTime(todayFocusMin)}
              label="Study Time"
              sub={todayFocusMin > 0 ? 'Keep it up!' : 'Start a session'}
            />
            <StatCard
              icon="flame-outline"
              iconBg="rgba(248,113,113,0.15)"
              iconColor="#F87171"
              value={String(streak)}
              label="Streak"
              sub={streak === 1 ? 'Day' : 'Days'}
            />
          </View>
        </View>

        {/* Smart Nudge */}
        {smartNudge && (
          <NudgeBanner
            nudge={smartNudge}
            onStart={handleStartFromNudge}
            onDismiss={() => setSmartNudge(null)}
          />
        )}

        {/* Today's Plan */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today's Plan</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/plan' as any)} activeOpacity={0.7}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.planCard}>
            {displayItems.length === 0 ? (
              <View style={styles.emptyPlan}>
                <Ionicons name="calendar-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No plan for today yet</Text>
                <TouchableOpacity
                  style={styles.createPlanBtn}
                  onPress={() => router.push('/(tabs)/plan' as any)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.createPlanText}>Create Plan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              displayItems.map((item, idx) => (
                <PlanRow
                  key={item.id}
                  title={item.title}
                  time={
                    item.startTime && item.endTime
                      ? `${item.startTime} – ${item.endTime}`
                      : item.startTime ?? 'Anytime'
                  }
                  color={PLAN_COLORS[idx % PLAN_COLORS.length]}
                  completed={!!item.completed}
                  onPress={() => router.push('/(tabs)/plan' as any)}
                />
              ))
            )}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push('/(tabs)/focus' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="flash" size={15} color={Colors.gold} />
            <Text style={styles.quickText}>Focus</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push('/(tabs)/coach' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles" size={15} color={Colors.gold} />
            <Text style={styles.quickText}>Coach</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push('/(tabs)/goals' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="flag-outline" size={15} color={Colors.gold} />
            <Text style={styles.quickText}>Goals</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push('/(tabs)/memory' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="library-outline" size={15} color={Colors.gold} />
            <Text style={styles.quickText}>Memory</Text>
          </TouchableOpacity>
        </View>

        {/* At-risk goal */}
        {goals.length > 0 && (() => {
          const atRisk = getMostAtRiskGoal(goals, goalIntelligence);
          if (!atRisk || atRisk.intel.riskLevel === 'on-track') return null;
          const accent = atRisk.intel.riskLevel === 'critical' ? '#F87171' : '#FB923C';
          return (
            <TouchableOpacity
              style={[styles.riskCard, { borderColor: accent + '44' }]}
              onPress={() => router.push('/(tabs)/goals' as any)}
              activeOpacity={0.8}
            >
              <View style={[styles.riskBar, { backgroundColor: accent }]} />
              <View style={styles.riskBody}>
                <View style={styles.riskTopRow}>
                  <Ionicons name="warning-outline" size={13} color={accent} />
                  <Text style={[styles.riskLabel, { color: accent }]}>
                    {atRisk.intel.riskLevel === 'critical' ? 'CRITICAL GOAL' : 'GOAL AT RISK'}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={Colors.textMuted} />
                </View>
                <Text style={styles.riskTitle} numberOfLines={1}>{atRisk.goal.title}</Text>
                <Text style={styles.riskReason} numberOfLines={1}>{atRisk.intel.riskReason}</Text>
              </View>
            </TouchableOpacity>
          );
        })()}

        {/* First-run CTA */}
        {goals.length === 0 && !isHydrating && !seedLoaded && (
          <View style={styles.onboardCard}>
            <View style={styles.onboardIcon}>
              <Ionicons name="sparkles" size={26} color={Colors.gold} />
            </View>
            <Text style={styles.onboardTitle}>Set up your intelligence layer</Text>
            <Text style={styles.onboardDesc}>
              LifeOS activates when you add goals, courses, and projects. Add your first goal to start receiving AI-powered guidance.
            </Text>
            <View style={styles.onboardActions}>
              <TouchableOpacity
                style={styles.onboardBtn}
                onPress={() => router.push('/(tabs)/goals' as any)}
                activeOpacity={0.8}
              >
                <Ionicons name="flag-outline" size={14} color={Colors.gold} />
                <Text style={styles.onboardBtnText}>Add First Goal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.onboardBtn, { borderColor: Colors.border }]}
                onPress={() => router.push('/(tabs)/coach' as any)}
                activeOpacity={0.8}
              >
                <Ionicons name="chatbubbles-outline" size={14} color={Colors.textSecondary} />
                <Text style={[styles.onboardBtnText, { color: Colors.textSecondary }]}>Ask Coach</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl + 20, gap: Spacing.lg },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  dateText: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 2 },
  greeting: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 28 },
  iconBtn: {
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },

  statsGrid: { gap: Spacing.sm },
  statsRow:  { flexDirection: 'row', gap: Spacing.sm },

  section:       { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  seeAll:        { fontSize: FontSize.sm, color: Colors.gold },

  planCard: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.xs, paddingBottom: Spacing.sm,
  },
  emptyPlan:     { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptyText:     { fontSize: FontSize.sm, color: Colors.textMuted },
  createPlanBtn: {
    marginTop: Spacing.xs, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gold,
  },
  createPlanText: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.semibold },

  quickRow: { flexDirection: 'row', gap: Spacing.sm },
  quickBtn: {
    flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickText: { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.semibold },

  riskCard:   { flexDirection: 'row', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  riskBar:    { width: 3 },
  riskBody:   { flex: 1, padding: Spacing.md, gap: 3 },
  riskTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  riskLabel:  { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  riskTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  riskReason: { fontSize: FontSize.xs, color: Colors.textMuted },

  onboardCard: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm,
  },
  onboardIcon:    { width: 56, height: 56, borderRadius: Radius.full, backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  onboardTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  onboardDesc:    { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  onboardActions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  onboardBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.goldDim,
    backgroundColor: Colors.surface,
  },
  onboardBtnText: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium },
});
