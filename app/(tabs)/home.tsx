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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.greeting}>{greetingText}</Text>
            <Text style={styles.date}>{formatDate(today)}</Text>
          </View>

          {/* ── Recovery Banner (compact, high-pressure only) ───────────────── */}
          {isRecovery && (
            <View style={styles.recoveryBanner}>
              <View style={styles.recoveryLeft}>
                <View style={styles.recoveryIconWrap}>
                  <Ionicons name="alert-circle" size={13} color={Colors.gold} />
                </View>
                <Text style={styles.recoveryMsg} numberOfLines={2}>
                  {dailyDecision?.recoveryMessage ?? t('home.recovery_banner_default')}
                </Text>
              </View>
              <View style={styles.driftBadge}>
                <Text style={styles.driftNum}>{driftScore}</Text>
                <Text style={styles.driftLabel}>{t('home.drift_label')}</Text>
              </View>
            </View>
          )}

          {/* ── Minimum Viable Day — THE dominant element ──────────────────── */}
          {minViableDay && (
            <View style={[styles.mvdCard, isHighPressure && styles.mvdCardPressure]}>
              <Text style={styles.mvdLabel}>TODAY'S COMMITMENT</Text>
              <Text style={styles.mvdText}>{minViableDay}</Text>
            </View>
          )}

          {/* ── Must-Do ────────────────────────────────────────────────────── */}
          {mustDoItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('home.must_do_title')}</Text>
              <Card gold>
                {mustDoItems.map((title, idx) => {
                  const planItem = controlPlan?.plan.items.find(
                    (i) => i.title === title && (i.type === 'goal' || i.type === 'skill'),
                  );
                  const urgency  = planItem ? getUrgencyLevel(planItem, nowMins) : 'none';

                  // P1 fix: suppress urgency if the user is already focused on this item
                  const isFocusing = !!activeFocus && !!planItem?.goalId &&
                    activeFocus.goalId === planItem.goalId;

                  // P2 fix: only show hint when urgency is actionable (not 'none')
                  const hint = isFocusing
                    ? 'In focus now'
                    : urgency !== 'none'
                      ? getUrgencyHint(planItem!, nowMins)
                      : null;

                  const hintIsPositive = isFocusing;
                  const canFocus = !!planItem && !planItem.completed && !isFocusing;

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.mustDoItem, idx > 0 && styles.mustDoItemBorder]}
                      onPress={() => canFocus && handleStartFocusForMustDo(title)}
                      activeOpacity={canFocus ? 0.7 : 1}
                    >
                      <Ionicons
                        name={
                          isFocusing    ? 'pulse'         :
                          urgency === 'overdue' ? 'alert-circle' :
                          urgency === 'urgent'  ? 'flash'        :
                          'flash-outline'
                        }
                        size={13}
                        color={
                          isFocusing           ? Colors.success :
                          urgency === 'overdue' ? Colors.error   :
                          Colors.gold
                        }
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mustDoText}>{title}</Text>
                        {hint && (
                          <Text style={[
                            styles.mustDoHint,
                            hintIsPositive               && styles.mustDoHintPositive,
                            urgency === 'urgent'  && !isFocusing && styles.mustDoHintUrgent,
                            urgency === 'overdue' && !isFocusing && styles.mustDoHintOverdue,
                          ]}>
                            {hint}
                          </Text>
                        )}
                      </View>
                      {canFocus && (
                        <View style={styles.mustDoFocusBtn}>
                          <Ionicons name="play" size={11} color={Colors.gold} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </Card>
            </View>
          )}

          {/* ── Replan suggestion ──────────────────────────────────────────── */}
          {replanSuggested && (
            <View style={styles.replanCard}>
              <View style={styles.replanLeft}>
                <Ionicons name="refresh-outline" size={14} color={Colors.gold} />
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

          {/* ── Critical Action (3rd priority slot, high-pressure mode) ──────── */}
          {isHighPressure && (() => {
            const criticalItem = controlPlan?.plan.items.find((i) => !!i.isCritical && !i.completed);
            if (!criticalItem) return null;
            return (
              <Card gold style={styles.section}>
                <View style={styles.criticalHeader}>
                  <Ionicons name="flash" size={13} color={Colors.gold} />
                  <Text style={styles.criticalLabel}>{t('home.todays_focus')}</Text>
                </View>
                <Text style={styles.criticalAction}>{criticalItem.title}</Text>
              </Card>
            );
          })()}

          {/* ── "See more" gate — collapses secondary sections under pressure ── */}
          {isHighPressure && (
            <TouchableOpacity
              onPress={() => setShowExpanded((v) => !v)}
              style={styles.expandToggle}
              activeOpacity={0.7}
            >
              <Text style={styles.expandToggleText}>
                {showExpanded ? 'Collapse' : 'See everything else'}
              </Text>
              <Ionicons
                name={showExpanded ? 'chevron-up' : 'chevron-down'}
                size={13}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              SECONDARY SECTIONS — visible on normal days; gated on pressure
          ══════════════════════════════════════════════════════════════════ */}
          {(!isHighPressure || showExpanded) && (
            <>
              {/* Alignment Ring */}
              <View style={styles.ringWrap}>
                <AlignmentRing result={alignmentResult} size={160} />
                <View style={styles.breakdown}>
                  <ScorePill label={t('home.score_tasks')}    value={alignmentResult.taskScore}       max={40} />
                  <ScorePill label={t('home.score_rules')}    value={alignmentResult.ruleScore}       max={30} />
                  <ScorePill label={t('home.score_critical')} value={alignmentResult.criticalScore}   max={20} />
                  <ScorePill label={t('home.score_reflect')}  value={alignmentResult.reflectionScore} max={10} />
                </View>
              </View>

              {/* At-Risk Goals */}
              {atRiskGoals.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('home.at_risk_title')}</Text>
                  <View style={styles.riskStrip}>
                    {atRiskGoals.map((g) => (
                      <View key={g.goalId} style={styles.riskChip}>
                        <Text style={styles.riskTitle} numberOfLines={1}>{g.goalTitle}</Text>
                        <Text style={styles.riskSub}>
                          {t('home.at_risk_shortfall', { hours: g.shortfallHours })}
                        </Text>
                        <Text style={styles.riskPace}>
                          {t('home.at_risk_pace', { hours: g.hoursNeededPerRemainingDay })}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Missed Carryover */}
              {pendingMissed.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('home.missed_carryover_title')}</Text>
                  <Card elevated>
                    {pendingMissed.map((task, idx) => (
                      <MissedTaskRow
                        key={task.id}
                        task={task}
                        isLast={idx === pendingMissed.length - 1}
                        onRecover={() => markMissedTaskRecovered(task.id)}
                        onDefer={() => deferMissedTask(task.id)}
                        recoverLabel={t('home.missed_carryover_recover')}
                        deferLabel={t('home.missed_carryover_defer')}
                      />
                    ))}
                  </Card>
                </View>
              )}

              {/* Focus stats */}
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

              {/* Distraction log */}
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

              {/* Critical Action (normal mode) */}
              {!isHighPressure && (() => {
                const criticalItem = controlPlan?.plan.items.find((i) => !!i.isCritical);
                if (criticalItem) {
                  return (
                    <Card gold style={styles.section}>
                      <View style={styles.criticalHeader}>
                        <Ionicons name="flash" size={13} color={Colors.gold} />
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

              {/* Coach shortcut */}
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

              {/* Daily Reflection */}
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
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Missed Task Row ──────────────────────────────────────────────────────────

function MissedTaskRow({
  task, isLast, onRecover, onDefer, recoverLabel, deferLabel,
}: {
  task: MissedTask; isLast: boolean;
  onRecover: () => void; onDefer: () => void;
  recoverLabel: string; deferLabel: string;
}) {
  return (
    <View style={[missed.row, !isLast && missed.rowBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={missed.title} numberOfLines={2}>{task.title}</Text>
        {task.goalTitle && (
          <Text style={missed.sub}>{task.goalTitle} · {task.originalDate}</Text>
        )}
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

// ─── Score Pill ───────────────────────────────────────────────────────────────

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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  flex:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },

  header:   { gap: 2 },
  greeting: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  date:     { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },

  // Recovery banner — compact in the new layout
  recoveryBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.goldDim,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm,
  },
  recoveryLeft:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  recoveryIconWrap:{ width: 22, height: 22, borderRadius: Radius.full, backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  recoveryMsg:     { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16 },
  driftBadge:      { alignItems: 'center', minWidth: 34 },
  driftNum:        { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.gold },
  driftLabel:      { fontSize: FontSize.xs - 1, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Minimum viable day — THE dominant element
  mvdCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg,
  },
  mvdCardPressure: {
    borderColor: Colors.goldDim,
    ...Shadow.gold,
  },
  mvdLabel: {
    fontSize: FontSize.xs, color: Colors.gold,
    textTransform: 'uppercase', letterSpacing: 1.5,
    marginBottom: Spacing.sm, fontWeight: FontWeight.semibold,
  },
  mvdText: {
    fontSize: FontSize.xxl, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, lineHeight: 32,
  },

  // Must-do
  mustDoItem:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  mustDoItemBorder:  { borderTopWidth: 1, borderTopColor: Colors.goldDim },
  mustDoText:        { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  mustDoHint:        { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  mustDoHintPositive:{ color: Colors.success },
  mustDoHintUrgent:  { color: Colors.gold },
  mustDoHintOverdue: { color: Colors.error },
  mustDoFocusBtn:    { width: 24, height: 24, borderRadius: Radius.full, backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center' },

  // Replan card
  replanCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.goldDim,
    padding: Spacing.md, gap: Spacing.sm,
  },
  replanLeft:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  replanTitle:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  replanSub:     { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 17 },
  replanActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingLeft: 22 },
  replanYes:     { backgroundColor: Colors.gold, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 5 },
  replanYesText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textInverse },
  replanNo:      { fontSize: FontSize.xs, color: Colors.textMuted },

  // "See more" gate
  expandToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.sm,
  },
  expandToggleText: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Alignment ring (in secondary zone)
  ringWrap:  { alignItems: 'center', paddingVertical: Spacing.md, gap: Spacing.md },
  breakdown: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingHorizontal: Spacing.md },

  // At-risk goals
  riskStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  riskChip:  { flex: 1, minWidth: 120, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, gap: 2 },
  riskTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  riskSub:   { fontSize: FontSize.xs, color: Colors.gold },
  riskPace:  { fontSize: FontSize.xs, color: Colors.textMuted },

  // Focus stats
  focusCard:  { gap: 0 },
  focusRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  focusLabel: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium, flex: 1 },

  // Distraction
  distractionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.xs + 2,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  distractionBtnText: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Critical action
  section:        { gap: Spacing.xs },
  sectionTitle:   { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  criticalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  criticalLabel:  { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  criticalAction: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 28 },
  emptyRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyHint:      { fontSize: FontSize.sm, color: Colors.textMuted },
  emptyLink:      { fontSize: FontSize.sm, color: Colors.gold },

  // Coach
  coachPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.goldDim, padding: Spacing.md,
  },
  coachIcon: { width: 28, height: 28, borderRadius: Radius.full, backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  coachText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary },

  // Reflection
  reflectionInput:     { color: Colors.textPrimary, fontSize: FontSize.md, lineHeight: 24, minHeight: 90, textAlignVertical: 'top' },
  reflectionBtn:       { alignSelf: 'flex-end', marginTop: Spacing.sm },
  reflectionSavedRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
  reflectionSavedText: { fontSize: FontSize.sm, color: Colors.success, flex: 1 },
  reflectionEdit:      { fontSize: FontSize.sm, color: Colors.gold },
});
