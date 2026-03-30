/**
 * focus.tsx — Immersive Focus Screen
 *
 * Two states:
 *   Active session  — full-screen timer; task context; Done + Complete action
 *   No session      — today's session history; CTA back to plan
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDirection } from '../../src/hooks/useDirection';
import { useAppStore } from '../../src/store/useAppStore';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../src/constants/theme';
import { getTodayDate } from '../../src/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSecs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FocusTab() {
  const { t } = useTranslation();
  const dir = useDirection();

  const activeFocus           = useAppStore((s) => s.activeFocus);
  const focusSessions         = useAppStore((s) => s.focusSessions);
  const goals                 = useAppStore((s) => s.goals);
  const controlPlan           = useAppStore((s) => s.controlPlan);
  const endFocus              = useAppStore((s) => s.endFocus);
  const toggleControlPlanItem = useAppStore((s) => s.toggleControlPlanItem);

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  const [elapsedSecs, setElapsedSecs] = useState(0);
  useEffect(() => {
    if (!activeFocus) { setElapsedSecs(0); return; }
    const update = () =>
      setElapsedSecs(
        Math.floor((Date.now() - new Date(activeFocus.startedAt).getTime()) / 1000),
      );
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [activeFocus?.startedAt]);

  // Breathing pulse while active
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!activeFocus) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [activeFocus?.id]);

  // ── Today's session history ───────────────────────────────────────────────
  const today = getTodayDate();
  const todaySessions = focusSessions.filter(
    (session) => session.start.startsWith(today) && !!session.end,
  );
  const todayTotalMins = todaySessions.reduce(
    (sum, session) => sum + (session.durationMinutes ?? 0),
    0,
  );

  // ── End handler — marks matching plan item complete ───────────────────────
  const handleEnd = () => {
    if (!activeFocus) return;
    endFocus();
    const planItems = controlPlan?.plan.items ?? [];
    const match = planItems.find(
      (i) =>
        i.goalId === activeFocus.goalId &&
        !i.completed &&
        (i.type === 'goal' || i.type === 'skill'),
    );
    if (match) toggleControlPlanItem(match.id);
  };

  // ── Active session view ───────────────────────────────────────────────────
  if (activeFocus) {
    const totalSecs = activeFocus.durationMinutes * 60;
    const pct = Math.min(100, Math.round((elapsedSecs / Math.max(1, totalSecs)) * 100));
    const goal = goals.find((g) => g.id === activeFocus.goalId);

    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.activeRoot}>

          {/* Back button */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.backBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-down" size={22} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Live badge */}
          <View style={[s.liveBadge, { flexDirection: dir.rowDir }]}>
            <View style={s.liveDot} />
            <Text style={s.liveBadgeText}>{t('focus.active_badge')}</Text>
          </View>

          {/* Goal context */}
          {goal && (
            <Text style={s.goalLabel}>{goal.title}</Text>
          )}

          {/* Task / session title */}
          <Text style={s.taskName} numberOfLines={3}>
            {activeFocus.goalTitle}
          </Text>

          {/* Animated timer */}
          <Animated.View style={[s.timerBlock, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={s.timer}>{fmtSecs(elapsedSecs)}</Text>
            <Text style={s.timerSub}>
              {t('focus.active_of')} {fmtMins(activeFocus.durationMinutes)}
            </Text>
          </Animated.View>

          {/* Progress bar */}
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct}%` as any }]} />
          </View>
          <Text style={s.progressPct}>{pct}%</Text>

          {/* Done CTA */}
          <TouchableOpacity
            onPress={handleEnd}
            style={[s.doneBtn, { flexDirection: dir.rowDir }]}
            activeOpacity={0.88}
          >
            <Ionicons name="checkmark" size={20} color={Colors.textInverse} />
            <Text style={s.doneBtnText}>{t('focus.active_done_btn')}</Text>
          </TouchableOpacity>

          {/* Back to plan link */}
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/home' as any)}
            style={s.goHomeLink}
            activeOpacity={0.6}
          >
            <Text style={s.goHomeLinkText}>{t('focus.active_back')}</Text>
          </TouchableOpacity>

        </View>
      </SafeAreaView>
    );
  }

  // ── No active session — history view ─────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.historyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>{t('focus.sessions_title')}</Text>
          {todayTotalMins > 0 && (
            <Text style={s.headerSub}>{fmtMins(todayTotalMins)} focused today</Text>
          )}
        </View>

        {/* Daily summary card */}
        {todayTotalMins > 0 && (
          <View style={[s.summaryCard, { flexDirection: dir.rowDir }]}>
            <View style={s.summaryIcon}>
              <Ionicons name="flame" size={20} color={Colors.gold} />
            </View>
            <View style={s.summaryBody}>
              <Text style={s.summaryVal}>{fmtMins(todayTotalMins)}</Text>
              <Text style={s.summarySub}>
                {t(
                  todaySessions.length === 1
                    ? 'focus.sessions_today'
                    : 'focus.sessions_today_plural',
                  { count: todaySessions.length },
                )}
              </Text>
            </View>
          </View>
        )}

        {/* Session list */}
        {todaySessions.length > 0 ? (
          <View style={s.sessionList}>
            {[...todaySessions].reverse().map((session) => {
              const goal = goals.find((g) => g.id === session.goalId);
              const startTime = new Date(session.start).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <View key={session.id} style={[s.sessionRow, { flexDirection: dir.rowDir }]}>
                  <View style={s.sessionAccent} />
                  <View style={s.sessionInfo}>
                    <Text style={s.sessionGoal} numberOfLines={1}>
                      {goal?.title ?? t('focus.default_title')}
                    </Text>
                    <Text style={s.sessionMeta}>
                      {startTime} · {fmtMins(session.durationMinutes ?? 0)}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                </View>
              );
            })}
          </View>
        ) : (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons name="timer-outline" size={28} color={Colors.textMuted} />
            </View>
            <Text style={s.emptyTitle}>{t('focus.no_history')}</Text>
            <Text style={s.emptySub}>{t('focus.empty_sub')}</Text>
          </View>
        )}

        {/* CTA back to plan */}
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/home' as any)}
          style={[s.ctaBtn, { flexDirection: dir.rowDir }]}
          activeOpacity={0.85}
        >
          <Text style={s.ctaBtnText}>{t('focus.cta')}</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.textInverse} />
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // ── Active session layout ──────────────────────────────────────────────────
  activeRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  backBtn: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.lg,
    padding: Spacing.xs,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.successMuted,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.success + '44',
    marginBottom: Spacing.sm,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  liveBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.success,
    letterSpacing: 2,
  },
  goalLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  taskName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 32,
    marginBottom: Spacing.sm,
  },
  timerBlock: {
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  timer: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
    letterSpacing: -3,
    ...Shadow.gold,
  },
  timerSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
  },
  progressPct: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    alignSelf: 'flex-end',
    marginTop: -Spacing.xs,
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingVertical: 18,
    width: '100%',
    marginTop: Spacing.lg,
    ...Shadow.gold,
  },
  doneBtnText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
  goHomeLink: {
    paddingVertical: Spacing.sm,
  },
  goHomeLinkText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // ── History / no-session layout ────────────────────────────────────────────
  historyContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
  },
  header:      { gap: 4, paddingTop: Spacing.md },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -0.5 },
  headerSub:   { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    padding: Spacing.lg,
  },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.goldDim,
  },
  summaryBody: { gap: 2 },
  summaryVal: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
    letterSpacing: -0.5,
  },
  summarySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  sessionList: { gap: Spacing.xs },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sessionAccent: {
    width: 3,
    alignSelf: 'stretch',
    minHeight: 32,
    backgroundColor: Colors.success,
    borderRadius: Radius.full,
  },
  sessionInfo: { flex: 1, gap: 2 },
  sessionGoal: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
  },
  sessionMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  emptyWrap: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xxl,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },

  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    ...Shadow.gold,
  },
  ctaBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
});
