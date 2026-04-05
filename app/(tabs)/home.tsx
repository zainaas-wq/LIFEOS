import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../src/constants/theme';
import { formatDate, generateId } from '../../src/lib/utils';
import { MorningLaunchCard } from '../../src/components/MorningLaunchCard';
import { NightShutdownCard } from '../../src/components/NightShutdownCard';
import { PredictiveWarningCard } from '../../src/components/PredictiveWarningCard';
import type { PlanItem, ActiveFocusSession, DailyScheduleEntry, DayMode, DriftEvent, RecoveryMode } from '../../src/types';
import { isRecoveryBlock } from '../../src/ai/recoveryEngine';
import { computeWhyThisNow } from '../../src/ai/driftEngine';
import { useDirection } from '../../src/hooks/useDirection';
import { timeToMins } from '../../src/ai/planGenerator';
import { Badge } from '../../src/components/ui/Badge';
import { getTrialDaysLeft } from '../../src/lib/trialUtils';
import { OutcomeDashboard } from '../../src/components/OutcomeDashboard';
import { ProContextCard } from '../../src/components/ProContextCard';
import { StreakBadge } from '../../src/components/StreakBadge';
import { ReentryBanner } from '../../src/components/ReentryBanner';
import { track } from '../../src/services/analyticsService';
import * as Haptics from 'expo-haptics';
import { useHomeState } from '../../src/hooks/useHomeState';
import { useNotifPermission } from '../../src/hooks/useNotifPermission';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function formatDuration(startTime: string, endTime: string): string {
  const mins = Math.max(1, timeToMins(endTime) - timeToMins(startTime));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

function formatMins(mins: number): string {
  if (mins === 0) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── NowAction Card ───────────────────────────────────────────────────────────

interface NowActionProps {
  item: PlanItem | null;
  activeFocus: ActiveFocusSession | null;
  pressure: PressureLevel;
  pressureGrade: PressureGrade;
  isBuilding: boolean;
  isRecovery: boolean;
  isConstraint: boolean;
  nowMins: number;
  nextItem: PlanItem | null;
  total: number;
  isAiPlan: boolean;
  isLateStart: boolean;
  isStarting: boolean;
  allSkipped: boolean;
  /** Optional commitment signal shown below task title — from buildCommitmentSignal(). */
  commitmentText?: string | null;
  onStart: () => void;
  onEnd: () => void;
  onSkip: () => void;
  onGenerate: () => void;
  onRestart: () => void;
  onAcknowledgeRecovery: () => void;
  onExtend: () => void;
}

function NowAction({
  item, activeFocus, pressure, pressureGrade, isBuilding, isRecovery, isConstraint,
  nowMins, nextItem, total, isAiPlan,
  isLateStart, isStarting, allSkipped, commitmentText,
  onStart, onEnd, onSkip, onGenerate, onRestart, onAcknowledgeRecovery, onExtend,
}: NowActionProps) {
  const { t } = useTranslation();
  const dir = useDirection();

  const isActiveHere = !!(activeFocus && item && activeFocus.goalId === item.goalId);
  const focusBlocked = !!activeFocus && !isActiveHere;

  // Elapsed timer
  const [elapsedSecs, setElapsedSecs] = useState(0);
  useEffect(() => {
    if (!isActiveHere || !activeFocus) { setElapsedSecs(0); return; }
    const update = () =>
      setElapsedSecs(Math.floor((Date.now() - new Date(activeFocus.startedAt).getTime()) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isActiveHere, activeFocus?.startedAt]);
  const mm = String(Math.floor(elapsedSecs / 60)).padStart(2, '0');
  const ss = String(elapsedSecs % 60).padStart(2, '0');

  // Pulse for critical pressure
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (pressure === 'critical') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.25, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [pressure]);

  // Scale when active
  const cardScaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(cardScaleAnim, { toValue: isActiveHere ? 1.01 : 1, useNativeDriver: true, friction: 7 }).start();
  }, [isActiveHere]);

  // Expandable title
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [titleOverflows, setTitleOverflows] = useState(false);

  // ── Building ─────────────────────────────────────────────────────────────
  if (isBuilding) {
    return (
      <View style={now.card}>
        <View style={now.topRow}>
          <Badge label={t('home.now_action_label')} variant="gold" />
        </View>
        <View style={{ flexDirection: dir.rowDir, alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.sm }}>
          <ActivityIndicator size="small" color={Colors.gold} />
          <Text style={now.buildingText}>{t('home.now_action_building')}</Text>
        </View>
      </View>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────
  if (!item && total === 0) {
    return (
      <View style={now.emptyCard}>
        <Ionicons name="sparkles-outline" size={32} color={Colors.gold} />
        <View style={{ gap: 6, alignItems: 'center' }}>
          <Text style={now.emptyTitle}>{t('home.now_empty_title')}</Text>
          <Text style={now.emptySub}>{t('home.now_empty_sub')}</Text>
        </View>
        <TouchableOpacity onPress={onGenerate} style={now.primaryBtn} activeOpacity={0.85}>
          <Ionicons name="sparkles" size={15} color={Colors.textInverse} />
          <Text style={now.primaryBtnText}>{t('home.now_empty_cta')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── All skipped ──────────────────────────────────────────────────────────
  if (!item && allSkipped) {
    return (
      <View style={[now.card, now.cardWarning]}>
        <View style={now.topRow}>
          <Badge label={t('home.now_action_label')} variant="warning" />
        </View>
        <Text style={now.itemTitle}>{t('home.all_skipped_title')}</Text>
        <Text style={now.subText}>{t('home.all_skipped_sub')}</Text>
        <TouchableOpacity onPress={onRestart} style={now.ghostBtn} activeOpacity={0.8}>
          <Text style={now.ghostBtnText}>{t('home.all_skipped_restart')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── All done ─────────────────────────────────────────────────────────────
  if (!item) {
    return (
      <View style={[now.card, now.cardSuccess]}>
        <View style={now.topRow}>
          <Badge label={t('home.now_action_label')} variant="success" />
        </View>
        <View style={{ flexDirection: dir.rowDir, alignItems: 'center', gap: Spacing.sm, paddingTop: 4 }}>
          <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
          <Text style={[now.itemTitle, { color: Colors.success }]}>{t('home.now_action_caught_up')}</Text>
        </View>
      </View>
    );
  }

  // ── Constraint block (locked work/class time — no task CTA) ─────────────
  if (item && isConstraint) {
    const remaining = Math.max(0, timeToMins(item.endTime) - nowMins);
    return (
      <View style={[now.card, now.cardConstraint]}>
        <View style={[now.topRow, { flexDirection: dir.rowDir }]}>
          <Badge label={t('home.constraint_card_label')} variant="muted" />
          {remaining > 0 && (
            <Text style={[now.timeLabel, { marginLeft: 'auto' as any }]}>
              {t('home.constraint_card_ends_at', { time: item.endTime })}
            </Text>
          )}
        </View>
        <Text style={now.itemTitle} numberOfLines={2}>{item.title}</Text>
        <View style={[now.metaRow, { flexDirection: dir.rowDir }]}>
          <View style={now.chip}>
            <Ionicons name="lock-closed-outline" size={11} color={Colors.textMuted} />
            <Text style={now.chipText}>{formatDuration(item.startTime, item.endTime)}</Text>
          </View>
          <Text style={now.timeLabel}>{item.startTime} – {item.endTime}</Text>
        </View>
        {nextItem && (
          <View style={[now.nextUpRow, { flexDirection: dir.rowDir }]}>
            <Text style={now.nextUpLabel}>{t('home.constraint_card_next')}:</Text>
            <Text style={now.nextUpTitle} numberOfLines={1}>{nextItem.title}</Text>
          </View>
        )}
      </View>
    );
  }

  // ── Recovery block (post-constraint recharge — suppress task urgency) ─────
  if (item && isRecovery) {
    const remaining = Math.max(0, timeToMins(item.endTime) - nowMins);
    return (
      <Animated.View style={[now.card, now.cardRecovery, { transform: [{ scale: cardScaleAnim }] }]}>
        <View style={[now.topRow, { flexDirection: dir.rowDir }]}>
          <Badge label={t('home.recovery_card_label')} variant="purple" />
          {remaining > 0 && (
            <Text style={[now.timeLabel, { marginLeft: 'auto' as any }]}>
              {t('home.recovery_mins_left', { count: remaining })}
            </Text>
          )}
        </View>
        <Text style={[now.itemTitle, { color: Colors.purpleLight }]} numberOfLines={2}>
          {t(item.title as any)}
        </Text>
        <Text style={now.subText}>{t('home.recovery_card_msg')}</Text>
        {nextItem && (
          <View style={[now.nextUpRow, { flexDirection: dir.rowDir }]}>
            <Text style={now.nextUpLabel}>{t('home.next_up')}:</Text>
            <Text style={now.nextUpTitle} numberOfLines={1}>{nextItem.title}</Text>
          </View>
        )}
        <TouchableOpacity onPress={onAcknowledgeRecovery} style={now.primaryBtn} activeOpacity={0.85}>
          <Text style={now.primaryBtnText}>{t('home.recovery_card_ready')}</Text>
          <Ionicons name="checkmark" size={16} color={Colors.textInverse} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── Active item ──────────────────────────────────────────────────────────
  const accentColor =
    pressure === 'critical' ? Colors.error :
    pressure === 'elevated' ? Colors.warning :
    Colors.gold;

  return (
    <Animated.View style={[now.card, { borderColor: accentColor }, { transform: [{ scale: cardScaleAnim }] }]}>
      {/* Top row: NOW badge + meta chips */}
      <View style={[now.topRow, { flexDirection: dir.rowDir }]}>
        {isLateStart
          ? <Badge label={t('home.late_start_badge')} variant="warning" />
          : <Badge label={t('home.now_action_label')} variant="gold" />
        }
        {isAiPlan && <Badge label={t('home.coach_built')} variant="purple" icon="sparkles" />}
        {item.source && item.source !== 'goal' && (
          <Badge label={t(`home.source_${item.source}` as any)} variant="muted" />
        )}

        {/* Pressure dot */}
        <View style={[now.pressureDot, {
          backgroundColor: pressureGrade >= 3 ? Colors.error
            : pressureGrade >= 1 ? Colors.warning
            : Colors.success,
          marginLeft: 'auto' as any,
        }]} />
      </View>

      {/* Pressure tone */}
      {pressureGrade > 0 && (
        <Animated.Text
          style={[
            now.pressureText,
            pressureGrade >= 2 ? { color: Colors.error } : { color: Colors.warning },
            pressureGrade >= 3 && { opacity: pulseAnim },
          ]}
        >
          {t(`home.pressure_tone_${pressureGrade}` as any)}
        </Animated.Text>
      )}

      {/* Task title — hero text, tappable to expand when truncated */}
      <TouchableOpacity
        onPress={() => titleOverflows && setTitleExpanded((v) => !v)}
        activeOpacity={titleOverflows ? 0.7 : 1}
      >
        <Text
          style={now.itemTitle}
          numberOfLines={titleExpanded ? 0 : 3}
          onTextLayout={(e) => {
            if (!titleExpanded) setTitleOverflows(e.nativeEvent.lines.length >= 3);
          }}
        >
          {item.title}
        </Text>
        {titleOverflows && !titleExpanded && (
          <Text style={now.titleExpandHint}>tap to expand</Text>
        )}
      </TouchableOpacity>

      {/* Commitment signal — historical context, never guilt-inducing */}
      {commitmentText && (
        <Text style={now.commitmentText} numberOfLines={2}>{commitmentText}</Text>
      )}

      {/* Meta row */}
      <View style={[now.metaRow, { flexDirection: dir.rowDir }]}>
        <View style={now.chip}>
          <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
          <Text style={now.chipText}>{formatDuration(item.startTime, item.endTime)}</Text>
        </View>
        <Text style={now.timeLabel}>{item.startTime} – {item.endTime}</Text>
        <TouchableOpacity onPress={onExtend} style={now.extendChip} activeOpacity={0.7}>
          <Text style={now.extendText}>+10m</Text>
        </TouchableOpacity>
        {item.energyRequired && (
          <View style={[
            now.energyChip,
            item.energyRequired === 'high'   ? { backgroundColor: Colors.goldMuted }   :
            item.energyRequired === 'medium' ? { backgroundColor: 'rgba(100,150,237,0.12)' } :
                                               { backgroundColor: 'rgba(100,100,100,0.12)' },
          ]}>
            <Text style={[
              now.energyText,
              item.energyRequired === 'high' ? { color: Colors.goldLight } :
              item.energyRequired === 'medium' ? { color: '#7B9FE0' } : { color: Colors.textMuted },
            ]}>
              {item.energyRequired}
            </Text>
          </View>
        )}
      </View>

      {/* CTA */}
      {isActiveHere ? (
        <View style={[now.activeRow, { flexDirection: dir.rowDir }]}>
          <Text style={now.timer}>{mm}:{ss}</Text>
          <TouchableOpacity onPress={onEnd} style={now.endBtn} activeOpacity={0.85}>
            <Text style={now.endBtnText}>{t('home.now_action_end')}</Text>
          </TouchableOpacity>
        </View>
      ) : focusBlocked ? (
        <View style={[now.blockedRow, { flexDirection: dir.rowDir }]}>
          <Ionicons name="timer-outline" size={14} color={Colors.textMuted} />
          <Text style={now.blockedText}>{t('home.focus_in_progress')}</Text>
        </View>
      ) : (
        <>
          <TouchableOpacity
            onPress={onStart}
            style={[now.primaryBtn, isStarting && { opacity: 0.7 }]}
            activeOpacity={0.88}
            disabled={isStarting}
          >
            {isStarting
              ? <ActivityIndicator size="small" color={Colors.textInverse} />
              : <>
                  <Text style={now.primaryBtnText}>{t(`home.pressure_btn_${pressureGrade}` as any)}</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.textInverse} />
                </>
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkip} style={now.skipRow} activeOpacity={0.6}>
            <Text style={now.skipText}>{t('home.now_action_skip')}</Text>
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
}

const now = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: 2,
    borderColor: Colors.gold,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.gold,
  },
  emptyCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    padding: Spacing.xl,
    gap: Spacing.md,
    alignItems: 'center',
  },
  cardWarning:     { borderColor: Colors.warning, ...Shadow.md },
  cardSuccess:     { borderColor: Colors.success, ...Shadow.md },
  cardConstraint:  { borderColor: '#C45C7A', ...Shadow.md },
  cardRecovery:    { borderColor: Colors.purpleLight, ...Shadow.md },
  topRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  pressureDot:  { width: 8, height: 8, borderRadius: 4 },
  pressureText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  itemTitle:       { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -0.5, lineHeight: 32 },
  titleExpandHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  commitmentText:  { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, fontStyle: 'italic' },
  subText:        { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  chipText:     { fontSize: FontSize.xs, color: Colors.textSecondary },
  timeLabel:    { fontSize: FontSize.xs, color: Colors.textMuted },
  extendChip:   { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  extendText:   { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  energyChip:   { borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  energyText:   { fontSize: FontSize.xs, textTransform: 'capitalize' },
  activeRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.xs },
  timer:        { fontSize: FontSize.display, fontWeight: FontWeight.bold, color: Colors.gold, letterSpacing: -2 },
  endBtn:       { backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  endBtnText:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  primaryBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.gold, borderRadius: Radius.lg, paddingVertical: 18, ...Shadow.gold },
  primaryBtnText:{ fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textInverse, letterSpacing: 0.3 },
  ghostBtn:     { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border },
  ghostBtnText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.semibold },
  skipRow:      { alignItems: 'center', paddingVertical: Spacing.xs },
  skipText:     { fontSize: FontSize.sm, color: Colors.textMuted },
  buildingText: { fontSize: FontSize.md, color: Colors.textMuted },
  blockedRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  blockedText:  { fontSize: FontSize.sm, color: Colors.textMuted },
  nextUpRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  nextUpLabel:  { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  nextUpTitle:  { fontSize: FontSize.xs, color: Colors.textSecondary, flex: 1, fontWeight: FontWeight.medium },
  emptyTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  emptySub:     { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});

// ─── Day Mode Strip ───────────────────────────────────────────────────────────

const DAY_MODE_CONFIG: Record<DayMode, { color: string; bg: string; icon: string }> = {
  ON_TRACK:  { color: Colors.success,     bg: Colors.successMuted,                 icon: 'checkmark-circle-outline' },
  DRIFTING:  { color: Colors.warning,     bg: 'rgba(251,191,36,0.1)',              icon: 'warning-outline' },
  CRITICAL:  { color: Colors.error,       bg: Colors.errorMuted,                   icon: 'alert-circle-outline' },
  RECOVERY:  { color: Colors.purpleLight, bg: Colors.purpleMuted,                  icon: 'refresh-outline' },
};

function DayModeStrip({ mode }: { mode: DayMode }) {
  const { t } = useTranslation();
  const cfg = DAY_MODE_CONFIG[mode];
  const labelKey = `home.day_mode_${mode.toLowerCase()}` as any;

  return (
    <View style={[dm.strip, { backgroundColor: cfg.bg, borderColor: cfg.color + '33' }]}>
      <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
      <Text style={[dm.label, { color: cfg.color }]}>{t(labelKey)}</Text>
      {mode === 'CRITICAL' && (
        <View style={dm.pulse}>
          <View style={[dm.pulseDot, { backgroundColor: cfg.color }]} />
        </View>
      )}
    </View>
  );
}

const dm = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  label: { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5, textTransform: 'uppercase' },
  pulse: { marginLeft: 2, justifyContent: 'center', alignItems: 'center', width: 8, height: 8 },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
});

// ─── Why-This-Now Card ────────────────────────────────────────────────────────

interface WhyThisNowProps {
  item: PlanItem;
  goals: import('../../src/types').Goal[];
  dailyDecision: import('../../src/types').DailyDecision | null;
  pressure: import('../../src/types').PressureInfo;
}

function WhyThisNowCard({ item, goals, dailyDecision, pressure }: WhyThisNowProps) {
  const { t } = useTranslation();
  const dir = useDirection();
  const why = useMemo(
    () => computeWhyThisNow(item, goals, dailyDecision, pressure),
    [item, goals, dailyDecision, pressure],
  );
  if (!why) return null;

  const urgencyColor =
    why.urgencyLevel === 'critical' ? Colors.error :
    why.urgencyLevel === 'high'     ? Colors.warning :
    Colors.textMuted;

  // RTL: accent border switches sides
  const borderStyle = dir.isRTL
    ? { borderRightColor: urgencyColor, borderRightWidth: 3, borderLeftWidth: 0 }
    : { borderLeftColor: urgencyColor };

  return (
    <View style={[wn.card, borderStyle]}>
      {/* Why row */}
      <View style={wn.row}>
        <Text style={wn.label}>{t('home.why_label')}</Text>
        <Text style={[wn.value, { color: urgencyColor === Colors.textMuted ? Colors.textSecondary : urgencyColor }]}>
          {t(why.reason as any, { days: (() => {
            if (!item.goalId) return undefined;
            const g = goals.find(g => g.id === item.goalId);
            if (!g?.deadline) return undefined;
            return Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000);
          })() })}
        </Text>
      </View>
      {/* Risk row */}
      <View style={wn.row}>
        <Text style={wn.label}>{t('home.risk_label')}</Text>
        <Text style={wn.risk}>{t(why.risk as any)}</Text>
      </View>
      {/* Goal attribution */}
      {why.goalTitle && (
        <Text style={wn.goal} numberOfLines={1}>→ {why.goalTitle}</Text>
      )}
    </View>
  );
}

const wn = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 6,
  },
  row:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  label: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: FontWeight.semibold, minWidth: 60, paddingTop: 2 },
  value: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, flex: 1, lineHeight: 18 },
  risk:  { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  goal:  { fontSize: FontSize.xs, color: Colors.textMuted, paddingLeft: 60 + Spacing.sm },
});

// ─── Drift Intervention Card ──────────────────────────────────────────────────

interface DriftCardProps {
  drift: DriftEvent;
  onDismiss: () => void;
  onRecover: (mode: RecoveryMode) => void;
}

function DriftInterventionCard({ drift, onDismiss, onRecover }: DriftCardProps) {
  const { t } = useTranslation();
  const [showSheet, setShowSheet] = useState(false);

  const severity = drift.severity;
  const borderColor =
    severity === 'high'   ? Colors.error :
    severity === 'medium' ? Colors.warning :
    Colors.textMuted;

  const RECOVERY_OPTIONS: { mode: RecoveryMode; titleKey: string; descKey: string }[] = [
    { mode: 'save_day',      titleKey: 'home.recovery_save_day',      descKey: 'home.recovery_save_day_desc' },
    { mode: 'critical_only', titleKey: 'home.recovery_critical_only', descKey: 'home.recovery_critical_only_desc' },
    { mode: 'resume_now',    titleKey: 'home.recovery_resume_now',    descKey: 'home.recovery_resume_now_desc' },
    { mode: 'compress_day',  titleKey: 'home.recovery_compress_day',  descKey: 'home.recovery_compress_day_desc' },
  ];

  const availableOptions = RECOVERY_OPTIONS.filter((o) =>
    drift.recoveryOptions.includes(o.mode),
  );

  return (
    <>
      {/* Inline drift card */}
      <View style={[dc.card, { borderColor }]}>
        <View style={dc.topRow}>
          <Ionicons
            name={severity === 'high' ? 'alert-circle' : 'warning'}
            size={16}
            color={borderColor}
          />
          <Text style={[dc.title, { color: borderColor }]}>
            {t(drift.messageKey as any)}
          </Text>
          <TouchableOpacity onPress={onDismiss} style={dc.dismiss} activeOpacity={0.7}>
            <Ionicons name="close" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={dc.detail}>{t(drift.detailKey as any)}</Text>

        {/* Quick recovery actions (first 2) */}
        <View style={dc.actions}>
          {availableOptions.slice(0, 2).map((opt) => (
            <TouchableOpacity
              key={opt.mode}
              onPress={() => onRecover(opt.mode)}
              style={dc.actionBtn}
              activeOpacity={0.8}
            >
              <Text style={dc.actionText}>{t(opt.titleKey as any)}</Text>
            </TouchableOpacity>
          ))}
          {availableOptions.length > 2 && (
            <TouchableOpacity
              onPress={() => setShowSheet(true)}
              style={dc.moreBtn}
              activeOpacity={0.7}
            >
              <Text style={dc.moreText}>{t('home.recovery_sheet_title')} →</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Full recovery sheet modal */}
      <Modal
        visible={showSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSheet(false)}
      >
        <View style={dc.overlay}>
          <View style={dc.sheet}>
            <Text style={dc.sheetTitle}>{t('home.recovery_sheet_title')}</Text>
            <Text style={dc.sheetSub}>{t('home.recovery_sheet_sub')}</Text>

            {availableOptions.map((opt) => (
              <TouchableOpacity
                key={opt.mode}
                onPress={() => { setShowSheet(false); onRecover(opt.mode); }}
                style={dc.sheetOption}
                activeOpacity={0.85}
              >
                <Text style={dc.sheetOptionTitle}>{t(opt.titleKey as any)}</Text>
                <Text style={dc.sheetOptionDesc}>{t(opt.descKey as any)}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              onPress={() => setShowSheet(false)}
              style={dc.cancelBtn}
              activeOpacity={0.7}
            >
              <Text style={dc.cancelText}>{t('home.recovery_cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const dc = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  topRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, flex: 1 },
  dismiss:  { padding: 4 },
  detail:   { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  actions:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: 2 },
  actionBtn:{ flex: 1, minWidth: 120, backgroundColor: Colors.surface, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.borderLight },
  actionText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  moreBtn:  { paddingVertical: 10, paddingHorizontal: Spacing.md },
  moreText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  // Sheet modal
  overlay:  { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet:    { backgroundColor: Colors.surfaceElevated, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, paddingBottom: 40, gap: Spacing.md },
  sheetTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  sheetSub:   { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 4 },
  sheetOption:{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, gap: 4, borderWidth: 1, borderColor: Colors.border },
  sheetOptionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  sheetOptionDesc:  { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  cancelBtn:  { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelText: { fontSize: FontSize.sm, color: Colors.textMuted },
});

// ─── Schedule Prompt Card (daily_input users with no entry yet) ───────────────

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function TimeInputInline({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={sp.inputWrap}>
      <Text style={sp.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={sp.input}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        placeholder="HH:MM"
        placeholderTextColor={Colors.textMuted}
        selectTextOnFocus
      />
    </View>
  );
}

function SchedulePromptCard({
  userType,
  onSubmit,
}: {
  userType: 'worker' | 'student' | 'worker_student';
  onSubmit: (entry: DailyScheduleEntry) => void;
}) {
  const { t } = useTranslation();
  const today = getTodayDate();

  const [workStart,  setWorkStart]  = useState('09:00');
  const [workEnd,    setWorkEnd]    = useState('17:00');
  const [studyStart, setStudyStart] = useState('09:00');
  const [studyEnd,   setStudyEnd]   = useState('13:00');

  const showWork  = userType === 'worker'  || userType === 'worker_student';
  const showStudy = userType === 'student' || userType === 'worker_student';

  const workOk  = !showWork  || (TIME_RE.test(workStart)  && TIME_RE.test(workEnd)  && workStart  < workEnd);
  const studyOk = !showStudy || (TIME_RE.test(studyStart) && TIME_RE.test(studyEnd) && studyStart < studyEnd);
  const canSubmit = workOk && studyOk;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      date:       today,
      workStart:  showWork  ? workStart  : undefined,
      workEnd:    showWork  ? workEnd    : undefined,
      studyStart: showStudy ? studyStart : undefined,
      studyEnd:   showStudy ? studyEnd   : undefined,
    });
  };

  const handleNoWork = () => {
    onSubmit({ date: today, noWorkToday: true });
  };

  return (
    <View style={sp.card}>
      <View style={sp.topRow}>
        <Ionicons name="calendar-outline" size={20} color={Colors.gold} />
        <Text style={sp.title}>{t('home.schedule_prompt_title')}</Text>
      </View>
      <Text style={sp.sub}>{t('home.schedule_prompt_sub')}</Text>

      {showWork && (
        <View style={sp.group}>
          <Text style={sp.groupLabel}>{t('home.schedule_prompt_work_label')}</Text>
          <View style={sp.timeRow}>
            <TimeInputInline label={t('home.schedule_prompt_starts')} value={workStart} onChange={setWorkStart} />
            <Text style={sp.dash}>–</Text>
            <TimeInputInline label={t('home.schedule_prompt_ends')} value={workEnd} onChange={setWorkEnd} />
          </View>
        </View>
      )}

      {showStudy && (
        <View style={sp.group}>
          <Text style={sp.groupLabel}>{t('home.schedule_prompt_study_label')}</Text>
          <View style={sp.timeRow}>
            <TimeInputInline label={t('home.schedule_prompt_starts')} value={studyStart} onChange={setStudyStart} />
            <Text style={sp.dash}>–</Text>
            <TimeInputInline label={t('home.schedule_prompt_ends')} value={studyEnd} onChange={setStudyEnd} />
          </View>
        </View>
      )}

      <TouchableOpacity
        onPress={handleSubmit}
        style={[sp.cta, !canSubmit && sp.ctaDisabled]}
        disabled={!canSubmit}
        activeOpacity={0.85}
      >
        <Text style={sp.ctaText}>{t('home.schedule_prompt_cta')}</Text>
        <Ionicons name="arrow-forward" size={16} color={Colors.textInverse} />
      </TouchableOpacity>

      <TouchableOpacity onPress={handleNoWork} style={sp.noWork} activeOpacity={0.7}>
        <Text style={sp.noWorkText}>{t('home.schedule_prompt_off')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const sp = StyleSheet.create({
  card:       { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl, borderWidth: 2, borderColor: Colors.goldDim, padding: Spacing.lg, gap: Spacing.md },
  topRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title:      { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, flex: 1 },
  sub:        { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  group:      { gap: Spacing.xs },
  groupLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: FontWeight.semibold },
  timeRow:    { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  inputWrap:  { flex: 1, gap: 4 },
  inputLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  input:      { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.lg, color: Colors.textPrimary, fontWeight: FontWeight.semibold, textAlign: 'center' },
  dash:       { fontSize: FontSize.lg, color: Colors.textMuted, paddingBottom: 10 },
  cta:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.gold, borderRadius: Radius.lg, paddingVertical: 16, marginTop: Spacing.xs, ...Shadow.gold },
  ctaDisabled:{ opacity: 0.4 },
  ctaText:    { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textInverse },
  noWork:     { alignItems: 'center', paddingVertical: Spacing.sm },
  noWorkText: { fontSize: FontSize.sm, color: Colors.textMuted },
});

// ─── Stat Strip (3 metrics in a row) ─────────────────────────────────────────

function StatStrip({
  completed, total, focusMins, pct,
}: { completed: number; total: number; focusMins: number; pct: number }) {
  const { t } = useTranslation();
  const dir = useDirection();
  const doneColor  = completed >= total && total > 0 ? Colors.success : Colors.textPrimary;
  const focusColor = focusMins > 0 ? Colors.purpleLight : Colors.textMuted;

  return (
    <View style={[strip.card, { flexDirection: dir.rowDir }]}>
      {/* Tasks */}
      <View style={strip.col}>
        <Text style={[strip.val, { color: doneColor }]}>
          {completed}<Text style={strip.valSub}>/{total}</Text>
        </Text>
        <Text style={strip.label}>{t('home.qs_tasks')}</Text>
      </View>

      <View style={strip.sep} />

      {/* Focus */}
      <View style={strip.col}>
        <Text style={[strip.val, { color: focusColor }]}>{formatMins(focusMins)}</Text>
        <Text style={strip.label}>{t('home.qs_focus')}</Text>
      </View>

      <View style={strip.sep} />

      {/* Day progress */}
      <View style={strip.col}>
        <Text style={[strip.val, { color: pct >= 100 ? Colors.success : Colors.gold }]}>
          {pct}<Text style={strip.valSub}>%</Text>
        </Text>
        <Text style={strip.label}>{t('home.stat_day')}</Text>
      </View>
    </View>
  );
}

const strip = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
  },
  col:    { flex: 1, alignItems: 'center', gap: 4 },
  sep:    { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 4 },
  val:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold, letterSpacing: -0.5 },
  valSub: { fontSize: FontSize.md, fontWeight: FontWeight.regular, color: Colors.textMuted },
  label:  { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: FontWeight.medium },
});

// ─── Today's Tasks List ───────────────────────────────────────────────────────

const TASK_ACCENT: Record<string, string> = {
  goal: Colors.gold, skill: '#7B9FE0', health: '#4ADE80', habit: Colors.purpleLight,
};

function TodayTasks({
  items,
  nextBestActionId,
  onToggle,
}: {
  items: PlanItem[];
  nextBestActionId: string | null;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const dir = useDirection();
  const [showAll, setShowAll] = useState(false);

  const tasks = useMemo(
    () => items
      .filter(i => i.type === 'goal' || i.type === 'skill')
      .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime)),
    [items],
  );

  if (tasks.length === 0) return null;

  const VISIBLE = 4;
  const shown = showAll ? tasks : tasks.slice(0, VISIBLE);
  const hiddenCount = tasks.length - VISIBLE;

  return (
    <View style={tt.wrap}>
      {/* Section header */}
      <View style={[tt.header, { flexDirection: dir.rowDir }]}>
        <Text style={tt.sectionLabel}>{t('home.task_stack_title')}</Text>
        <View style={tt.countPill}>
          <Text style={tt.countText}>{tasks.length}</Text>
        </View>
      </View>

      {/* Task rows */}
      <View style={tt.list}>
        {shown.map((item) => {
          const isNext     = item.id === nextBestActionId;
          const isCritical = !!item.isCritical;
          const accent     = isCritical ? Colors.error : isNext ? Colors.gold : TASK_ACCENT[item.type] ?? Colors.textMuted;

          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => onToggle(item.id)}
              style={[
                tt.row,
                isNext && !item.completed && tt.rowNext,
                item.completed && tt.rowDone,
              ]}
              activeOpacity={0.7}
            >
              {/* Left accent bar */}
              <View style={[tt.accentBar, { backgroundColor: item.completed ? Colors.surfaceHigh : accent }]} />

              {/* Time */}
              <Text style={tt.time}>{item.startTime}</Text>

              {/* Title + label */}
              <View style={tt.mid}>
                {isNext && !item.completed && (
                  <Text style={tt.nextLabel}>{t('home.do_this_now')}</Text>
                )}
                <Text
                  style={[
                    tt.title,
                    isNext && !item.completed && { color: Colors.gold, fontWeight: FontWeight.bold },
                    isCritical && !item.completed && { color: Colors.error },
                    item.completed && tt.titleDone,
                  ]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
              </View>

              {/* Duration + checkbox */}
              <View style={tt.right}>
                {!item.completed && (
                  <Text style={tt.duration}>{formatDuration(item.startTime, item.endTime)}</Text>
                )}
                <View style={[tt.checkbox, item.completed && tt.checkboxDone]}>
                  {item.completed && <Ionicons name="checkmark" size={11} color={Colors.textInverse} />}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Show more / less */}
      {tasks.length > VISIBLE && (
        <TouchableOpacity onPress={() => setShowAll(v => !v)} style={tt.showMore} activeOpacity={0.7}>
          <Text style={tt.showMoreText}>
            {showAll ? t('home.show_less') : t('home.show_more', { count: hiddenCount })}
          </Text>
          <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={12} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const tt = StyleSheet.create({
  wrap:       { gap: Spacing.sm },
  header:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: 2 },
  sectionLabel:{ fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: FontWeight.semibold },
  countPill:  { backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText:  { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.bold },
  list:       { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 14, paddingRight: Spacing.md, minHeight: 56, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  rowNext:    { backgroundColor: Colors.goldMuted },
  rowDone:    { opacity: 0.4 },
  accentBar:  { width: 3, alignSelf: 'stretch', borderRadius: 2, marginLeft: 2 },
  time:       { fontSize: FontSize.xs, color: Colors.textMuted, width: 40, textAlign: 'right', paddingRight: 4 },
  mid:        { flex: 1, gap: 2 },
  nextLabel:  { fontSize: 10, color: Colors.gold, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: FontWeight.bold },
  title:      { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium, lineHeight: 22 },
  titleDone:  { textDecorationLine: 'line-through', color: Colors.textMuted },
  right:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  duration:   { fontSize: FontSize.xs, color: Colors.textMuted },
  checkbox:   { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  checkboxDone:{ backgroundColor: Colors.success, borderColor: Colors.success },
  showMore:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm },
  showMoreText:{ fontSize: FontSize.sm, color: Colors.textMuted },
});

// ─── Today's Timeline (full-day vertical schedule) ────────────────────────────

const BLOCK_COLORS: Record<string, string> = {
  // by item type
  goal: Colors.gold, skill: '#7B9FE0', break: Colors.textMuted, event: '#E07BA0', free: Colors.surfaceHigh,
  // by blockKind (takes priority over type)
  recovery: Colors.purpleLight, reward: Colors.goldLight, habit: '#4ADE80',
  constraint: '#C45C7A', buffer: Colors.textMuted,
};

function TodayTimeline({
  items, nowMins, onToggle,
}: {
  items: PlanItem[]; nowMins: number; onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const dir = useDirection();

  const sorted = useMemo(
    () => [...items].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime)),
    [items],
  );

  if (sorted.length === 0) return null;

  return (
    <View style={tl.container}>
      <View style={[tl.header, { flexDirection: dir.rowDir }]}>
        <Text style={tl.sectionLabel}>{t('home.timeline_title')}</Text>
      </View>
      <View style={tl.list}>
        {sorted.map((item) => {
          const startM    = timeToMins(item.startTime);
          const endM      = timeToMins(item.endTime);
          const isNow     = nowMins >= startM && nowMins < endM;
          const isPast    = endM <= nowMins;
          const kind      = item.blockKind ?? item.type;
          const color     = BLOCK_COLORS[kind] ?? BLOCK_COLORS[item.type] ?? Colors.textMuted;
          const rawTitle  = item.displayLabel ?? item.title;
          const label     = rawTitle.startsWith('recovery.') ? t(rawTitle as any) : rawTitle;
          const durMins   = Math.max(1, endM - startM);
          const durLabel  = durMins >= 60
            ? `${Math.floor(durMins / 60)}h${durMins % 60 > 0 ? ` ${durMins % 60}m` : ''}`
            : `${durMins}m`;
          const isTappable = item.type === 'goal' || item.type === 'skill' || item.type === 'habit';

          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => isTappable && onToggle(item.id)}
              activeOpacity={isTappable ? 0.7 : 1}
              style={[tl.row, isNow && tl.rowNow, isPast && !item.completed && tl.rowPast]}
            >
              <Text style={[tl.time, isPast && !isNow && tl.timeDim]}>{item.startTime}</Text>
              <View style={[tl.accent, { backgroundColor: item.completed ? Colors.surfaceHigh : color }]} />
              <View style={tl.content}>
                {isNow && <Text style={tl.nowBadge}>{t('home.now_action_label')}</Text>}
                <Text
                  style={[
                    tl.label,
                    item.completed && tl.labelDone,
                    isPast && !item.completed && !isNow && tl.labelDim,
                    isNow && tl.labelNow,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
              <View style={[tl.right, { flexDirection: dir.rowDir }]}>
                <Text style={[tl.dur, isPast && !isNow && tl.labelDim]}>{durLabel}</Text>
                {item.completed && <Ionicons name="checkmark-circle" size={14} color={Colors.success} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const tl = StyleSheet.create({
  container:    { gap: Spacing.sm },
  header:       { paddingHorizontal: 2, marginBottom: 2 },
  sectionLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: FontWeight.semibold },
  list:         { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 12, paddingRight: Spacing.md, minHeight: 48, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  rowNow:       { backgroundColor: 'rgba(201,168,76,0.06)' },
  rowPast:      { opacity: 0.45 },
  time:         { fontSize: FontSize.xs, color: Colors.textMuted, width: 44, textAlign: 'right', paddingRight: 4 },
  timeDim:      { color: 'rgba(255,255,255,0.2)' },
  accent:       { width: 3, alignSelf: 'stretch', borderRadius: 2, marginLeft: 2 },
  content:      { flex: 1, gap: 2 },
  nowBadge:     { fontSize: 9, color: Colors.gold, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: FontWeight.bold },
  label:        { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, lineHeight: 18 },
  labelNow:     { color: Colors.textPrimary, fontWeight: FontWeight.semibold },
  labelDone:    { textDecorationLine: 'line-through', color: Colors.textMuted },
  labelDim:     { color: Colors.textMuted },
  right:        { alignItems: 'center', gap: 4 },
  dur:          { fontSize: FontSize.xs, color: Colors.textMuted },
});

// ─── Trial Badge ──────────────────────────────────────────────────────────────

function TrialBadge({ trialStartDate }: { trialStartDate: string | null }) {
  const { t } = useTranslation();
  const daysLeft = getTrialDaysLeft(trialStartDate);
  const isUrgent = daysLeft <= 1;

  let label: string;
  if (daysLeft === 0)      label = t('home.trial_expires_today');
  else if (daysLeft === 1) label = t('home.trial_day_left');
  else                     label = `${t('home.trial_badge')} · ${t('home.trial_days_left', { count: daysLeft })}`;

  return (
    <TouchableOpacity
      onPress={() => router.push('/upgrade' as any)}
      style={[tb.wrap, isUrgent && tb.wrapUrgent]}
      activeOpacity={0.8}
    >
      <Ionicons name="time-outline" size={11} color={isUrgent ? Colors.warning : Colors.textMuted} />
      <Text style={[tb.text, isUrgent && tb.textUrgent]}>{label}</Text>
    </TouchableOpacity>
  );
}

const tb = StyleSheet.create({
  wrap:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  wrapUrgent:  { borderColor: Colors.warning + '55', backgroundColor: Colors.warning + '14' },
  text:        { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.medium, letterSpacing: 0.3 },
  textUrgent:  { color: Colors.warning },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { t } = useTranslation();
  const dir = useDirection();

  // ── All store state + derived values via consolidated hook ────────────────
  const {
    profile, dailyReviews, goals, controlPlan, activeFocus, taskSkipCount,
    skippedPlanItemIds, dayStreak, trialStartDate, isPro, todayScheduleEntry,
    focusSessions, dayMode, activeDrift, dailyDecision,
    setTodayScheduleEntry, endRecoveryEarly, recordInteraction,
    startFocus, endFocus, toggleControlPlanItem, skipNowAction, skipItem,
    generateControlPlanAction, completeHabitToday, restartDay,
    dismissActiveDrift, applyRecoveryAction, extendPlanItem,
    today, nowMins, subState, isProUser,
    planItems, enrichedItems, progress, todayFocusMins,
    pressure, pressureGrade, isBuilding, nextBestAction, isAiPlan,
    morningLaunch, nightShutdown, topPrediction,
    outcomeTrend, streakData, reentryMessage, commitmentSignal,
    lateStartItem, effectiveItem, isCurrentConstraint, nextItem, allSkipped,
    needsScheduleEntry,
  } = useHomeState();

  // ── Reentry analytics — fire once per session after a 2+ day gap ─────────
  const reentryFiredRef = React.useRef(false);
  useEffect(() => {
    if (reentryFiredRef.current) return;
    reentryFiredRef.current = true;
    if (streakData.missedDays >= 2) {
      track('reentry_after_gap', { missed_days: streakData.missedDays });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pull-to-refresh ───────────────────────────────────────────────────────
  const session          = useAppStore((s) => s.session);
  const isGuestMode      = useAppStore((s) => s.isGuestMode);
  const isSyncing        = useAppStore((s) => s.isSyncing);
  const hydrateFromCloud = useAppStore((s) => s.hydrateFromCloud);

  const handleRefresh = React.useCallback(() => {
    if (session?.user?.id && !isGuestMode) {
      hydrateFromCloud(session.user.id).catch(console.warn);
    }
  }, [session?.user?.id, isGuestMode, hydrateFromCloud]);

  // ── Notification permission soft prompt ──────────────────────────────────
  const notifPerm = useNotifPermission();
  const [notifPromptDismissed, setNotifPromptDismissed] = React.useState(false);
  const showNotifPrompt = notifPerm.checked && !notifPerm.granted && !notifPromptDismissed;

  // ── Local UI state ────────────────────────────────────────────────────────
  const [reentryDismissed, setReentryDismissed] = React.useState(false);
  const [dismissedRisk, setDismissedRisk]       = React.useState<string | null>(null);
  const [proCardDismissed, setProCardDismissed] = React.useState(false);

  // Flash feedback
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const flashAnim  = useRef(new Animated.Value(0)).current;
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Undo toast — shown 3s after task completion
  const [undoItem, setUndoItem] = useState<{ id: string; title: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoAnim  = useRef(new Animated.Value(0)).current;

  // Goal-group celebration — fires when all plan items for a goal are done
  const [goalCelebTitle, setGoalCelebTitle] = useState<string | null>(null);
  const celebTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebAnim = useRef(new Animated.Value(0)).current;

  const showGoalCelebration = (goalTitle: string) => {
    if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
    setGoalCelebTitle(goalTitle);
    celebAnim.setValue(0);
    Animated.spring(celebAnim, { toValue: 1, friction: 7, useNativeDriver: true }).start();
    celebTimerRef.current = setTimeout(() => {
      Animated.timing(celebAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        () => setGoalCelebTitle(null),
      );
    }, 2500);
  };

  const showUndoToast = (id: string, title: string) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoItem({ id, title });
    undoAnim.setValue(0);
    Animated.timing(undoAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    undoTimer.current = setTimeout(() => {
      Animated.timing(undoAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(
        () => setUndoItem(null),
      );
    }, 3000);
  };

  const handleUndo = () => {
    if (!undoItem) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    toggleControlPlanItem(undoItem.id);
    setUndoItem(null);
  };

  // activeWarning: filter topPrediction by locally-dismissed risk type
  const activeWarning = topPrediction && topPrediction.riskType !== dismissedRisk
    ? topPrediction
    : null;

  // Greeting
  const hour = new Date().getHours();
  const greetingKey =
    hour < 12 ? 'home.greeting_morning' :
    hour < 17 ? 'home.greeting_afternoon' :
                'home.greeting_evening';
  const firstName   = profile?.name?.split(' ')[0] ?? null;
  const greetingText = `${t(greetingKey)}${firstName ? `, ${firstName}` : ''}`;

  // D8: starting confirmation
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = () => {
    const item = effectiveItem;
    if (!item || activeFocus || isStarting) return;

    // Guard: item's time slot is already over — don't create a 0-min session
    if (nowMins >= timeToMins(item.endTime)) {
      showFlash(t('home.flash_task_done')); // reuse existing "done" flash as stand-in
      return;
    }

    setIsStarting(true);
    recordInteraction();
    const goal = goals.find(g => g.id === item.goalId);
    setTimeout(() => {
      startFocus({
        id:              generateId(),
        goalId:          item.goalId,
        goalTitle:       goal?.title ?? item.title,
        durationMinutes: Math.max(1, timeToMins(item.endTime) - nowMins),
        startedAt:       new Date().toISOString(),
      });
      setIsStarting(false);
    }, 180);
  };

  // ── Recovery acknowledgement: complete the recovery block (silent path)
  // endRecoveryEarly marks the item completed WITHOUT affecting skip counts,
  // pressure, task streak, or totalCompletedTasks.
  const handleAcknowledgeRecovery = () => {
    if (!effectiveItem) return;
    endRecoveryEarly(effectiveItem.id);
    recordInteraction();
  };

  // ── Schedule prompt submission: store entry + regenerate plan immediately
  const handleScheduleEntrySubmit = (entry: DailyScheduleEntry) => {
    setTodayScheduleEntry(entry);
    generateControlPlanAction(today);
  };

  const handleEndFocus = () => {
    if (!activeFocus) return;
    endFocus();
    const matchingItem = planItems.find(
      i => i.goalId === activeFocus.goalId && !i.completed && (i.type === 'goal' || i.type === 'skill'),
    );
    if (matchingItem) toggleControlPlanItem(matchingItem.id);
  };

  const showFlash = (msg: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashMsg(msg);
    flashAnim.setValue(0);
    Animated.timing(flashAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    flashTimer.current = setTimeout(() => {
      Animated.timing(flashAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start(
        () => setFlashMsg(null),
      );
    }, 1500);
  };

  const handleToggleItem = (id: string) => {
    recordInteraction();
    const found = enrichedItems.find(i => i.id === id);
    if (!found || found.completed) { toggleControlPlanItem(id); return; }
    const isLastTask = progress.total > 0 && progress.completed + 1 >= progress.total;
    Haptics.notificationAsync(
      isLastTask
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
    toggleControlPlanItem(id);
    if (found.source === 'habit' && found.goalId) {
      completeHabitToday(found.goalId, today);
    }
    showFlash(isLastTask ? t('home.progress_ring_celebration') : t('home.flash_task_done'));
    showUndoToast(id, found.title);

    // Detect goal-group completion: all goal-type items for the same goalId now done
    if (found.goalId && (found.type === 'goal' || found.type === 'skill')) {
      const siblingItems = enrichedItems.filter(
        i => i.goalId === found.goalId && (i.type === 'goal' || i.type === 'skill'),
      );
      const allSiblingsDone = siblingItems.every(i => i.id === id || i.completed);
      if (allSiblingsDone && siblingItems.length >= 1) {
        const matchedGoal = goals.find(g => g.id === found.goalId);
        if (matchedGoal) {
          showGoalCelebration(matchedGoal.title);
        }
      }
    }
  };

  const handleSkip = () => {
    recordInteraction();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!nextBestAction && lateStartItem) {
      skipItem(lateStartItem.id);
    } else {
      skipNowAction();
    }
    showFlash(t(`home.flash_skip_${Math.min(pressureGrade, 3)}` as any));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={handleRefresh}
            tintColor={Colors.gold}
            colors={[Colors.gold]}
          />
        }
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={[s.header, { flexDirection: dir.rowDir }]}>
          <View style={s.headerLeft}>
            <Text style={s.greeting}>{greetingText}</Text>
            <Text style={s.date}>{formatDate(today)}</Text>
          </View>
          <View style={s.headerRight}>
            {subState === 'trial_active' && (
              <TrialBadge trialStartDate={trialStartDate} />
            )}
            {streakData.currentStreak > 0 || streakData.streakStatus !== 'new' ? (
              <StreakBadge
                streak={streakData.currentStreak}
                status={streakData.streakStatus}
                label={streakData.streakLabel}
              />
            ) : null}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/profile' as any)}
              activeOpacity={0.8}
            >
              <View style={s.avatar}>
                {profile?.name
                  ? <Text style={s.avatarLetter}>{profile.name[0].toUpperCase()}</Text>
                  : <Ionicons name="person" size={16} color={Colors.gold} />
                }
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Day Mode strip — always visible when plan exists ───────────── */}
        {!isBuilding && !needsScheduleEntry && (
          <DayModeStrip mode={dayMode} />
        )}

        {/* ── Stats strip — hidden when schedule prompt is active ─────────── */}
        {!isBuilding && !needsScheduleEntry && progress.total > 0 && (
          <StatStrip
            completed={progress.completed}
            total={progress.total}
            focusMins={todayFocusMins}
            pct={progress.pct}
          />
        )}

        {/* ── Notification permission soft prompt ──────────────────────────── */}
        {showNotifPrompt && (
          <View style={s.notifPromptCard}>
            <View style={s.notifPromptLeft}>
              <Ionicons name="notifications-off-outline" size={18} color={Colors.warning} />
              <View style={s.notifPromptText}>
                <Text style={s.notifPromptTitle}>Notifications are off</Text>
                <Text style={s.notifPromptSub}>Enable to get task nudges and reminders</Text>
              </View>
            </View>
            <View style={s.notifPromptActions}>
              <TouchableOpacity
                onPress={() => { notifPerm.request(); setNotifPromptDismissed(true); }}
                style={s.notifPromptBtn}
                activeOpacity={0.8}
              >
                <Text style={s.notifPromptBtnText}>Enable</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setNotifPromptDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Re-entry banner — shown when user missed ≥ 1 day ────────────────
             Soft, dismissible. No guilt. Just forward motion.               */}
        {reentryMessage && !reentryDismissed && !needsScheduleEntry && (
          <ReentryBanner
            message={reentryMessage}
            missedDays={streakData.missedDays}
            onDismiss={() => setReentryDismissed(true)}
          />
        )}

        {/* ── Morning Launch Card — day-start orientation ──────────────────────
             When a predictive warning is also active, it is absorbed inline
             (warningLine prop) so both surfaces read as one, not two.        */}
        {morningLaunch && !needsScheduleEntry && (
          <MorningLaunchCard
            data={morningLaunch}
            warningLine={activeWarning ? activeWarning.actionHint : null}
          />
        )}

        {/* ── Predictive Warning Card — only shown outside of morning window ──
             In the morning, the warning is folded into MorningLaunchCard.    */}
        {activeWarning && !morningLaunch && !needsScheduleEntry && !activeFocus && (
          <PredictiveWarningCard
            prediction={activeWarning}
            onDismiss={() => setDismissedRisk(activeWarning.riskType)}
          />
        )}

        {/* ── Contextual Pro nudge — shown once per session for free users ──── */}
        {activeWarning && !isProUser && !proCardDismissed && !needsScheduleEntry && !activeFocus && (
          <ProContextCard
            feature="predictive_insights"
            onUpgrade={() => router.push('/upgrade' as any)}
            onDismiss={() => setProCardDismissed(true)}
          />
        )}

        {/* ── DOMINANT COMMAND — schedule prompt OR now action ─────────────── */}
        {needsScheduleEntry ? (
          <>
            {/* daily_input users: collect schedule before generating plan */}
            <SchedulePromptCard
              userType={profile!.userType as 'worker' | 'student' | 'worker_student'}
              onSubmit={handleScheduleEntrySubmit}
            />
            {/* Lightweight shell — app feels "waiting", not "empty" */}
            <View style={s.awaitingShell}>
              <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
              <Text style={s.awaitingText}>{t('home.schedule_prompt_awaiting')}</Text>
            </View>
          </>
        ) : (
          <>
            <NowAction
              item={effectiveItem}
              activeFocus={activeFocus}
              pressure={pressure}
              pressureGrade={pressureGrade}
              isBuilding={isBuilding}
              isRecovery={!!effectiveItem && isRecoveryBlock(effectiveItem)}
              isConstraint={isCurrentConstraint}
              nowMins={nowMins}
              nextItem={nextItem}
              total={progress.total}
              isAiPlan={isAiPlan}
              isLateStart={!nextBestAction && !!lateStartItem}
              isStarting={isStarting}
              allSkipped={allSkipped}
              commitmentText={commitmentSignal}
              onStart={handleStart}
              onEnd={handleEndFocus}
              onSkip={handleSkip}
              onGenerate={() => generateControlPlanAction(today)}
              onRestart={restartDay}
              onAcknowledgeRecovery={handleAcknowledgeRecovery}
              onExtend={() => effectiveItem && extendPlanItem(effectiveItem.id, 10)}
            />

            {/* ── Why-This-Now explanation — shown when a task is active ───── */}
            {effectiveItem && !isRecoveryBlock(effectiveItem) && !isCurrentConstraint && !allSkipped && (
              <WhyThisNowCard
                item={effectiveItem}
                goals={goals}
                dailyDecision={dailyDecision}
                pressure={pressureInfo}
              />
            )}

            {/* ── Drift intervention — shown when drifting / critical ────────
                Hide during active focus to avoid disruption.
                Hide during recovery block (user is already resting).
                Hide when drift was dismissed by user.               */}
            {activeDrift && !activeDrift.dismissed && !activeFocus && !isCurrentConstraint && (
              <DriftInterventionCard
                drift={activeDrift}
                onDismiss={() => {
                  dismissActiveDrift();
                  recordInteraction();
                }}
                onRecover={(mode) => {
                  applyRecoveryAction(mode, nowMins);
                  recordInteraction();
                  showFlash(t('home.recovery_applied'));
                }}
              />
            )}

            {/* ── Night Shutdown Card — wind-down ritual in the evening ──────── */}
            {nightShutdown && !activeFocus && (
              <NightShutdownCard
                data={nightShutdown}
                onReview={() => router.push('/review' as any)}
              />
            )}
          </>
        )}

        {/* Flash feedback pill */}
        {flashMsg !== null && (
          <Animated.View style={[s.flashPill, { opacity: flashAnim }]}>
            <Text style={s.flashText}>{flashMsg}</Text>
          </Animated.View>
        )}

        {/* ── Secondary layers — hidden when schedule prompt is active ─────── */}
        {!needsScheduleEntry && (
          <View style={activeFocus ? s.dimmed : undefined}>
            {/* Full-day timeline — always visible */}
            {!isBuilding && enrichedItems.length > 0 && (
              <TodayTimeline
                items={enrichedItems}
                nowMins={nowMins}
                onToggle={handleToggleItem}
              />
            )}

            {/* Compact task stack */}
            {!isBuilding && (
              <TodayTasks
                items={enrichedItems}
                nextBestActionId={nextBestAction?.id ?? null}
                onToggle={handleToggleItem}
              />
            )}

            {/* Weekly Review link */}
            {!isBuilding && (
              <TouchableOpacity
                onPress={() => router.push('/weekly-review' as any)}
                style={s.weeklyLink}
                activeOpacity={0.7}
              >
                <Text style={s.weeklyLinkText}>Weekly Review</Text>
                <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
              </TouchableOpacity>
            )}

            {/* ── Outcome Dashboard — shown when user has ≥ 3 reviews ─────────
                 Answers "Is LifeOS actually helping me?" at a glance.
                 Free: 7-day window. Pro: 30-day window.                     */}
            {dailyReviews.length >= 3 && (
              <OutcomeDashboard
                trend={outcomeTrend}
                isPro={isProUser}
                onUpgrade={() => router.push('/upgrade' as any)}
              />
            )}
          </View>
        )}
      </ScrollView>

      {/* Undo toast — slides up for 3 seconds after task completion */}
      {undoItem && (
        <Animated.View style={[s.undoToast, { opacity: undoAnim, transform: [{ translateY: undoAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Text style={s.undoToastText} numberOfLines={1}>
            ✓ {undoItem.title}
          </Text>
          <TouchableOpacity onPress={handleUndo} style={s.undoBtn} activeOpacity={0.8}>
            <Text style={s.undoBtnText}>Undo</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Goal-group celebration — auto-dismisses after 2.5s */}
      {goalCelebTitle && (
        <Modal transparent animationType="none" visible={!!goalCelebTitle} onRequestClose={() => setGoalCelebTitle(null)}>
          <TouchableOpacity
            style={s.celebOverlay}
            activeOpacity={1}
            onPress={() => {
              if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
              setGoalCelebTitle(null);
            }}
          >
            <Animated.View style={[s.celebCard, {
              opacity: celebAnim,
              transform: [{ scale: celebAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
            }]}>
              <Text style={s.celebIcon}>🏆</Text>
              <Text style={s.celebTitle}>Goal done!</Text>
              <Text style={s.celebGoalName} numberOfLines={2}>{goalCelebTitle}</Text>
              <Text style={s.celebSub}>All tasks for this goal are complete today</Text>
            </Animated.View>
          </TouchableOpacity>
        </Modal>
      )}

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },

  // Header
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flex: 1, gap: 3 },
  headerRight:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  greeting:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -0.3 },
  date:       { fontSize: FontSize.xs, color: Colors.textMuted, letterSpacing: 0.6, fontWeight: FontWeight.medium },

  // Avatar
  avatar:       { width: 38, height: 38, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.goldDim },
  avatarLetter: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.gold },

  // Streak
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.goldMuted, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.goldDim },
  streakEmoji: { fontSize: 13 },
  streakText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gold },

  // Flash
  flashPill: { alignSelf: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  flashText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },

  // Undo toast
  undoToast: { position: 'absolute', bottom: 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceHigh, borderRadius: Radius.lg, paddingVertical: 12, paddingLeft: 16, paddingRight: 8, borderWidth: 1, borderColor: Colors.borderLight, gap: Spacing.sm },
  undoToastText: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  undoBtn: { backgroundColor: Colors.gold, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 6 },
  undoBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textInverse },

  // Goal-group celebration
  celebOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  celebCard: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl,
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.goldDim,
    ...Shadow.gold,
  },
  celebIcon:     { fontSize: 48, lineHeight: 56 },
  celebTitle:    { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.gold },
  celebGoalName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center', maxWidth: 240 },
  celebSub:      { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },

  // Dimmed secondary layers during focus
  dimmed: { opacity: 0.35, gap: Spacing.lg },

  // Notification permission prompt
  notifPromptCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)', gap: Spacing.sm,
  },
  notifPromptLeft:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  notifPromptText:    { flex: 1, gap: 2 },
  notifPromptTitle:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  notifPromptSub:     { fontSize: FontSize.xs, color: Colors.textMuted },
  notifPromptActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  notifPromptBtn:     { backgroundColor: Colors.warning + '22', borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.warning + '44' },
  notifPromptBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.warning },

  // Awaiting shell — shown below schedule prompt
  awaitingShell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl, opacity: 0.5 },
  awaitingText:  { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', flex: 1 },

  // Weekly Review link
  weeklyLink:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm },
  weeklyLinkText: { fontSize: FontSize.sm, color: Colors.textMuted },
});
