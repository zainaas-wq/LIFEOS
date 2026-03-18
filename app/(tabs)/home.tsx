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
  useWindowDimensions,} from 'react-native';import { SafeAreaView } from 'react-native-safe-area-context';
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
  const minViableDay  = dailyDecision?.minViableDay ?? null;

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

  const [showSecondary, setShowSecondary] = useState(false);

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
                  <Ionicons name="alert-circle" size={14} color={Colors.error} />
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
                  <Text style={styles.replanSub}>Replan the rest of today to stay on track?</Text>
                </View>
              </View>
              <View style={styles.replanActions}>
                <TouchableOpacity onPress={handleAcceptReplan} style={styles.replanYes} activeOpacity={0.8}>
                  <Text style={styles.replanYesText}>Replan</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={dismissReplanSuggestion} activeOpacity={0.7}>
                  <Text style={styles.replanNo}>Ignore</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TOP ROW: DOMINANT MVD
          ══════════════════════════════════════════════════════════════════ */}
          {minViableDay && (
            <View style={styles.mvdSection}>
              <Text style={styles.mvdLabel}>TODAY'S COMMITMENT</Text>
              <Text style={styles.mvdText}>{minViableDay}</Text>
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              MIDDLE ROW: MUST-DO ITEMS (MAX 3)
          ══════════════════════════════════════════════════════════════════ */}
          <View style={styles.mustDoSection}>
            {mustDoItems.length > 0 ? (
              <View style={styles.mustDoList}>
                {mustDoItems.slice(0, 3).map((title, idx) => {
                  const planItem = controlPlan?.plan.items.find(
                    (i) => i.title === title && (i.type === 'goal' || i.type === 'skill'),
                  );
                  const urgency  = planItem ? getUrgencyLevel(planItem, nowMins) : 'none';
                  const isFocusing = !!activeFocus && !!planItem?.goalId && activeFocus.goalId === planItem.goalId;
                  
                  // NO default hint text when urgency = none
                  let hint = null;
                  if (isFocusing) hint = 'In focus now';
                  else if (urgency !== 'none') hint = getUrgencyHint(planItem!, nowMins);

                  const canFocus = !!planItem && !planItem.completed && !isFocusing;

                  // Subtly color-coded
                  const dotColor = isFocusing ? Colors.success : urgency === 'overdue' ? Colors.error : urgency === 'urgent' ? Colors.gold : Colors.purpleMuted;

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.mustDoItem, isFocusing && styles.mustDoItemFocusing]}
                      onPress={() => canFocus && handleStartFocusForMustDo(title)}
                      activeOpacity={canFocus ? 0.7 : 1}
                    >
                      <View style={[styles.urgencyDot, { backgroundColor: dotColor }]} />
                      
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.mustDoText, isFocusing && styles.mustDoTextFocus]}>{title}</Text>
                        {hint && (
                          <Text style={[
                            styles.mustDoHint,
                            isFocusing && styles.mustDoHintPositive,
                            urgency === 'urgent' && !isFocusing && styles.mustDoHintUrgent,
                            urgency === 'overdue' && !isFocusing && styles.mustDoHintOverdue
                          ]}>
                            {hint}
                          </Text>
                        )}
                      </View>
                      
                      {canFocus && (
                        <View style={styles.mustDoStartBtn}>
                          <Text style={styles.mustDoStartText}>Start</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle" size={32} color={Colors.success} style={{marginBottom: 8}} />
                <Text style={styles.emptyHint}>No mandatory actions left today.</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/plan' as any)}>
                  <Text style={styles.emptyLink}>View full plan →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ══════════════════════════════════════════════════════════════════
              BOTTOM ROW: SECONDARY INFORMATION, COLLAPSED IF UNDER PRESSURE
          ══════════════════════════════════════════════════════════════════ */}
          
          {isHighPressure && !showSecondary ? (
            <TouchableOpacity onPress={() => setShowSecondary(true)} style={styles.revealBtn} activeOpacity={0.7}>
              <Text style={styles.revealText}>Hold to reveal secondary stats</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <View style={styles.secondarySection}>
              {/* Analytics */}
              <View style={styles.statsCard}>
                 <Text style={styles.statsTitle}>ALIGNMENT SCORE</Text>
                 <View style={styles.ringWrap}>
                   <AlignmentRing result={alignmentResult} size={90} />
                   <View style={styles.breakdown}>
                     <View style={styles.scoreRow}>
                       <Text style={styles.scoreVal}>{alignmentResult.taskScore}</Text>
                       <Text style={styles.scoreTarget}>/40 Tasks</Text>
                     </View>
                     <View style={styles.scoreRow}>
                       <Text style={styles.scoreVal}>{alignmentResult.ruleScore}</Text>
                       <Text style={styles.scoreTarget}>/30 Rules</Text>
                     </View>
                     <View style={styles.scoreRow}>
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

              {/* Missed / At Risk */}
              {(pendingMissed.length > 0 || atRiskGoals.length > 0) && (
                <View style={styles.splitCards}>
                  {pendingMissed.length > 0 && (
                    <View style={styles.subCard}>
                       <View style={styles.cardHeader}>
                         <Ionicons name="time" size={16} color={Colors.warning} />
                         <Text style={styles.cardTitle}>{t('home.missed_carryover_title')}</Text>
                       </View>
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
                    </View>
                  )}

                  {atRiskGoals.length > 0 && (
                    <View style={styles.subCard}>
                       <View style={styles.cardHeader}>
                         <Ionicons name="trending-down" size={16} color={Colors.error} />
                         <Text style={styles.cardTitle}>{t('home.at_risk_title')}</Text>
                       </View>
                       <View style={styles.riskList}>
                         {atRiskGoals.map((g) => (
                           <View key={g.goalId} style={styles.riskChip}>
                             <Text style={styles.riskTitle} numberOfLines={1}>{g.goalTitle}</Text>
                             <Text style={styles.riskSub}>{t('home.at_risk_shortfall', { hours: g.shortfallHours })}</Text>
                           </View>
                         ))}
                       </View>
                    </View>
                  )}
                </View>
              )}

              {/* Reflection */}
              <View style={styles.reflectionCard}>
                <View style={styles.cardHeader}>
                  <Ionicons name="journal" size={16} color={Colors.textMuted} />
                  <Text style={styles.cardTitle}>{t('home.reflection_title')}</Text>
                </View>
                <TextInput
                  value={reflectionText}
                  onChangeText={(text) => { setReflectionText(text); setReflectionSaved(false); }}
                  placeholder={t('home.reflection_placeholder')}
                  placeholderTextColor={Colors.textMuted}
                  multiline numberOfLines={3}
                  style={styles.reflectionInput}
                  editable={!reflectionSaved}
                />
                {!reflectionSaved && reflectionText.trim().length > 0 && (
                  <TouchableOpacity style={styles.reflectionBtn} onPress={handleSaveReflection}>
                    <Text style={styles.reflectionBtnText}>Save</Text>
                  </TouchableOpacity>
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
              
              {isHighPressure && (
                 <TouchableOpacity onPress={() => setShowSecondary(false)} style={styles.collapseBtn}>
                    <Text style={styles.revealText}>Hide</Text>
                 </TouchableOpacity>
              )}
            </View>
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
  greeting: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: FontWeight.semibold },
  date:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -0.5 },
  profileAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },

  recoveryBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.errorMuted, borderRadius: Radius.md, borderWidth: 1, borderColor: '#5C2D2D', padding: Spacing.md, gap: Spacing.sm },
  recoveryLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  recoveryIconWrap: { width: 28, height: 28, borderRadius: Radius.full, backgroundColor: 'rgba(248, 113, 113, 0.2)', alignItems: 'center', justifyContent: 'center' },
  recoveryMsg: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },

  replanCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.purpleMuted, padding: Spacing.lg, gap: Spacing.md },
  replanLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  replanTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  replanSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
  replanActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, paddingLeft: 34 },
  replanYes: { backgroundColor: Colors.purple, borderRadius: Radius.sm, paddingHorizontal: Spacing.lg, paddingVertical: 6 },
  replanYesText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textInverse },
  replanNo: { fontSize: FontSize.sm, color: Colors.textMuted },

  // MVD (Dominant, emotional)
  mvdSection: { marginVertical: Spacing.sm },
  mvdLabel: { fontSize: FontSize.sm, color: Colors.purpleLight, textTransform: 'uppercase', letterSpacing: 2, marginBottom: Spacing.xs, fontWeight: FontWeight.bold },
  mvdText: { fontSize: FontSize.display, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 46, letterSpacing: -1 },

  // Must-do Tasks
  mustDoSection: { gap: Spacing.md },
  mustDoList: { gap: Spacing.sm },
  mustDoItem: { 
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, 
    padding: Spacing.md, backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border 
  },
  mustDoItemFocusing: { borderColor: Colors.success, backgroundColor: 'rgba(74, 222, 128, 0.05)' },
  urgencyDot: { width: 8, height: 8, borderRadius: 4 },
  mustDoText: { fontSize: FontSize.lg, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  mustDoTextFocus: { color: Colors.success, fontWeight: FontWeight.bold },
  mustDoHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  mustDoHintPositive:{ color: Colors.success },
  mustDoHintUrgent:  { color: Colors.gold },
  mustDoHintOverdue: { color: Colors.error },
  mustDoStartBtn: { 
    backgroundColor: Colors.purpleMuted, paddingHorizontal: Spacing.md, paddingVertical: 6, 
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.purple 
  },
  mustDoStartText: { fontSize: FontSize.sm, color: Colors.purpleLight, fontWeight: FontWeight.bold },
  
  emptyState: { paddingVertical: Spacing.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  emptyHint: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  emptyLink: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: Spacing.sm },

  // Secondary layer
  revealBtn: { alignItems: 'center', paddingVertical: Spacing.md, gap: 4, opacity: 0.6 },
  revealText: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  collapseBtn: { alignItems: 'center', paddingVertical: Spacing.md },
  
  secondarySection: { gap: Spacing.xl, marginTop: Spacing.lg, opacity: 0.9 },

  // Analytics
  statsCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, position: 'relative' },
  statsTitle: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.md },
  ringWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: Spacing.xl },
  breakdown: { gap: Spacing.sm },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  scoreVal: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, width: 28 },
  scoreTarget: { fontSize: FontSize.xs, color: Colors.textSecondary },
  driftBadge: { position: 'absolute', top: Spacing.md, right: Spacing.md, alignItems: 'flex-end' },
  driftNum: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gold },
  driftLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },

  splitCards: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: Spacing.lg },
  subCard: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  cardTitle: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  
  missedList: { gap: 0 },
  riskList: { gap: Spacing.sm },
  riskChip: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm, gap: 2, borderWidth: 1, borderColor: Colors.borderLight },
  riskTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  riskSub: { fontSize: FontSize.xs, color: Colors.error },

  reflectionCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  reflectionInput: { color: Colors.textPrimary, fontSize: FontSize.md, lineHeight: 22, minHeight: 80, textAlignVertical: 'top' },
  reflectionBtn: { alignSelf: 'flex-end', marginTop: Spacing.sm, backgroundColor: Colors.surfaceHigh, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.sm },
  reflectionBtnText: { color: Colors.textPrimary, fontSize: FontSize.sm },
  reflectionSavedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm, backgroundColor: Colors.successMuted, padding: Spacing.sm, borderRadius: Radius.sm },
  reflectionSavedText: { fontSize: FontSize.sm, color: Colors.success, flex: 1, fontWeight: FontWeight.medium },
  reflectionEdit: { fontSize: FontSize.sm, color: Colors.textPrimary },
});
