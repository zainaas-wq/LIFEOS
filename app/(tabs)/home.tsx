import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../src/store/useAppStore';
import { AlignmentRing } from '../../src/components/AlignmentRing';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { WelcomeFlow } from '../../src/components/WelcomeFlow';
import { SkeletonSection } from '../../src/components/SkeletonLoader';
import { computeProgressScore } from '../../src/ai/progressEngine';
import { getTodayDate, formatDate, getLocalDateStr, generateId } from '../../src/lib/utils';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import type { NudgeItem, NudgeUrgency, GoalRiskLevel } from '../../src/types';
import { getMostAtRiskGoal } from '../../src/ai/goalIntelligence';

// ─── Smart Insight Banner ─────────────────────────────────────────────────────

const URGENCY_COLOR: Record<NudgeUrgency, string> = {
  low:      Colors.gold,
  medium:   Colors.gold,
  high:     '#FB923C',
  critical: '#F87171',
};

function SmartInsightBanner({
  nudge,
  onStartFocus,
  onDismiss,
}: {
  nudge: NudgeItem;
  onStartFocus: (itemId: string, title: string) => void;
  onDismiss: () => void;
}) {
  const urgency = nudge.urgency ?? 'medium';
  const accent  = nudge.isRecovery ? Colors.error : URGENCY_COLOR[urgency];
  const isRecovery = nudge.isRecovery ?? false;

  return (
    <View style={[insightStyles.card, { borderColor: accent + '55' }]}>
      {/* Left accent bar */}
      <View style={[insightStyles.bar, { backgroundColor: accent }]} />

      <View style={insightStyles.body}>
        {/* Header */}
        <View style={insightStyles.headerRow}>
          <View style={[insightStyles.badge, { backgroundColor: accent + '22', borderColor: accent + '44' }]}>
            <Ionicons
              name={isRecovery ? 'refresh-circle-outline' : urgency === 'critical' ? 'flash' : 'sparkles'}
              size={11}
              color={accent}
            />
            <Text style={[insightStyles.badgeText, { color: accent }]}>
              {isRecovery ? 'RECOVERY' : urgency === 'critical' ? 'CRITICAL' : 'BEST ACTION'}
            </Text>
          </View>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Context reason */}
        {!!nudge.contextReason && (
          <Text style={insightStyles.context}>{nudge.contextReason}</Text>
        )}

        {/* Action row */}
        <View style={insightStyles.actionRow}>
          <Text style={insightStyles.actionTitle} numberOfLines={1}>{nudge.itemTitle}</Text>
          <TouchableOpacity
            style={[insightStyles.startBtn, { backgroundColor: accent }]}
            onPress={() => onStartFocus(nudge.itemId, nudge.itemTitle)}
            activeOpacity={0.85}
          >
            <Ionicons name="flash" size={13} color={Colors.textInverse} />
            <Text style={insightStyles.startBtnText}>Start</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const insightStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bar:  { width: 4 },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.sm },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1,
  },
  badgeText: { fontSize: FontSize.xs - 1, fontWeight: FontWeight.bold, letterSpacing: 0.8 },

  context:     { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  actionRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  actionTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  startBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textInverse },
});

// ─── At-Risk Goal Banner ──────────────────────────────────────────────────────

const RISK_COLOR: Record<GoalRiskLevel, string> = {
  'on-track': '#4ADE80',
  'at-risk':  '#FB923C',
  'critical': '#F87171',
  'stalled':  '#6B7280',
};

