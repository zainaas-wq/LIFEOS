/**
 * LifeOS Analytics Engine
 *
 * Pure data aggregation — no UI, no side effects.
 * All functions derive insights from existing store data.
 *
 * Sections:
 *   Focus     — daily minutes, per-goal breakdown, peak hours
 *   Consistency — activity streaks, 28-day heatmap
 *   Distractions — daily counts, clean-day streaks
 *   Goals     — health distribution, most-active goal
 *   Projects  — milestone velocity, completion rate
 */

import type {
  FocusSession, DistractionLog, DailyReflection,
  Goal, GoalIntelligence, GoalRiskLevel,
  Project, Milestone,
} from '../types';
import { getLocalDateStr } from '../lib/utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getLastNDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(getLocalDateStr(d));
  }
  return dates;
}

function sessionDate(s: FocusSession): string {
  return getLocalDateStr(new Date(s.start));
}

// ─── Focus Stats ──────────────────────────────────────────────────────────────

export interface DailyFocus {
  date:         string;
  dayLabel:     string;  // 'Mon', 'Tue', etc.
  totalMins:    number;
  sessionCount: number;
}

export interface WeeklyFocusStats {
  days:          DailyFocus[];  // 7 entries
  totalMins:     number;
  dailyAvgMins:  number;
  bestDay:       DailyFocus | null;
  totalSessions: number;
  longestSessionMins: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function computeWeeklyFocusStats(sessions: FocusSession[]): WeeklyFocusStats {
  const dates = getLastNDates(7);
  const days: DailyFocus[] = dates.map((date) => {
    const d = new Date(date + 'T00:00:00');
    const daySessions = sessions.filter((s) => sessionDate(s) === date);
    return {
      date,
      dayLabel: DAY_LABELS[d.getDay()],
      totalMins: daySessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0),
      sessionCount: daySessions.length,
    };
  });

  const totalMins     = days.reduce((s, d) => s + d.totalMins, 0);
  const activeDays    = days.filter((d) => d.totalMins > 0);
  const dailyAvgMins  = activeDays.length > 0 ? Math.round(totalMins / 7) : 0;
  const bestDay       = days.reduce<DailyFocus | null>(
    (best, d) => (!best || d.totalMins > best.totalMins ? d : best), null,
  );
  const totalSessions = days.reduce((s, d) => s + d.sessionCount, 0);
  const longestSessionMins = sessions.reduce((max, s) => Math.max(max, s.durationMinutes ?? 0), 0);

  return { days, totalMins, dailyAvgMins, bestDay: bestDay?.totalMins ? bestDay : null, totalSessions, longestSessionMins };
}

// ─── Focus by Goal ────────────────────────────────────────────────────────────

export interface GoalFocusBreakdown {
  goalId:    string;
  title:     string;
  category:  string;
  totalMins: number;
  pct:       number;  // 0–1 share of total
}

export function computeGoalFocusBreakdown(
  sessions:  FocusSession[],
  goals:     Goal[],
  days = 7,
): GoalFocusBreakdown[] {
  const cutoff = getLastNDates(days)[0];
  const recent = sessions.filter((s) => sessionDate(s) >= cutoff && s.goalId);

  const totals: Record<string, number> = {};
  for (const s of recent) {
    if (s.goalId) totals[s.goalId] = (totals[s.goalId] ?? 0) + (s.durationMinutes ?? 0);
  }

  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  if (!grandTotal) return [];

  return Object.entries(totals)
    .map(([goalId, totalMins]) => {
      const goal = goals.find((g) => g.id === goalId);
      return {
        goalId,
        title:    goal?.title ?? 'Unknown',
        category: goal?.category ?? 'other',
        totalMins,
        pct: totalMins / grandTotal,
      };
    })
    .sort((a, b) => b.totalMins - a.totalMins)
    .slice(0, 5);
}

// ─── Consistency / Heatmap ────────────────────────────────────────────────────

export interface HeatmapDay {
  date:       string;
  dayLabel:   string;  // 'M', 'T', 'W', 'T', 'F', 'S', 'S'
  totalMins:  number;
  hasSession: boolean;
  intensity:  0 | 1 | 2 | 3 | 4;  // 0=none, 4=max (≥120 min)
}

export interface ConsistencyStats {
  heatmap:       HeatmapDay[];  // 28 days, oldest first
  currentStreak: number;        // consecutive days with ≥1 session (ending today)
  longestStreak: number;
  activeDays:    number;        // of last 28
  reflectionStreak: number;
}

const SHORT_DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function minsToIntensity(mins: number): 0 | 1 | 2 | 3 | 4 {
  if (mins === 0)   return 0;
  if (mins < 30)    return 1;
  if (mins < 60)    return 2;
  if (mins < 120)   return 3;
  return 4;
}

export function computeConsistencyStats(
  sessions:    FocusSession[],
  reflections: DailyReflection[],
): ConsistencyStats {
  const dates = getLastNDates(28);

  // Build daily minute totals
  const minsByDate: Record<string, number> = {};
  for (const s of sessions) {
    const d = sessionDate(s);
    minsByDate[d] = (minsByDate[d] ?? 0) + (s.durationMinutes ?? 0);
  }

  const heatmap: HeatmapDay[] = dates.map((date) => {
    const d = new Date(date + 'T00:00:00');
    const totalMins = minsByDate[date] ?? 0;
    return {
      date,
      dayLabel:   SHORT_DAY[d.getDay()],
      totalMins,
      hasSession: totalMins > 0,
      intensity:  minsToIntensity(totalMins),
    };
  });

  // Current streak (count backwards from today)
  let currentStreak = 0;
  for (let i = heatmap.length - 1; i >= 0; i--) {
    if (heatmap[i].hasSession) currentStreak++;
    else break;
  }

  // Longest streak in 28 days
  let longestStreak = 0;
  let run = 0;
  for (const d of heatmap) {
    run = d.hasSession ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }

  const activeDays = heatmap.filter((d) => d.hasSession).length;

  // Reflection streak
  const reflDates = new Set(reflections.map((r) => r.date));
  let reflectionStreak = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (reflDates.has(dates[i])) reflectionStreak++;
    else break;
  }

  return { heatmap, currentStreak, longestStreak, activeDays, reflectionStreak };
}

