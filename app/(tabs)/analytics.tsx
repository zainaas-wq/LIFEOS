import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Text as SvgText, Line, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import {
  computeWeeklyFocusStats,
  computeGoalFocusBreakdown,
  computeConsistencyStats,
  computeDistractionStats,
  computeGoalHealthSummary,
  computeProjectVelocity,
  computePeakFocusHour,
} from '../../src/ai/analyticsEngine';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtHour(h: number): string {
  if (h === 0)  return '12 AM';
  if (h < 12)   return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

const CATEGORY_COLOR: Record<string, string> = {
  study: '#6C8EBF', skill: Colors.gold, health: '#4ADE80',
  life: '#F472B6', career: '#A78BFA', other: Colors.textMuted,
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon, children }: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <View style={secStyles.wrap}>
      <View style={secStyles.header}>
        <View style={secStyles.iconWrap}>
          <Ionicons name={icon} size={13} color={Colors.gold} />
        </View>
        <Text style={secStyles.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const secStyles = StyleSheet.create({
  wrap:    { gap: Spacing.sm },
  header:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  iconWrap: {
    width: 22, height: 22, borderRadius: Radius.sm,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: FontWeight.semibold },
});

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <View style={tileS.tile}>
      <Text style={[tileS.value, color && { color }]}>{value}</Text>
      <Text style={tileS.label}>{label}</Text>
      {sub && <Text style={tileS.sub}>{sub}</Text>}
    </View>
  );
}