function AtRiskGoalBanner({
  goalTitle,
  riskLevel,
  riskReason,
  probability,
  onPress,
}: {
  goalTitle:   string;
  riskLevel:   GoalRiskLevel;
  riskReason:  string;
  probability: number;
  onPress:     () => void;
}) {
  const accent = RISK_COLOR[riskLevel];
  const label  = riskLevel === 'critical' ? 'CRITICAL GOAL' :
                 riskLevel === 'stalled'  ? 'STALLED GOAL'  : 'GOAL AT RISK';

  return (
    <TouchableOpacity
      style={[riskStyles.card, { borderColor: accent + '55' }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[riskStyles.bar, { backgroundColor: accent }]} />
      <View style={riskStyles.body}>
        <View style={riskStyles.row}>
          <Ionicons
            name={riskLevel === 'critical' ? 'flash' : riskLevel === 'stalled' ? 'pause-circle-outline' : 'warning-outline'}
            size={13}
            color={accent}
          />
          <Text style={[riskStyles.label, { color: accent }]}>{label}</Text>
          <View style={[riskStyles.probChip, { backgroundColor: accent + '22' }]}>
            <Text style={[riskStyles.probText, { color: accent }]}>{probability}%</Text>
          </View>
          <Ionicons name="chevron-forward" size={13} color={Colors.textMuted} />
        </View>
        <Text style={riskStyles.title} numberOfLines={1}>{goalTitle}</Text>
        <Text style={riskStyles.reason} numberOfLines={1}>{riskReason}</Text>
      </View>
    </TouchableOpacity>
  );
}

const riskStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bar:  { width: 3 },
  body: { flex: 1, padding: Spacing.md, gap: 3 },
  row:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  label: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  probChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.full },
  probText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  title:  { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  reason: { fontSize: FontSize.xs, color: Colors.textMuted },
});

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { t } = useTranslation();

  const profile            = useAppStore((s) => s.profile);
  const hasSeenWelcome     = useAppStore((s) => s.hasSeenWelcome);
  const isHydrating        = useAppStore((s) => s.isHydrating);
  const session            = useAppStore((s) => s.session);
  const rules              = useAppStore((s) => s.rules);
  const activeFocus        = useAppStore((s) => s.activeFocus);
  const focusSessions      = useAppStore((s) => s.focusSessions);
  const controlPlan        = useAppStore((s) => s.controlPlan);
  const saveReflection     = useAppStore((s) => s.saveReflection);
  const loadSeedData       = useAppStore((s) => s.loadSeedData);
  const seedLoaded         = useAppStore((s) => s.seedLoaded);
  const logDistraction     = useAppStore((s) => s.logDistraction);
  const distractionLogs    = useAppStore((s) => s.distractionLogs);
  const startFocus              = useAppStore((s) => s.startFocus);
  const computeSmartNudge       = useAppStore((s) => s.computeSmartNudge);
  const goals                   = useAppStore((s) => s.goals);
  const goalIntelligence        = useAppStore((s) => s.goalIntelligence);
  const computeGoalIntelligence = useAppStore((s) => s.computeGoalIntelligence);
  const todayReflection    = useAppStore((s) =>
    s.reflections?.find((r) => r.date === getTodayDate()) ?? null
  );

  const [smartNudge, setSmartNudge] = useState<NudgeItem | null>(null);

  useEffect(() => {
    if (__DEV__ && !seedLoaded && !profile) loadSeedData();
  }, []);

  // Compute smart nudge on mount and every 5 minutes
  useEffect(() => {
    const compute = () => {
      const nudge = computeSmartNudge();
      setSmartNudge(nudge);
    };
    compute();
    const interval = setInterval(compute, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [controlPlan, goals]);

  // Compute goal intelligence on mount and when goals/plan change
  useEffect(() => {
    if (goals.length > 0) computeGoalIntelligence();
  }, [goals, controlPlan]);

  const handleStartFocusFromNudge = useCallback((itemId: string, title: string) => {
    const linkedGoal = goals.find((g) =>
      controlPlan?.plan.items.find((i) => i.id === itemId)?.goalId === g.id,
    );
    startFocus({
      id:              generateId(),
      goalId:          linkedGoal?.id,
      goalTitle:       title,
      durationMinutes: 50,
      startedAt:       new Date().toISOString(),
    });
    setSmartNudge(null);
    router.push('/(tabs)/focus' as any);
  }, [goals, controlPlan, startFocus]);

  const atRiskGoal = useMemo(
    () => getMostAtRiskGoal(goals, goalIntelligence),
    [goals, goalIntelligence],
  );

  const today = getTodayDate();

  const [reflectionText, setReflectionText]   = useState(todayReflection?.text ?? '');
  const [reflectionSaved, setReflectionSaved] = useState(!!todayReflection);

  const planItems = useMemo(
    () => (controlPlan?.plan.items ?? []).filter((i) => i.type !== 'break' && i.type !== 'event'),
    [controlPlan],
  );

  const todayDistractions = distractionLogs.filter((d) => getLocalDateStr(new Date(d.timestamp)) === today).length;

  const alignmentResult = useMemo(
    () =>
      computeProgressScore({
        planItems,
        rules,
        criticalActionCompleted:
          controlPlan?.plan.items.some((i) => !!i.isCritical && i.completed) ?? false,
        hasReflection: !!todayReflection || reflectionSaved,
        distractionCount: todayDistractions,
        seriousnessScore: profile?.seriousnessScore ?? 7,
      }),
    [planItems, rules, controlPlan, todayReflection, reflectionSaved, todayDistractions, profile],
  );

  const handleSaveReflection = () => {
    if (reflectionText.trim()) {
      saveReflection(today, reflectionText.trim());
      setReflectionSaved(true);
    }
  };

  const todaySessionCount = focusSessions.filter((s) => getLocalDateStr(new Date(s.start)) === today).length;
  const todayFocusMin = focusSessions
    .filter((s) => getLocalDateStr(new Date(s.start)) === today)
    .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);

  const hour = new Date().getHours();
  const greetingKey =
    hour < 12 ? 'home.greeting_morning' :
    hour < 17 ? 'home.greeting_afternoon' :
                'home.greeting_evening';
  const greetingName = profile?.name ? `, ${profile.name}` : '';
  const greetingText = `${t(greetingKey)}${greetingName}`;

  const showWelcome = !!profile?.onboardingComplete && !hasSeenWelcome;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Welcome flow shows once after onboarding — before anything else */}
      <WelcomeFlow visible={showWelcome} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.greeting}>{greetingText}</Text>
            <Text style={styles.date}>{formatDate(today)}</Text>
          </View>

          {/* ── Hydration loading skeleton ─────────────────────────────────── */}
          {isHydrating && !!session && (
            <View style={styles.skeletonWrap}>
              <SkeletonSection cards={3} />
            </View>
          )}

          {/* ── Alignment Ring ─────────────────────────────────────────────── */}
          <View style={[styles.ringWrap, isHydrating && !!session && { opacity: 0, height: 0 }]}>
            <AlignmentRing result={alignmentResult} size={180} />
            <View style={styles.breakdown}>
              <ScorePill label={t('home.score_tasks')}    value={alignmentResult.taskScore}       max={40} />
              <ScorePill label={t('home.score_rules')}    value={alignmentResult.ruleScore}       max={30} />
              <ScorePill label={t('home.score_critical')} value={alignmentResult.criticalScore}   max={20} />
              <ScorePill label={t('home.score_reflect')}  value={alignmentResult.reflectionScore} max={10} />
            </View>
          </View>

          {/* ── Focus stats ────────────────────────────────────────────────── */}
          {(todaySessionCount > 0 || activeFocus) && (
            <Card gold style={styles.focusCard}>
              <View style={styles.focusRow}>
                <Ionicons name="flash" size={16} color={Colors.gold} />
                <Text style={styles.focusLabel}>
                  {activeFocus
                    ? t('home.focus_active_label', { title: activeFocus.goalTitle })
                    : t('home.focus_summary', { count: todaySessionCount, mins: todayFocusMin })}
                </Text>
              </View>
            </Card>
          )}

          {/* ── Distraction log ────────────────────────────────────────────── */}
          <TouchableOpacity
            onPress={() => logDistraction()}
            style={styles.distractionBtn}
            activeOpacity={0.75}
          >
            <Ionicons name="warning-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.distractionBtnText}>
              {todayDistractions > 0
                ? t('home.distraction_count', { count: todayDistractions })
                : t('home.distraction_prompt')}
            </Text>
          </TouchableOpacity>

          {/* ── Smart Insight Banner ───────────────────────────────────────── */}
          {smartNudge && (
            <SmartInsightBanner
              nudge={smartNudge}
              onStartFocus={handleStartFocusFromNudge}
              onDismiss={() => setSmartNudge(null)}
            />
          )}

          {/* ── At-Risk Goal Warning ────────────────────────────────────────── */}
          {atRiskGoal && (
            <AtRiskGoalBanner
              goalTitle={atRiskGoal.goal.title}
              riskLevel={atRiskGoal.intel.riskLevel}
              riskReason={atRiskGoal.intel.riskReason}
              probability={atRiskGoal.intel.probability}
              onPress={() => router.push('/(tabs)/goals' as any)}
            />
          )}

          {/* ── First-run getting started card ─────────────────────────────── */}
          {goals.length === 0 && !isHydrating && !seedLoaded && (
            <Card style={styles.getStartedCard}>
              <View style={styles.getStartedIcon}>
                <Ionicons name="sparkles" size={24} color={Colors.gold} />
              </View>
              <Text style={styles.getStartedTitle}>Set up your intelligence layer</Text>
              <Text style={styles.getStartedDesc}>
                LifeOS activates when you add goals, courses, and projects. Add your first goal to start receiving AI-powered guidance and risk detection.
              </Text>
              <View style={styles.getStartedActions}>
                <TouchableOpacity
                  style={styles.getStartedBtn}
                  onPress={() => router.push('/(tabs)/goals' as any)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flag-outline" size={14} color={Colors.gold} />
                  <Text style={styles.getStartedBtnText}>Add First Goal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.getStartedBtn, { borderColor: Colors.border }]}
                  onPress={() => router.push('/(tabs)/ai' as any)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="chatbubbles-outline" size={14} color={Colors.textSecondary} />
                  <Text style={[styles.getStartedBtnText, { color: Colors.textSecondary }]}>Ask AI Coach</Text>
                </TouchableOpacity>
              </View>
            </Card>
          )}

          {/* ── Critical Action / Today's Focus ────────────────────────────── */}
          {(() => {
            const criticalItem = controlPlan?.plan.items.find((i) => !!i.isCritical);
            if (criticalItem) {
              return (
                <Card gold style={styles.section}>
                  <View style={styles.criticalHeader}>
                    <Ionicons name="flash" size={14} color={Colors.gold} />
                    <Text style={styles.criticalLabel}>{t('home.todays_focus')}</Text>
                  </View>
                  <Text style={styles.criticalAction}>{criticalItem.title}</Text>
                </Card>
              );
            }
            return (
              <Card style={styles.section}>
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyHint}>{t('home.no_plan_today')}</Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/plan' as any)}>
                    <Text style={styles.emptyLink}>{t('home.go_to_plan')}</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })()}

          {/* ── Ask Coach shortcut ─────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.coachPrompt}
            onPress={() => router.push('/(tabs)/coach' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.coachIcon}>
              <Ionicons name="sparkles" size={14} color={Colors.gold} />
            </View>
            <Text style={styles.coachText}>{t('home.ask_coach')}</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* ── Daily Reflection ───────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('home.reflection_title')}</Text>
            <Card elevated>
              <TextInput
                value={reflectionText}
                onChangeText={(text) => { setReflectionText(text); setReflectionSaved(false); }}
                placeholder={t('home.reflection_placeholder')}
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
                style={styles.reflectionInput}
                editable={!reflectionSaved}
              />
              {!reflectionSaved && reflectionText.trim().length > 0 && (
                <Button
                  label={t('home.reflection_save')}
                  onPress={handleSaveReflection}
                  variant="ghost"
                  size="sm"
                  style={styles.reflectionBtn}
                />
              )}
              {reflectionSaved && (
                <View style={styles.reflectionSavedRow}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                  <Text style={styles.reflectionSavedText}>{t('home.reflection_saved')}</Text>
                  <TouchableOpacity onPress={() => setReflectionSaved(false)}>
                    <Text style={styles.reflectionEdit}>{t('common.edit')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ScorePill({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <View style={pill.wrap}>
      <Text style={pill.value}>{value}</Text>
      <Text style={pill.max}>/{max}</Text>
      <Text style={pill.label}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  wrap:  { alignItems: 'center', gap: 2 },
  value: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  max:   { fontSize: FontSize.xs, color: Colors.textMuted },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
});

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  flex:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },

  header:   { gap: 2 },
  greeting: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  date:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },

  skeletonWrap: { gap: Spacing.md, paddingVertical: Spacing.md },
  ringWrap:  { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.lg },
  breakdown: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingHorizontal: Spacing.md },

  focusCard:  { gap: 0 },
  focusRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  focusLabel: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium, flex: 1 },

  distractionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.xs + 2,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  distractionBtnText: { fontSize: FontSize.xs, color: Colors.textMuted },

  section:        { gap: Spacing.xs },
  sectionTitle:   { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  criticalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  criticalLabel:  { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  criticalAction: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 28 },
  emptyRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyHint:      { fontSize: FontSize.sm, color: Colors.textMuted },
  emptyLink:      { fontSize: FontSize.sm, color: Colors.gold },

  getStartedCard: { gap: Spacing.sm, alignItems: 'center', paddingVertical: Spacing.lg },
  getStartedIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center',
  },
  getStartedTitle: {
    fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center',
  },
  getStartedDesc: {
    fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21,
  },
  getStartedActions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  getStartedBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gold + '55',
    backgroundColor: Colors.surfaceElevated,
  },
  getStartedBtnText: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium },

  coachPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.goldDim, padding: Spacing.md,
  },
  coachIcon: {
    width: 28, height: 28, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center',
  },
  coachText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary },

  reflectionInput:    { color: Colors.textPrimary, fontSize: FontSize.md, lineHeight: 24, minHeight: 90, textAlignVertical: 'top' },
  reflectionBtn:      { alignSelf: 'flex-end', marginTop: Spacing.sm },
  reflectionSavedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
  reflectionSavedText:{ fontSize: FontSize.sm, color: Colors.success, flex: 1 },
  reflectionEdit:     { fontSize: FontSize.sm, color: Colors.gold },
});
