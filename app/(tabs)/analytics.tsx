import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Text as SvgText, Line, G, Polyline } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import {
  computeWeeklyFocusStats,
  computeGoalFocusBreakdown,
  computeConsistencyStats,
} from '../../src/ai/analyticsEngine';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const CATEGORY_COLOR: Record<string, string> = {
  study: '#6C8EBF', skill: Colors.gold, health: '#4ADE80',
  life: '#F472B6', career: '#A78BFA', other: Colors.textMuted,
};

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Hero stat ────────────────────────────────────────────────────────────────

function HeroStat({ value, label, change }: { value: string; label: string; change: number }) {
  const positive = change >= 0;
  return (
    <View style={heroS.wrap}>
      <Text style={heroS.value}>{value}</Text>
      <Text style={heroS.label}>{label}</Text>
      <View style={[heroS.badge, { backgroundColor: positive ? '#4ADE8022' : '#F8717122' }]}>
        <Ionicons
          name={positive ? 'trending-up' : 'trending-down'}
          size={12}
          color={positive ? '#4ADE80' : '#F87171'}
        />
        <Text style={[heroS.change, { color: positive ? '#4ADE80' : '#F87171' }]}>
          {positive ? '+' : ''}{change}% vs last week
        </Text>
      </View>
    </View>
  );
}

const heroS = StyleSheet.create({
  wrap:   { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.xs },
  value:  { fontSize: 52, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -2 },
  label:  { fontSize: FontSize.sm, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  badge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, marginTop: Spacing.xs },
  change: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
});

// ─── Bar chart ────────────────────────────────────────────────────────────────

const CHART_H   = 140;
const CHART_PAD = { top: 24, bottom: 30, left: 8, right: 8 };