const tileS = StyleSheet.create({
  tile:  { flex: 1, alignItems: 'center', gap: 3, padding: Spacing.sm },
  value: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  label: { fontSize: FontSize.xs - 1, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
  sub:   { fontSize: FontSize.xs - 1, color: Colors.textMuted, textAlign: 'center' },
});

// ─── Focus Bar Chart (SVG) ────────────────────────────────────────────────────

const CHART_H   = 130;
const CHART_PAD = { top: 20, bottom: 28, left: 8, right: 8 };

function FocusBarChart({ days }: { days: Array<{ dayLabel: string; totalMins: number }> }) {
  const maxMins = Math.max(...days.map((d) => d.totalMins), 60);
  const barArea = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  const today   = new Date().getDay();

  return (
    <View style={chartS.wrap}>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 280 ${CHART_H}`}>
        {/* Baseline */}
        <Line
          x1={CHART_PAD.left} y1={CHART_H - CHART_PAD.bottom}
          x2={280 - CHART_PAD.right} y2={CHART_H - CHART_PAD.bottom}
          stroke={Colors.border} strokeWidth={1}
        />

        {days.map((day, i) => {
          const slotW   = (280 - CHART_PAD.left - CHART_PAD.right) / 7;
          const barW    = slotW * 0.55;
          const x       = CHART_PAD.left + i * slotW + (slotW - barW) / 2;
          const barH    = Math.max(day.totalMins > 0 ? 3 : 0, (day.totalMins / maxMins) * barArea);
          const y       = CHART_H - CHART_PAD.bottom - barH;
          const isToday = i === days.length - 1;
          const color   = day.totalMins === 0 ? Colors.surfaceHigh : isToday ? Colors.gold : Colors.goldDim;
          const labelY  = CHART_H - CHART_PAD.bottom + 14;

          return (
            <G key={i}>
              <Rect x={x} y={y} width={barW} height={barH} rx={3} fill={color} />
              {day.totalMins > 0 && (
                <SvgText
                  x={x + barW / 2} y={y - 4}
                  textAnchor="middle" fontSize={8} fill={isToday ? Colors.gold : Colors.textMuted}
                >
                  {fmtMins(day.totalMins)}
                </SvgText>
              )}
              <SvgText
                x={x + barW / 2} y={labelY}
                textAnchor="middle" fontSize={9}
                fill={isToday ? Colors.gold : Colors.textSecondary}
                fontWeight={isToday ? 'bold' : 'normal'}
              >
                {day.dayLabel}
              </SvgText>
            </G>
          );
        })}
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

// ─── Distraction Bar Chart ────────────────────────────────────────────────────

function DistractionBars({ days }: { days: Array<{ dayLabel: string; count: number }> }) {
  const maxCount = Math.max(...days.map((d) => d.count), 5);
  const barArea  = 60;

  return (
    <View style={chartS.wrap}>
      <Svg width="100%" height={90} viewBox="0 0 280 90">
        <Line x1={8} y1={68} x2={272} y2={68} stroke={Colors.border} strokeWidth={1} />
        {days.map((day, i) => {
          const slotW = 264 / 7;
          const barW  = slotW * 0.5;
          const x     = 8 + i * slotW + (slotW - barW) / 2;
          const barH  = day.count === 0 ? 0 : Math.max(3, (day.count / maxCount) * barArea);
          const y     = 68 - barH;
          const color = day.count === 0 ? Colors.success + '40'
                      : day.count <= 2  ? Colors.gold
                      : day.count <= 5  ? '#FB923C'
                      : '#F87171';
          const isToday = i === days.length - 1;
          return (
            <G key={i}>
              <Rect x={x} y={y} width={barW} height={barH} rx={2} fill={color} />
              {day.count > 0 && (
                <SvgText x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={8} fill={color}>
                  {day.count}
                </SvgText>
              )}
              <SvgText
                x={x + barW / 2} y={82} textAnchor="middle" fontSize={9}
                fill={isToday ? Colors.gold : Colors.textSecondary}
                fontWeight={isToday ? 'bold' : 'normal'}
              >
                {day.dayLabel}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

// ─── Consistency Heatmap ──────────────────────────────────────────────────────

const INTENSITY_COLOR = [
  Colors.surfaceHigh,     // 0 — no activity
  Colors.gold + '33',    // 1 — < 30 min
  Colors.gold + '66',    // 2 — < 60 min
  Colors.gold + 'AA',    // 3 — < 120 min
  Colors.gold,            // 4 — ≥ 120 min
];

function ConsistencyHeatmap({ heatmap }: { heatmap: Array<{ date: string; dayLabel: string; totalMins: number; intensity: 0|1|2|3|4 }> }) {
  // Split into 4 rows of 7
  const rows: typeof heatmap[] = [];
  for (let i = 0; i < 28; i += 7) rows.push(heatmap.slice(i, i + 7));

  return (
    <View style={hmStyles.wrap}>
      {/* Day labels header */}
      <View style={hmStyles.row}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <Text key={i} style={hmStyles.dayLabel}>{d}</Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={hmStyles.row}>
          {row.map((cell) => (
            <View
              key={cell.date}
              style={[hmStyles.cell, { backgroundColor: INTENSITY_COLOR[cell.intensity] }]}
            />
          ))}
        </View>
      ))}
      {/* Legend */}
      <View style={hmStyles.legend}>
        <Text style={hmStyles.legendLabel}>Less</Text>
        {INTENSITY_COLOR.map((c, i) => (
          <View key={i} style={[hmStyles.cell, { backgroundColor: c }]} />
        ))}
        <Text style={hmStyles.legendLabel}>More</Text>
      </View>
    </View>
  );
}

const hmStyles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 4,
  },
  row:      { flexDirection: 'row', gap: 4 },
  cell:     { width: 28, height: 28, borderRadius: 4, flex: 1 },
  dayLabel: { flex: 1, fontSize: FontSize.xs - 1, color: Colors.textMuted, textAlign: 'center' },
  legend:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  legendLabel: { fontSize: FontSize.xs - 1, color: Colors.textMuted },
});

// ─── Goal Focus Bars ──────────────────────────────────────────────────────────

function GoalFocusBars({ breakdown }: { breakdown: Array<{ title: string; category: string; totalMins: number; pct: number }> }) {
  if (!breakdown.length) return (
    <View style={gfStyles.empty}>
      <Text style={gfStyles.emptyText}>No goal focus sessions this week</Text>
    </View>
  );
  return (
    <View style={gfStyles.wrap}>
      {breakdown.map((item, i) => {
        const color = CATEGORY_COLOR[item.category] ?? Colors.gold;
        return (
          <View key={i} style={gfStyles.row}>
            <Text style={gfStyles.label} numberOfLines={1}>{item.title}</Text>
            <View style={gfStyles.track}>
              <View style={[gfStyles.fill, { width: `${Math.round(item.pct * 100)}%` as any, backgroundColor: color }]} />
            </View>
            <Text style={[gfStyles.mins, { color }]}>{fmtMins(item.totalMins)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const gfStyles = StyleSheet.create({
  wrap:      { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  row:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label:     { width: 100, fontSize: FontSize.xs, color: Colors.textSecondary },
  track:     { flex: 1, height: 6, backgroundColor: Colors.surfaceHigh, borderRadius: 3, overflow: 'hidden' },
  fill:      { height: '100%', borderRadius: 3 },
  mins:      { width: 40, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textAlign: 'right' },
  empty:     { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, alignItems: 'center' },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
});

// ─── Goal Health Chips ────────────────────────────────────────────────────────

function GoalHealthChips({ summary }: { summary: { onTrack: number; atRisk: number; critical: number; stalled: number } }) {
  const chips = [
    { label: 'On Track', count: summary.onTrack,  color: Colors.success },
    { label: 'At Risk',  count: summary.atRisk,   color: '#FB923C'      },
    { label: 'Critical', count: summary.critical, color: '#F87171'      },
    { label: 'Stalled',  count: summary.stalled,  color: '#6B7280'      },
  ];
  return (
    <View style={ghStyles.row}>
      {chips.map((c) => (
        <View key={c.label} style={[ghStyles.chip, { borderColor: c.color + '44', backgroundColor: c.color + '12' }]}>
          <Text style={[ghStyles.count, { color: c.color }]}>{c.count}</Text>
          <Text style={ghStyles.label}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

const ghStyles = StyleSheet.create({
  row:   { flexDirection: 'row', gap: Spacing.xs },
  chip:  { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, gap: 3 },
  count: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  label: { fontSize: FontSize.xs - 1, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
});

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function InfoCard({ children }: { children: React.ReactNode }) {
  return <View style={cardS.card}>{children}</View>;
}
function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={cardS.statRow}>{children}</View>;
}
const cardS = StyleSheet.create({
  card:    { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  statRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const focusSessions  = useAppStore((s) => s.focusSessions);
  const distractionLogs = useAppStore((s) => s.distractionLogs);
  const reflections    = useAppStore((s) => s.reflections);
  const goals          = useAppStore((s) => s.goals);
  const goalIntelligence = useAppStore((s) => s.goalIntelligence);
  const projects       = useAppStore((s) => s.projects);
  const milestones     = useAppStore((s) => s.milestones);

  const focusStats  = useMemo(() => computeWeeklyFocusStats(focusSessions),  [focusSessions]);
  const goalBreak   = useMemo(() => computeGoalFocusBreakdown(focusSessions, goals), [focusSessions, goals]);
  const consistency = useMemo(() => computeConsistencyStats(focusSessions, reflections), [focusSessions, reflections]);
  const distrStats  = useMemo(() => computeDistractionStats(distractionLogs), [distractionLogs]);
  const goalHealth  = useMemo(() => computeGoalHealthSummary(goals, goalIntelligence, focusSessions), [goals, goalIntelligence, focusSessions]);
  const projVelocity = useMemo(() => computeProjectVelocity(projects, milestones), [projects, milestones]);
  const peakHour    = useMemo(() => computePeakFocusHour(focusSessions), [focusSessions]);

  const totalGoals = goals.length;
  const hasData = focusSessions.length > 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <Text style={s.screenLabel}>Life Analytics</Text>
          <Text style={s.screenTitle}>Your Patterns</Text>
        </View>

        {/* ── Overview strip ───────────────────────────────────────────────── */}
        <InfoCard>
          <StatRow>
            <StatTile
              label="Focus This Week"
              value={fmtMins(focusStats.totalMins)}
              sub={`${focusStats.totalSessions} sessions`}
              color={focusStats.totalMins >= 300 ? Colors.success : Colors.gold}
            />
            <View style={s.divider} />
            <StatTile
              label="Streak"
              value={`${consistency.currentStreak}d`}
              sub={`Best: ${consistency.longestStreak}d`}
              color={consistency.currentStreak >= 3 ? Colors.success : Colors.gold}
            />
            <View style={s.divider} />
            <StatTile
              label="Clean Days"
              value={`${distrStats.cleanDays}/7`}
              sub="no distractions"
              color={distrStats.cleanDays >= 5 ? Colors.success : distrStats.cleanDays >= 3 ? Colors.gold : '#FB923C'}
            />
            <View style={s.divider} />
            <StatTile
              label="Peak Hour"
              value={peakHour !== null ? fmtHour(peakHour) : '—'}
              sub="best focus time"
            />
          </StatRow>
        </InfoCard>

        {/* ── Focus Section ─────────────────────────────────────────────────── */}
        <Section title="Weekly Focus" icon="flash-outline">
          <FocusBarChart days={focusStats.days} />
          {focusStats.bestDay && (
            <InfoCard>
              <View style={s.highlightRow}>
                <Ionicons name="trophy-outline" size={14} color={Colors.gold} />
                <Text style={s.highlightText}>
                  Best day: <Text style={{ color: Colors.gold }}>{focusStats.bestDay.dayLabel}</Text>
                  {' '}— {fmtMins(focusStats.bestDay.totalMins)}
                </Text>
                {focusStats.longestSessionMins > 0 && (
                  <Text style={s.highlightSub}>Longest session: {fmtMins(focusStats.longestSessionMins)}</Text>
                )}
              </View>
            </InfoCard>
          )}
          {!hasData && (
            <View style={s.emptyBanner}>
              <Ionicons name="timer-outline" size={24} color={Colors.textMuted} />
              <Text style={s.emptyText}>No focus sessions yet this week.{'\n'}Start a session from the Focus tab.</Text>
            </View>
          )}
        </Section>

        {/* ── Goal Focus Breakdown ─────────────────────────────────────────── */}
        <Section title="Focus by Goal" icon="flag-outline">
          <GoalFocusBars breakdown={goalBreak} />
        </Section>

        {/* ── Consistency Heatmap ──────────────────────────────────────────── */}
        <Section title="28-Day Consistency" icon="calendar-outline">
          <ConsistencyHeatmap heatmap={consistency.heatmap} />
          <InfoCard>
            <StatRow>
              <StatTile
                label="Active Days"
                value={`${consistency.activeDays}`}
                sub="of last 28"
                color={consistency.activeDays >= 20 ? Colors.success : Colors.gold}
              />
              <View style={s.divider} />
              <StatTile
                label="Focus Streak"
                value={`${consistency.currentStreak}d`}
                color={consistency.currentStreak >= 7 ? Colors.success : Colors.gold}
              />
              <View style={s.divider} />
              <StatTile
                label="Reflect Streak"
                value={`${consistency.reflectionStreak}d`}
                color={consistency.reflectionStreak >= 7 ? Colors.success : Colors.gold}
              />
            </StatRow>
          </InfoCard>
        </Section>

        {/* ── Distraction Section ───────────────────────────────────────────── */}
        <Section title="Distraction Pattern" icon="warning-outline">
          <DistractionBars days={distrStats.days} />
          <InfoCard>
            <StatRow>
              <StatTile
                label="This Week"
                value={`${distrStats.weeklyTotal}`}
                sub="total logs"
                color={distrStats.weeklyTotal === 0 ? Colors.success : distrStats.weeklyTotal <= 7 ? Colors.gold : '#F87171'}
              />
              <View style={s.divider} />
              <StatTile
                label="Daily Avg"
                value={`${distrStats.avgPerDay}`}
                sub="per day"
              />
              <View style={s.divider} />
              <StatTile
                label="Clean Days"
                value={`${distrStats.cleanDays}`}
                sub="zero logs"
                color={distrStats.cleanDays >= 5 ? Colors.success : Colors.textPrimary}
              />
              <View style={s.divider} />
              <StatTile
                label="Worst Day"
                value={distrStats.worstDay ? distrStats.worstDay.dayLabel : '—'}
                sub={distrStats.worstDay ? `${distrStats.worstDay.count} logs` : undefined}
                color={distrStats.worstDay ? '#F87171' : Colors.textMuted}
              />
            </StatRow>
          </InfoCard>
        </Section>

        {/* ── Goal Intelligence ─────────────────────────────────────────────── */}
        {totalGoals > 0 && (
          <Section title="Goal Health" icon="analytics-outline">
            <GoalHealthChips summary={goalHealth} />
            {goalHealth.mostActive && (
              <InfoCard>
                <View style={s.highlightRow}>
                  <Ionicons name="flame" size={14} color={Colors.gold} />
                  <Text style={s.highlightText}>
                    Most active: <Text style={{ color: Colors.gold }}>{goalHealth.mostActive.title}</Text>
                  </Text>
                  <Text style={s.highlightSub}>{fmtMins(goalHealth.mostActive.mins)} this week</Text>
                </View>
              </InfoCard>
            )}
          </Section>
        )}

        {/* ── Project Velocity ──────────────────────────────────────────────── */}
        {projects.length > 0 && (
          <Section title="Project Velocity" icon="git-branch-outline">
            <InfoCard>
              <StatRow>
                <StatTile
                  label="Done This Week"
                  value={`${projVelocity.milestoneDoneThisWeek}`}
                  sub="milestones"
                  color={projVelocity.milestoneDoneThisWeek >= projVelocity.milestoneDoneLastWeek ? Colors.success : '#FB923C'}
                />
                <View style={s.divider} />
                <StatTile
                  label="Last Week"
                  value={`${projVelocity.milestoneDoneLastWeek}`}
                  sub="milestones"
                />
                <View style={s.divider} />
                <StatTile
                  label="Completion"
                  value={`${projVelocity.overallCompletionPct}%`}
                  sub="all time"
                  color={projVelocity.overallCompletionPct >= 50 ? Colors.success : Colors.gold}
                />
                <View style={s.divider} />
                <StatTile
                  label="Stalled"
                  value={`${projVelocity.stalledCount}`}
                  sub="projects"
                  color={projVelocity.stalledCount > 0 ? '#FB923C' : Colors.success}
                />
              </StatRow>
              {projVelocity.milestoneDoneThisWeek > projVelocity.milestoneDoneLastWeek && (
                <View style={[s.highlightRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <Ionicons name="trending-up" size={14} color={Colors.success} />
                  <Text style={[s.highlightText, { color: Colors.success }]}>
                    +{projVelocity.milestoneDoneThisWeek - projVelocity.milestoneDoneLastWeek} more milestones than last week
                  </Text>
                </View>
              )}
              {projVelocity.milestoneDoneThisWeek < projVelocity.milestoneDoneLastWeek && projVelocity.milestoneDoneLastWeek > 0 && (
                <View style={[s.highlightRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <Ionicons name="trending-down" size={14} color="#FB923C" />
                  <Text style={[s.highlightText, { color: '#FB923C' }]}>
                    Velocity dropped vs last week
                  </Text>
                </View>
              )}
            </InfoCard>
          </Section>
        )}

        {/* ── Empty state ───────────────────────────────────────────────────── */}
        {!hasData && goals.length === 0 && projects.length === 0 && (
          <View style={s.emptyBanner}>
            <Ionicons name="bar-chart-outline" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>Analytics will appear here</Text>
            <Text style={s.emptyText}>
              Add goals, log focus sessions, and track projects.{'\n'}
              Your patterns will show up automatically.
            </Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },

  header:      { gap: 2 },
  screenLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  screenTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 2 },

  divider: { width: 1, backgroundColor: Colors.border, marginVertical: 8 },

  highlightRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    gap: Spacing.xs, padding: Spacing.md,
  },
  highlightText: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  highlightSub:  { fontSize: FontSize.xs, color: Colors.textMuted, width: '100%', marginLeft: 22 },

  emptyBanner: {
    alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  emptyText:  { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
