/**
 * app/weekly-review.tsx
 *
 * Weekly Review push screen.
 * Accessed via router.push('/weekly-review') from the Home secondary section.
 *
 * Shows:
 *   - Completion quality (avg rate + 7-day dot grid)
 *   - Total focus time
 *   - Dominant drift pattern
 *   - Recovery usage
 *   - One-line interpretation
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../src/store/useAppStore';
import { useEntitlements } from '../src/services/entitlementService';
import { ProContextCard } from '../src/components/ProContextCard';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  Radius,
} from '../src/constants/theme';
import { computeWeeklyReview, getWeekStart } from '../src/ai/reviewEngine';
import { interpretWeeklyReview } from '../src/ai/ritualEngine';
import { getTodayDate } from '../src/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Returns the ISO weekday index 0=Mon…6=Sun for a YYYY-MM-DD date string. */
function isoWeekday(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z');
  return (d.getUTCDay() + 6) % 7; // 0=Mon, 6=Sun
}

function formatMins(mins: number): string {
  if (mins === 0) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

const DRIFT_LABELS: Record<string, string> = {
  late_start:     'Late Start',
  avoidance:      'Avoidance',
  overload:       'Overload',
  distraction:    'Distraction',
  fragmented_day: 'Fragmented Day',
};

// ─── 7-Day Dot Grid ───────────────────────────────────────────────────────────

interface DotGridProps {
  weekStart: string;
  summaries: { date: string; completionRate: number }[];
}

function DotGrid({ weekStart, summaries }: DotGridProps) {
  const summaryMap = new Map(summaries.map((s) => [s.date, s.completionRate]));

  // Build 7 day date strings from weekStart (Mon) to Sun
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <View style={dg.row}>
      {days.map((date, i) => {
        const rate    = summaryMap.get(date);
        const hasData = rate !== undefined;
        const dotColor =
          !hasData              ? Colors.surfaceHigh :
          rate >= 0.8           ? Colors.success :
          rate >= 0.5           ? Colors.warning :
          Colors.error;

        return (
          <View key={date} style={dg.cell}>
            <View style={[dg.dot, { backgroundColor: dotColor }]} />
            <Text style={dg.label}>{DAY_LABELS[i]}</Text>
            {hasData && (
              <Text style={dg.pct}>{Math.round(rate * 100)}%</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const dg = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between' },
  cell:  { flex: 1, alignItems: 'center', gap: 4 },
  dot:   { width: 28, height: 28, borderRadius: 14 },
  label: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.medium },
  pct:   { fontSize: 9, color: Colors.textMuted },
});

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, valueColor,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={sc.card}>
      <Ionicons name={icon as any} size={16} color={Colors.textMuted} />
      <Text style={[sc.value, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card:  { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.border },
  value: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  label: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WeeklyReviewScreen() {
  const dailyReviews  = useAppStore((s) => s.dailyReviews);
  const today         = getTodayDate();
  const weekStart     = getWeekStart(today);
  const { isPro }     = useEntitlements();
  const [proNudgeDismissed, setProNudgeDismissed] = useState(false);

  const weekly = useMemo(
    () => computeWeeklyReview(dailyReviews, weekStart),
    [dailyReviews, weekStart],
  );

  const interpretation = useMemo(() => interpretWeeklyReview(weekly), [weekly]);

  const completionColor =
    weekly.avgCompletionRate >= 0.8 ? Colors.success :
    weekly.avgCompletionRate >= 0.5 ? Colors.warning :
    Colors.error;

  const hasData = weekly.dailySummaries.length > 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title}>Weekly Review</Text>
          <Text style={s.subtitle}>{weekStart} – {weekly.weekEnd}</Text>
        </View>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {!hasData ? (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No reviews yet this week</Text>
            <Text style={s.emptySub}>
              Complete your daily reviews and they'll appear here.
            </Text>
          </View>
        ) : (
          <>
            {/* 7-day dot grid */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Completion This Week</Text>
              <DotGrid weekStart={weekStart} summaries={weekly.dailySummaries} />
            </View>

            {/* Key stats row */}
            <View style={s.statsRow}>
              <StatCard
                icon="checkmark-circle-outline"
                label="Avg Completion"
                value={formatPct(weekly.avgCompletionRate)}
                valueColor={completionColor}
              />
              <StatCard
                icon="time-outline"
                label="Total Focus"
                value={formatMins(weekly.totalFocusMinutes)}
              />
            </View>

            <View style={s.statsRow}>
              <StatCard
                icon="refresh-outline"
                label="Recovery Days"
                value={weekly.recoveryCount > 0 ? `${weekly.recoveryCount}` : '—'}
                valueColor={weekly.recoveryCount >= 3 ? Colors.warning : undefined}
              />
              <StatCard
                icon="warning-outline"
                label="Dominant Drift"
                value={weekly.dominantDriftType
                  ? DRIFT_LABELS[weekly.dominantDriftType] ?? weekly.dominantDriftType
                  : 'None'}
                valueColor={weekly.dominantDriftType ? Colors.warning : Colors.success}
              />
            </View>

            {/* Alignment score — only shown when data exists */}
            {weekly.avgAlignmentScore > 0 && (
              <View style={[s.statsRow, { justifyContent: 'center' }]}>
                <StatCard
                  icon="analytics-outline"
                  label="Avg Alignment"
                  value={`${weekly.avgAlignmentScore}`}
                  valueColor={
                    weekly.avgAlignmentScore >= 75 ? Colors.success :
                    weekly.avgAlignmentScore >= 50 ? Colors.warning :
                    Colors.error
                  }
                />
                <View style={{ flex: 1 }} />
              </View>
            )}

            {/* Interpretation */}
            <View style={s.interpretCard}>
              <View style={s.interpretHeader}>
                <Ionicons name="bulb-outline" size={14} color={Colors.gold} />
                <Text style={s.interpretLabel}>System Read</Text>
              </View>
              <Text style={s.interpretText}>{interpretation}</Text>
            </View>

            {/* Per-day breakdown */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Day Breakdown</Text>
              <View style={s.dayList}>
                {weekly.dailySummaries
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((day) => {
                    const pct = Math.round(day.completionRate * 100);
                    const barColor =
                      day.completionRate >= 0.8 ? Colors.success :
                      day.completionRate >= 0.5 ? Colors.warning :
                      Colors.error;

                    return (
                      <View key={day.date} style={s.dayRow}>
                        <Text style={s.dayDate}>{day.date.slice(5)}</Text>
                        <View style={s.barWrap}>
                          <View
                            style={[
                              s.bar,
                              { width: `${pct}%`, backgroundColor: barColor },
                            ]}
                          />
                        </View>
                        <Text style={s.dayPct}>{pct}%</Text>
                        {day.recoveryUsed && (
                          <Ionicons name="refresh" size={10} color={Colors.purpleLight} />
                        )}
                      </View>
                    );
                  })}
              </View>
            </View>

            {/* Contextual Pro nudge — long-term patterns surface */}
            {!isPro && !proNudgeDismissed && (
              <ProContextCard
                feature="weekly_insights_depth"
                onUpgrade={() => router.push('/upgrade' as any)}
                onDismiss={() => setProNudgeDismissed(true)}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },

  // Header
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  backBtn:      { width: 40, alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  title:        { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  subtitle:     { fontSize: FontSize.xs, color: Colors.textMuted, letterSpacing: 0.4 },

  // Sections
  section:      { gap: Spacing.sm },
  sectionLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: FontWeight.semibold },

  // Stats
  statsRow: { flexDirection: 'row', gap: Spacing.md },

  // Interpretation card
  interpretCard:   { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.goldDim + '44' },
  interpretHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  interpretLabel:  { fontSize: FontSize.xs, color: Colors.gold, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: FontWeight.bold },
  interpretText:   { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },

  // Day breakdown
  dayList: { gap: 8 },
  dayRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dayDate: { fontSize: FontSize.xs, color: Colors.textMuted, width: 40 },
  barWrap: { flex: 1, height: 6, backgroundColor: Colors.surfaceHigh, borderRadius: 3, overflow: 'hidden' },
  bar:     { height: 6, borderRadius: 3 },
  dayPct:  { fontSize: FontSize.xs, color: Colors.textSecondary, width: 32, textAlign: 'right' },

  // Empty state
  empty:      { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  emptySub:   { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
