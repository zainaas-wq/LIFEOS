import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../src/store/useAppStore';
import { AlignmentRing } from '../../src/components/AlignmentRing';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { computeProgressScore } from '../../src/ai/progressEngine';
import { getTodayDate, formatDate, getLocalDateStr, generateId } from '../../src/lib/utils';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../src/constants/theme';
import type { MissedTask } from '../../src/types';
import { getUrgencyLevel, getUrgencyHint } from '../../src/ai/enforcementEngine';
import { timeToMins } from '../../src/ai/planGenerator';

export default function HomeScreen() {
  const { t } = useTranslation();

  const profile        = useAppStore((s) => s.profile);
  const rules          = useAppStore((s) => s.rules);
  const activeFocus    = useAppStore((s) => s.activeFocus);
  const focusSessions  = useAppStore((s) => s.focusSessions);
  const controlPlan    = useAppStore((s) => s.controlPlan);
  const saveReflection = useAppStore((s) => s.saveReflection);
  const loadSeedData   = useAppStore((s) => s.loadSeedData);
  const seedLoaded     = useAppStore((s) => s.seedLoaded);
  const logDistraction = useAppStore((s) => s.logDistraction);
  const distractionLogs = useAppStore((s) => s.distractionLogs);
  const todayReflection = useAppStore((s) =>
    s.reflections?.find((r) => r.date === getTodayDate()) ?? null
  );
  const goals                      = useAppStore((s) => s.goals);
  const startFocus                 = useAppStore((s) => s.startFocus);
  const dailyDecision              = useAppStore((s) => s.dailyDecision);
  const markMissedTaskRecovered    = useAppStore((s) => s.markMissedTaskRecovered);
  const deferMissedTask            = useAppStore((s) => s.deferMissedTask);
  const computeDailyDecisionAction = useAppStore((s) => s.computeDailyDecisionAction);
  const replanSuggested            = useAppStore((s) => s.replanSuggested);
  const dismissReplanSuggestion    = useAppStore((s) => s.dismissReplanSuggestion);
  const reschedulePlan             = useAppStore((s) => s.reschedulePlan);

  const today = getTodayDate();

  // ── Clock tick for urgency display ────────────────────────────────────────
  const [nowMins, setNowMins] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    if (__DEV__ && !seedLoaded && !profile) loadSeedData();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowMins(d.getHours() * 60 + d.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Recompute behavioral snapshot when plan or focus changes
  useEffect(() => {
    computeDailyDecisionAction(today);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlPlan, focusSessions]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const pendingMissed = dailyDecision?.missedCarryover ?? [];
  const atRiskGoals   = dailyDecision?.atRiskGoals ?? [];
  const mustDoItems   = dailyDecision?.mustDoItems ?? [];
  const isRecovery    = dailyDecision?.isInRecoveryMode ?? false;
  const driftScore    = dailyDecision?.driftScore ?? 0;
  const minViableDay  = dailyDecision?.minimumViableDay;

  // High-pressure = recovery mode OR any must-do item has urgency
  const isHighPressure = useMemo(() => {
    if (isRecovery) return true;
    return mustDoItems.some((title) => {
      const item = controlPlan?.plan.items.find(
        (i) => i.title === title && (i.type === 'goal' || i.type === 'skill'),
      );
      return !!item && getUrgencyLevel(item, nowMins) !== 'none';
    });
  }, [isRecovery, mustDoItems, controlPlan, nowMins]);

  // Secondary sections collapsed when under pressure; open on normal days
  const [showExpanded, setShowExpanded] = useState(!isHighPressure);

  // Auto-collapse when pressure state activates
  useEffect(() => {
    if (isHighPressure) setShowExpanded(false);
  }, [isHighPressure]);

  // ── Reflection ────────────────────────────────────────────────────────────
  const [reflectionText, setReflectionText]   = useState(todayReflection?.text ?? '');
  const [reflectionSaved, setReflectionSaved] = useState(!!todayReflection);

  const planItems = useMemo(
    () => (controlPlan?.plan.items ?? []).filter((i) => i.type !== 'break' && i.type !== 'event'),
    [controlPlan],
  );

  const todayDistractions = distractionLogs.filter(
    (d) => getLocalDateStr(new Date(d.timestamp)) === today,
  ).length;

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

  // ── Handlers ──────────────────────────────────────────────────────────────

  // P1 fix: guard against overwriting an active focus session
  const handleStartFocusForMustDo = (title: string) => {
    if (activeFocus) return;
    if (!controlPlan) return;
    const item = controlPlan.plan.items.find(
      (i) => i.title === title && (i.type === 'goal' || i.type === 'skill') && !i.completed,
    );
    if (!item) return;
    const goal         = goals.find((g) => g.id === item.goalId);
    const durationMins = Math.max(1, timeToMins(item.endTime) - timeToMins(item.startTime));
    startFocus({
      id:              generateId(),
      goalId:          item.goalId,
      goalTitle:       goal?.title ?? item.title,
      durationMinutes: durationMins,
      startedAt:       new Date().toISOString(),
    });
  };

  const handleAcceptReplan = () => {
    reschedulePlan(today);
    dismissReplanSuggestion();
  };

  const handleSaveReflection = () => {
    if (reflectionText.trim()) {
      saveReflection(today, reflectionText.trim());
      setReflectionSaved(true);
    }
  };

  const todaySessionCount = focusSessions.filter(
    (s) => getLocalDateStr(new Date(s.start)) === today,
  ).length;
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
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768; // breakpoint for grid

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>{greetingText}</Text>
              <Text style={styles.date}>{formatDate(today)}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile' as any)} activeOpacity={0.8}>
              <View style={styles.profileAvatar}>
                <Ionicons name="person" size={16} color={Colors.gold} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Top Banners */}
          {isRecovery && (
            <View style={styles.recoveryBanner}>
              <View style={styles.recoveryLeft}>
                <View style={styles.recoveryIconWrap}>
                  <Ionicons name="alert-circle" size={14} color={Colors.gold} />
                </View>
                <Text style={styles.recoveryMsg} numberOfLines={2}>
                  {dailyDecision?.recoveryMessage ?? t('home.recovery_banner_default')}
                </Text>
              </View>
            </View>
          )}

          {replanSuggested && (
            <View style={styles.replanCard}>
              <View style={styles.replanLeft}>
                <Ionicons name="refresh-outline" size={16} color={Colors.purpleLight} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.replanTitle}>A must-do window passed</Text>
                  <Text style={styles.replanSub}>Replan the rest of today around now?</Text>
                </View>
              </View>
              <View style={styles.replanActions}>
                <TouchableOpacity onPress={handleAcceptReplan} style={styles.replanYes} activeOpacity={0.8}>
                  <Text style={styles.replanYesText}>Replan</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={dismissReplanSuggestion} activeOpacity={0.7}>
                  <Text style={styles.replanNo}>Not now</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* MAIN GRID */}
          <View style={isDesktop ? styles.grid : styles.blockGrid}>

            {/* ROW 1: Daily Commitment & Analytics */}
            <View style={[styles.gridRow, isDesktop ? null : styles.mobileRowSwap]}>
              {minViableDay && (
                <View style={[styles.mvdCard, isHighPressure && styles.mvdCardPressure]}>
                  <View>
                    <Text style={styles.mvdLabel}>TODAY'S COMMITMENT</Text>
                    <Text style={styles.mvdText}>{minViableDay}</Text>
                  </View>
                  <View style={styles.mvdGlow} />
                </View>
              )}
              
              <View style={styles.analyticsCard}>
                 <Text style={styles.analyticsTitle}>Alignment Score</Text>
                 <View style={styles.ringWrap}>
                   <AlignmentRing result={alignmentResult} size={110} />
                   <View style={styles.breakdown}>
                     <View style={styles.scoreCol}>
                       <Text style={styles.scoreVal}>{alignmentResult.taskScore}</Text>
                       <Text style={styles.scoreTarget}>/40 Task</Text>
                     </View>
                     <View style={styles.scoreCol}>
                       <Text style={styles.scoreVal}>{alignmentResult.ruleScore}</Text>
                       <Text style={styles.scoreTarget}>/30 Rule</Text>
                     </View>
                     <View style={styles.scoreCol}>
                       <Text style={styles.scoreVal}>{alignmentResult.criticalScore}</Text>
                       <Text style={styles.scoreTarget}>/20 Crit</Text>
                     </View>
                   </View>
                 </View>
                 {isRecovery && (
                   <View style={styles.driftBadge}>
                     <Text style={styles.driftNum}>{driftScore}</Text>
                     <Text style={styles.driftLabel}>{t('home.drift_label')}</Text>
                   </View>
                 )}
              </View>
            </View>

            {/* ROW 2: Must-Dos & Focus */}
            <View style={styles.gridRow}>
              
              <View style={styles.mustDoCard}>
                <View style={styles.cardHeader}>
                  <Ionicons name="list" size={18} color={Colors.textMuted} />
                  <Text style={styles.cardTitle}>{t('home.must_do_title')}</Text>
                </View>

                {mustDoItems.length > 0 ? (
                  <View style={styles.mustDoList}>
                    {mustDoItems.map((title, idx) => {
                      const planItem = controlPlan?.plan.items.find(
                        (i) => i.title === title && (i.type === 'goal' || i.type === 'skill'),
                      );
                      const urgency  = planItem ? getUrgencyLevel(planItem, nowMins) : 'none';
                      const isFocusing = !!activeFocus && !!planItem?.goalId && activeFocus.goalId === planItem.goalId;
                      const hint = isFocusing ? 'In focus now' : urgency !== 'none' ? getUrgencyHint(planItem!, nowMins) : null;
                      const canFocus = !!planItem && !planItem.completed && !isFocusing;

                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.mustDoItem, idx > 0 && styles.mustDoItemBorder]}
                          onPress={() => canFocus && handleStartFocusForMustDo(title)}
                          activeOpacity={canFocus ? 0.7 : 1}
                        >
                          <Ionicons
                            name={isFocusing ? 'pulse' : urgency === 'overdue' ? 'alert-circle' : urgency === 'urgent' ? 'flash' : 'flash-outline'}
                            size={16}
                            color={isFocusing ? Colors.success : urgency === 'overdue' ? Colors.error : Colors.gold}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.mustDoText}>{title}</Text>
                            {hint && (
                              <Text style={[styles.mustDoHint, isFocusing && styles.mustDoHintPositive, urgency === 'urgent' && !isFocusing && styles.mustDoHintUrgent, urgency === 'overdue' && !isFocusing && styles.mustDoHintOverdue]}>
                                {hint}
                              </Text>
                            )}
                          </View>
                          {canFocus && (
                            <View style={styles.mustDoFocusBtn}>
                              <Ionicons name="play" size={13} color={Colors.gold} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyHint}>{t('home.no_plan_today')}</Text>
                    <TouchableOpacity onPress={() => router.push('/(tabs)/plan' as any)}>
                      <Text style={styles.emptyLink}>{t('home.go_to_plan')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.focusStatsCard}>
                <View style={styles.cardHeader}>
                  <Ionicons name="timer" size={18} color={Colors.purpleLight} />
                  <Text style={styles.cardTitle}>Focus Engine</Text>
                </View>

                {/* Critical Action */}
                {(() => {
                  const criticalItem = controlPlan?.plan.items.find((i) => !!i.isCritical && (!isHighPressure || !i.completed));
                  if (!criticalItem) return null;
                  return (
                    <View style={styles.criticalBox}>
                      <Text style={styles.criticalLabel}>{t('home.todays_focus')}</Text>
                      <Text style={styles.criticalAction}>{criticalItem.title}</Text>
                    </View>
                  );
                })()}

                {/* Focus Summary */}
                {(todaySessionCount > 0 || activeFocus) && (
                  <View style={styles.focusSummary}>
                    <Ionicons name="flash" size={16} color={Colors.gold} />
                    <Text style={styles.focusLabel}>
                      {activeFocus
                        ? t('home.focus_active_label', { title: activeFocus.goalTitle })
                        : t('home.focus_summary', { count: todaySessionCount, mins: todayFocusMin })}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.coachPrompt}
                  onPress={() => router.push('/(tabs)/coach' as any)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="sparkles" size={16} color={Colors.purpleLight} />
                  <Text style={styles.coachText}>{t('home.ask_coach')}</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => logDistraction()}
                  style={styles.distractionBtn}
                  activeOpacity={0.75}
                >
                  <Ionicons name="warning-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.distractionBtnText}>
                    {todayDistractions > 0 ? t('home.distraction_count', { count: todayDistractions }) : t('home.distraction_prompt')}
                  </Text>
                </TouchableOpacity>

              </View>

            </View>

            {/* ROW 3: Missed Carryover & At-Risk Goals */}
            <View style={styles.gridRow}>
               {(pendingMissed.length > 0 || !isDesktop) && (
                 <View style={styles.bottomCard}>
                    <View style={styles.cardHeader}>
                      <Ionicons name="time" size={18} color={Colors.warning} />
                      <Text style={styles.cardTitle}>{t('home.missed_carryover_title')}</Text>
                    </View>
                    {pendingMissed.length > 0 ? (
                      <View style={styles.missedList}>
                        {pendingMissed.map((task, idx) => (
                          <MissedTaskRow
                            key={task.id} task={task} isLast={idx === pendingMissed.length - 1}
                            onRecover={() => markMissedTaskRecovered(task.id)}
                            onDefer={() => deferMissedTask(task.id)}
                            recoverLabel={t('home.missed_carryover_recover')} deferLabel={t('home.missed_carryover_defer')}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.emptySub}>No missed tasks</Text>
                    )}
                 </View>
               )}

               {(atRiskGoals.length > 0 || !isDesktop) && (
                 <View style={styles.bottomCard}>
                    <View style={styles.cardHeader}>
                      <Ionicons name="trending-down" size={18} color={Colors.error} />
                      <Text style={styles.cardTitle}>{t('home.at_risk_title')}</Text>
                    </View>
                    {atRiskGoals.length > 0 ? (
                      <View style={styles.riskList}>
                        {atRiskGoals.map((g) => (
                          <View key={g.goalId} style={styles.riskChip}>
                            <Text style={styles.riskTitle} numberOfLines={1}>{g.goalTitle}</Text>
                            <Text style={styles.riskSub}>{t('home.at_risk_shortfall', { hours: g.shortfallHours })}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.emptySub}>No goals at risk</Text>
                    )}
                 </View>
               )}
            </View>

          </View>

          {/* BELOW GRID: Reflection */}
          <View style={styles.reflectionCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="journal" size={18} color={Colors.textMuted} />
              <Text style={styles.cardTitle}>{t('home.reflection_title')}</Text>
            </View>
            <TextInput
              value={reflectionText}
              onChangeText={(text) => { setReflectionText(text); setReflectionSaved(false); }}
              placeholder={t('home.reflection_placeholder')}
              placeholderTextColor={Colors.textMuted}
              multiline numberOfLines={4}
              style={styles.reflectionInput}
              editable={!reflectionSaved}
            />
            {!reflectionSaved && reflectionText.trim().length > 0 && (
              <Button label={t('home.reflection_save')} onPress={handleSaveReflection} variant="ghost" size="sm" style={styles.reflectionBtn} />
            )}
            {reflectionSaved && (
              <View style={styles.reflectionSavedRow}>
                <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
                <Text style={styles.reflectionSavedText}>{t('home.reflection_saved')}</Text>
                <TouchableOpacity onPress={() => setReflectionSaved(false)}>
                  <Text style={styles.reflectionEdit}>{t('common.edit')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Missed Task Row ──────────────────────────────────────────────────────────
function MissedTaskRow({
  task, isLast, onRecover, onDefer, recoverLabel, deferLabel,
}: {
  task: MissedTask; isLast: boolean; onRecover: () => void; onDefer: () => void;
  recoverLabel: string; deferLabel: string;
}) {
  return (
    <View style={[missed.row, !isLast && missed.rowBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={missed.title} numberOfLines={1}>{task.title}</Text>
        {task.goalTitle && <Text style={missed.sub}>{task.goalTitle} · {task.originalDate}</Text>}
      </View>
      <View style={missed.actions}>
        <TouchableOpacity onPress={onRecover} style={missed.recoverBtn} activeOpacity={0.75}>
          <Text style={missed.recoverText}>{recoverLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDefer} activeOpacity={0.75}>
          <Text style={missed.deferText}>{deferLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const missed = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  rowBorder:   { borderBottomWidth: 1, borderBottomColor: Colors.border },
  title:       { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  sub:         { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  actions:     { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  recoverBtn:  { backgroundColor: Colors.goldMuted, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  recoverText: { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.semibold },
  deferText:   { fontSize: FontSize.xs, color: Colors.textMuted },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  flex:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.xl },

  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: FontSize.sm, color: Colors.purpleLight, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: FontWeight.semibold },
  date:     { fontSize: FontSize.xxxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -0.5 },
  profileAvatar: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },

  recoveryBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.goldDim, padding: Spacing.md, gap: Spacing.sm },
  recoveryLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  recoveryIconWrap: { width: 28, height: 28, borderRadius: Radius.full, backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  recoveryMsg: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  replanCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.purpleMuted, padding: Spacing.lg, gap: Spacing.md },
  replanLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  replanTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  replanSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
  replanActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, paddingLeft: 34 },
  replanYes: { backgroundColor: Colors.purple, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: 8 },
  replanYesText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textInverse },
  replanNo: { fontSize: FontSize.sm, color: Colors.textMuted },

  grid: { gap: Spacing.lg },
  blockGrid: { gap: Spacing.lg },
  gridRow: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: Spacing.lg },
  mobileRowSwap: { flexDirection: 'column-reverse' },

  // Cards
  mvdCard: { flex: 2, backgroundColor: '#18151D', borderRadius: Radius.xl, padding: Spacing.xl, justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(157, 78, 221, 0.2)' },
  mvdCardPressure: { borderColor: Colors.goldDim, ...Shadow.gold },
  mvdLabel: { fontSize: FontSize.xs, color: Colors.purpleLight, textTransform: 'uppercase', letterSpacing: 2, marginBottom: Spacing.sm, fontWeight: FontWeight.bold },
  mvdText: { fontSize: FontSize.display, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 48, letterSpacing: -1 },
  mvdGlow: { position: 'absolute', right: -50, bottom: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: Colors.purpleMuted, opacity: 0.3 },

  analyticsCard: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl, padding: Spacing.lg, justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  analyticsTitle: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.md, textAlign: 'center' },
  ringWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  breakdown: { gap: Spacing.sm },
  scoreCol: { alignItems: 'flex-start' },
  scoreVal: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  scoreTarget: { fontSize: FontSize.xs, color: Colors.textSecondary },
  driftBadge: { position: 'absolute', top: Spacing.sm, right: Spacing.sm, alignItems: 'center', backgroundColor: Colors.surfaceHigh, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.md },
  driftNum: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.gold },
  driftLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase' },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  cardTitle: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 1 },

  mustDoCard: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, minHeight: 200 },
  mustDoList: { gap: 0 },
  mustDoItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  mustDoItemBorder: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  mustDoText: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  mustDoHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  mustDoHintPositive:{ color: Colors.success },
  mustDoHintUrgent:  { color: Colors.gold },
  mustDoHintOverdue: { color: Colors.error },
  mustDoFocusBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  emptyHint: { fontSize: FontSize.sm, color: Colors.textMuted },
  emptyLink: { fontSize: FontSize.sm, color: Colors.gold },

  focusStatsCard: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.lg },
  criticalBox: { backgroundColor: 'rgba(201, 168, 76, 0.08)', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.goldMuted },
  criticalLabel: { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  criticalAction: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  focusSummary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surfaceHigh, padding: Spacing.md, borderRadius: Radius.lg },
  focusLabel: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium, flex: 1 },
  coachPrompt: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceHigh, padding: Spacing.md, borderRadius: Radius.lg, gap: Spacing.sm },
  coachText: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  distractionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md },
  distractionBtnText: { fontSize: FontSize.xs, color: Colors.textMuted },

  bottomCard: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  missedList: { gap: 0 },
  riskList: { gap: Spacing.sm },
  riskChip: { backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, padding: Spacing.md, gap: 4 },
  riskTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  riskSub: { fontSize: FontSize.xs, color: Colors.gold },
  emptySub: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic' },

  reflectionCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  reflectionInput: { color: Colors.textPrimary, fontSize: FontSize.md, lineHeight: 24, minHeight: 100, textAlignVertical: 'top', backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, padding: Spacing.md },
  reflectionBtn: { alignSelf: 'flex-end', marginTop: Spacing.md },
  reflectionSavedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, backgroundColor: Colors.successMuted, padding: Spacing.sm, borderRadius: Radius.md },
  reflectionSavedText: { fontSize: FontSize.sm, color: Colors.success, flex: 1, fontWeight: FontWeight.medium },
  reflectionEdit: { fontSize: FontSize.sm, color: Colors.textPrimary },
});