function WeekBarChart({ days }: { days: Array<{ dayLabel: string; totalMins: number }> }) {
  const maxMins = Math.max(...days.map((d) => d.totalMins), 60);
  const barArea = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

  const trendPoints = days.map((day, i) => {
    const slotW = (280 - CHART_PAD.left - CHART_PAD.right) / 7;
    const barW  = slotW * 0.55;
    const cx    = CHART_PAD.left + i * slotW + slotW / 2;
    const barH  = Math.max(day.totalMins > 0 ? 3 : 0, (day.totalMins / maxMins) * barArea);
    const cy    = CHART_H - CHART_PAD.bottom - barH;
    return `${cx},${cy}`;
  }).join(' ');

  return (
    <View style={chartS.wrap}>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 280 ${CHART_H}`}>
        <Line
          x1={CHART_PAD.left} y1={CHART_H - CHART_PAD.bottom}
          x2={280 - CHART_PAD.right} y2={CHART_H - CHART_PAD.bottom}
          stroke={Colors.border} strokeWidth={1}
        />
        {days.map((day, i) => {
          const slotW = (280 - CHART_PAD.left - CHART_PAD.right) / 7;
          const barW  = slotW * 0.55;
          const x     = CHART_PAD.left + i * slotW + (slotW - barW) / 2;
          const barH  = Math.max(day.totalMins > 0 ? 3 : 0, (day.totalMins / maxMins) * barArea);
          const y     = CHART_H - CHART_PAD.bottom - barH;
          const isToday = i === days.length - 1;
          const color   = day.totalMins === 0 ? Colors.surfaceHigh : isToday ? Colors.gold : Colors.goldDim;
          return (
            <G key={i}>
              <Rect x={x} y={y} width={barW} height={barH} rx={4} fill={color} />
              {day.totalMins > 0 && (
                <SvgText x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={7} fill={isToday ? Colors.gold : Colors.textMuted}>
                  {fmtMins(day.totalMins)}
                </SvgText>
              )}
              <SvgText
                x={x + barW / 2} y={CHART_H - CHART_PAD.bottom + 14}
                textAnchor="middle" fontSize={9}
                fill={isToday ? Colors.gold : Colors.textSecondary}
                fontWeight={isToday ? 'bold' : 'normal'}
              >
                {day.dayLabel}
              </SvgText>
            </G>
          );
        })}
        {/* Trend line */}
        <Polyline
          points={trendPoints}
          fill="none"
          stroke={Colors.gold + '55'}
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
      </Svg>
    </View>
  );
}

const chartS = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
});

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color, sub }: {
  label: string; value: string; icon: keyof typeof Ionicons.glyphMap; color: string; sub?: string;
}) {
  return (
    <View style={[scS.card, { borderColor: color + '44' }]}>
      <View style={[scS.iconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[scS.value, { color }]}>{value}</Text>
      <Text style={scS.label}>{label}</Text>
      {sub ? <Text style={scS.sub}>{sub}</Text> : null}
    </View>
  );
}

const scS = StyleSheet.create({
  card:    { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, alignItems: 'center', gap: 6 },
  iconWrap:{ width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  value:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  label:   { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  sub:     { fontSize: FontSize.xs - 1, color: Colors.textMuted },
});

// ─── Goal Focus Bars ──────────────────────────────────────────────────────────

function GoalFocusBars({ breakdown }: { breakdown: Array<{ title: string; category: string; totalMins: number; pct: number }> }) {
  if (!breakdown.length) return (
    <View style={gfS.empty}>
      <Text style={gfS.emptyText}>No goal focus sessions this week</Text>
    </View>
  );
  return (
    <View style={gfS.wrap}>
      {breakdown.map((item, i) => {
        const color = CATEGORY_COLOR[item.category] ?? Colors.gold;
        return (
          <View key={i} style={gfS.row}>
            <Text style={gfS.label} numberOfLines={1}>{item.title}</Text>
            <View style={gfS.track}>
              <View style={[gfS.fill, { width: `${Math.round(item.pct * 100)}%` as any, backgroundColor: color }]} />
            </View>
            <Text style={[gfS.mins, { color }]}>{fmtMins(item.totalMins)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const gfS = StyleSheet.create({
  wrap:      { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  row:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label:     { width: 100, fontSize: FontSize.xs, color: Colors.textSecondary },
  track:     { flex: 1, height: 6, backgroundColor: Colors.surfaceHigh, borderRadius: 3, overflow: 'hidden' },
  fill:      { height: '100%', borderRadius: 3 },
  mins:      { width: 40, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textAlign: 'right' },
  empty:     { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, alignItems: 'center' },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
});

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={secS.wrap}>
      <Text style={secS.title}>{title}</Text>
      {children}
    </View>
  );
}
const secS = StyleSheet.create({
  wrap:  { gap: Spacing.sm },
  title: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: FontWeight.semibold },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const focusSessions = useAppStore((s) => s.focusSessions);
  const goals         = useAppStore((s) => s.goals);
  const tasks         = useAppStore((s) => s.tasks);

  const weekStats    = useMemo(() => computeWeeklyFocusStats(focusSessions),     [focusSessions]);
  const breakdown    = useMemo(() => computeGoalFocusBreakdown(focusSessions, goals), [focusSessions, goals]);
  const reflections  = useAppStore((s) => s.reflections);
  const consistency  = useMemo(() => computeConsistencyStats(focusSessions, reflections), [focusSessions, reflections]);

  const totalMinsThisWeek = weekStats.totalMins;

  const now = new Date();
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay());
  startOfThisWeek.setHours(0, 0, 0, 0);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  const sessions = focusSessions.filter((s) => new Date(s.start) >= startOfThisWeek);
  const lastWeekSessions = focusSessions.filter((s) => {
    const d = new Date(s.start);
    return d >= startOfLastWeek && d < startOfThisWeek;
  });

  const prevWeekMins = lastWeekSessions.reduce((acc, s) => acc + (s.durationMinutes ?? 0), 0);

  const completedThisWeek = tasks.filter((t) => {
    if (!t.completed) return false;
    const d = new Date(t.date);
    return d >= startOfThisWeek;
  }).length;

  const focusScore = Math.min(100, Math.round((totalMinsThisWeek / 420) * 100));

  const changePct = prevWeekMins === 0
    ? (totalMinsThisWeek > 0 ? 100 : 0)
    : Math.round(((totalMinsThisWeek - prevWeekMins) / prevWeekMins) * 100);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <Text style={s.screenTitle}>Progress</Text>

        {/* ── Hero stat ───────────────────────────────────────────────────── */}
        <View style={s.heroCard}>
          <HeroStat
            value={fmtMins(totalMinsThisWeek)}
            label="Study Time This Week"
            change={changePct}
          />
        </View>

        {/* ── Week bar chart ───────────────────────────────────────────────── */}
        <Section title="Daily Focus">
          <WeekBarChart days={weekStats.days} />
        </Section>

        {/* ── Stat cards ───────────────────────────────────────────────────── */}
        <View style={s.statRow}>
          <StatCard
            label="Focus Score"
            value={`${focusScore}`}
            icon="flash"
            color={Colors.gold}
            sub="% sessions complete"
          />
          <StatCard
            label="Tasks Done"
            value={`${completedThisWeek}`}
            icon="checkmark-circle"
            color="#4ADE80"
            sub="this week"
          />
          <StatCard
            label="Streak"
            value={`${consistency.currentStreak}d`}
            icon="flame"
            color="#FB923C"
            sub="day streak"
          />
        </View>

        {/* ── Goal breakdown ───────────────────────────────────────────────── */}
        <Section title="Time by Goal">
          <GoalFocusBars breakdown={breakdown} />
        </Section>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  content:     { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.xl },
  screenTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  heroCard:    { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  statRow:     { flexDirection: 'row', gap: Spacing.sm },
});