// ─── Distraction Stats ────────────────────────────────────────────────────────

export interface DailyDistraction {
  date:     string;
  dayLabel: string;
  count:    number;
}

export interface DistractionStats {
  days:         DailyDistraction[];  // 7 days
  weeklyTotal:  number;
  cleanDays:    number;              // days with 0 distractions
  avgPerDay:    number;
  worstDay:     DailyDistraction | null;
}

export function computeDistractionStats(logs: DistractionLog[]): DistractionStats {
  const dates = getLastNDates(7);
  const days: DailyDistraction[] = dates.map((date) => {
    const d = new Date(date + 'T00:00:00');
    return {
      date,
      dayLabel: DAY_LABELS[d.getDay()],
      count: logs.filter((l) => getLocalDateStr(new Date(l.timestamp)) === date).length,
    };
  });

  const weeklyTotal = days.reduce((s, d) => s + d.count, 0);
  const cleanDays   = days.filter((d) => d.count === 0).length;
  const avgPerDay   = Math.round(weeklyTotal / 7);
  const worstDay    = days.reduce<DailyDistraction | null>(
    (worst, d) => (!worst || d.count > worst.count ? d : worst), null,
  );

  return { days, weeklyTotal, cleanDays, avgPerDay, worstDay: worstDay?.count ? worstDay : null };
}

// ─── Goal Health Summary ──────────────────────────────────────────────────────

export interface GoalHealthSummary {
  onTrack:    number;
  atRisk:     number;
  critical:   number;
  stalled:    number;
  mostActive: { title: string; mins: number; category: string } | null;
}

export function computeGoalHealthSummary(
  goals:        Goal[],
  intelligence: Record<string, GoalIntelligence>,
  sessions:     FocusSession[],
): GoalHealthSummary {
  const counts: Record<GoalRiskLevel, number> = {
    'on-track': 0, 'at-risk': 0, 'critical': 0, 'stalled': 0,
  };

  for (const g of goals) {
    const intel = intelligence[g.id];
    if (intel) counts[intel.riskLevel]++;
  }

  // Most active goal this week (by focus minutes)
  const breakdown = computeGoalFocusBreakdown(sessions, goals, 7);
  const top = breakdown[0];
  const mostActive = top
    ? { title: top.title, mins: top.totalMins, category: top.category }
    : null;

  return {
    onTrack:  counts['on-track'],
    atRisk:   counts['at-risk'],
    critical: counts['critical'],
    stalled:  counts['stalled'],
    mostActive,
  };
}

// ─── Project Velocity ─────────────────────────────────────────────────────────

export interface ProjectVelocity {
  milestoneDoneThisWeek: number;
  milestoneDoneLastWeek: number;
  totalActive:           number;
  totalMilestones:       number;
  completedMilestones:   number;
  overallCompletionPct:  number;
  stalledCount:          number;
}

export function computeProjectVelocity(
  projects:    Project[],
  milestones:  Milestone[],
): ProjectVelocity {
  const today     = getLocalDateStr();
  const weekStart = getLastNDates(7)[0];
  const prevStart = getLastNDates(14)[0];

  const completed = milestones.filter((m) => m.status === 'completed' && m.completedAt);

  const thisWeek = completed.filter(
    (m) => getLocalDateStr(new Date(m.completedAt!)) >= weekStart,
  ).length;

  const lastWeek = completed.filter((m) => {
    const d = getLocalDateStr(new Date(m.completedAt!));
    return d >= prevStart && d < weekStart;
  }).length;

  const totalActive   = projects.filter((p) => p.status === 'active').length;
  const totalMs       = milestones.length;
  const completedMs   = completed.length;
  const completionPct = totalMs > 0 ? Math.round((completedMs / totalMs) * 100) : 0;

  // Stalled: active project with no completed milestone in 7 days
  const stalledCount = projects.filter((p) => {
    if (p.status !== 'active') return false;
    const ms = milestones.filter((m) => m.projectId === p.id);
    if (!ms.length) return false;
    const lastDone = ms
      .filter((m) => m.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];
    if (!lastDone) return ms.some((_) => true); // has milestones but none done
    const days = Math.floor((Date.now() - new Date(lastDone.completedAt!).getTime()) / 86_400_000);
    return days >= 7;
  }).length;

  return {
    milestoneDoneThisWeek: thisWeek,
    milestoneDoneLastWeek: lastWeek,
    totalActive,
    totalMilestones: totalMs,
    completedMilestones: completedMs,
    overallCompletionPct: completionPct,
    stalledCount,
  };
}

// ─── Peak Focus Hour ──────────────────────────────────────────────────────────

export function computePeakFocusHour(sessions: FocusSession[]): number | null {
  const recent = sessions.filter((s) => {
    const d = sessionDate(s);
    return d >= getLastNDates(28)[0];
  });
  if (!recent.length) return null;

  const byHour: Record<number, number> = {};
  for (const s of recent) {
    const h = new Date(s.start).getHours();
    byHour[h] = (byHour[h] ?? 0) + (s.durationMinutes ?? 0);
  }

  return Object.entries(byHour).reduce<number | null>(
    (best, [h, mins]) => best === null || mins > (byHour[best] ?? 0) ? Number(h) : best,
    null,
  );
}
