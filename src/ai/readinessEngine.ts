/**
 * readinessEngine — Phase B: Student Intelligence System
 *
 * Computes academic readiness per course (0–100).
 * Pure functions — no side effects, no store imports.
 *
 * Score factors:
 *   Study time this week       → up to +25
 *   Exam proximity             → −20 / −10 / −5
 *   Overdue assignments        → −10 each (cap −30)
 *   Assignment completion rate → up to +10
 *   Study notes (memories)     → +10
 *   Recent study (last 3 days) → +5
 *   Stale (no study in 7d + exam upcoming) → −10
 *   No upcoming exam           → +5
 */

import type { Course, Assignment, Exam, FocusSession, MemoryEntry, Goal } from '../types';

// ─── Output types ─────────────────────────────────────────────────────────────

export type ReadinessLabel = 'critical' | 'at-risk' | 'building' | 'strong';

export interface CourseReadiness {
  courseId:            string;
  courseName:          string;
  score:               number;        // 0–100
  label:               ReadinessLabel;
  studyMinsThisWeek:   number;
  daysUntilNextExam:   number | null;
  overdueAssignments:  number;
  pendingAssignments:  number;
  hasStudyNotes:       boolean;
  lastStudiedDaysAgo:  number | null;
  recommendation:      string;
}

// ─── Per-course computation ────────────────────────────────────────────────────

export function computeCourseReadiness(
  course:    Course,
  exams:     Exam[],
  assignments: Assignment[],
  focusSessions: FocusSession[],
  memories:  MemoryEntry[],
  goals:     Goal[],
  today:     string,            // YYYY-MM-DD
): CourseReadiness {
  const todayMs   = new Date(today + 'T00:00:00').getTime();
  const weekAgoMs = todayMs - 7 * 86_400_000;
  const threeDaysAgoMs = todayMs - 3 * 86_400_000;

  // ── Find goals linked to this course (by matching title) ─────────────────
  const linkedGoalIds = new Set<string>(
    goals
      .filter((g) =>
        g.title.toLowerCase() === course.name.toLowerCase() ||
        course.name.toLowerCase().includes(g.title.toLowerCase()) ||
        g.title.toLowerCase().includes(course.name.toLowerCase()),
      )
      .map((g) => g.id),
  );

  // ── Study time this week ──────────────────────────────────────────────────
  const studyMinsThisWeek = focusSessions
    .filter((s) => {
      const sessionMs = new Date(s.start).getTime();
      return sessionMs >= weekAgoMs && sessionMs <= todayMs + 86_400_000 && s.end && s.goalId && linkedGoalIds.has(s.goalId);
    })
    .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);

  // ── Last study date ───────────────────────────────────────────────────────
  const studySessions = focusSessions
    .filter((s) => s.end && s.goalId && linkedGoalIds.has(s.goalId))
    .sort((a, b) => b.start.localeCompare(a.start));
  const lastSessionMs     = studySessions[0] ? new Date(studySessions[0].start).getTime() : null;
  const lastStudiedDaysAgo = lastSessionMs !== null
    ? Math.floor((todayMs - lastSessionMs) / 86_400_000)
    : null;
  const studiedRecently   = lastSessionMs !== null && lastSessionMs >= threeDaysAgoMs;

  // ── Upcoming exams ────────────────────────────────────────────────────────
  const upcomingExams = exams
    .filter((e) => e.courseId === course.id && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextExam = upcomingExams[0] ?? null;
  const daysUntilNextExam = nextExam
    ? Math.ceil((new Date(nextExam.date + 'T00:00:00').getTime() - todayMs) / 86_400_000)
    : null;

  // ── Assignments ───────────────────────────────────────────────────────────
  const courseAssignments  = assignments.filter((a) => a.courseId === course.id);
  const overdueAssignments = courseAssignments.filter((a) => !a.completed && a.dueDate < today).length;
  const pendingAssignments = courseAssignments.filter((a) => !a.completed && a.dueDate >= today).length;
  const completedCount     = courseAssignments.filter((a) => a.completed).length;
  const completionRatio    = courseAssignments.length > 0 ? completedCount / courseAssignments.length : 1;

  // ── Study notes in memory ─────────────────────────────────────────────────
  const hasStudyNotes = memories.some(
    (m) =>
      m.linkedCourseId === course.id ||
      m.tags.some(
        (t) =>
          t.toLowerCase() === course.name.toLowerCase() ||
          (course.code && t.toLowerCase() === course.code.toLowerCase()),
      ),
  );

  // ── Score ─────────────────────────────────────────────────────────────────
  let score = 50;

  // Study time: +5 per 30 min, cap at +25
  score += Math.min(25, Math.floor(studyMinsThisWeek / 30) * 5);

  // Exam proximity
  if (daysUntilNextExam !== null) {
    if      (daysUntilNextExam <= 2)  score -= 20;
    else if (daysUntilNextExam <= 7)  score -= 10;
    else if (daysUntilNextExam <= 14) score -=  5;
  } else {
    score += 5; // steady state, no pressure
  }

  // Overdue penalty (cap −30)
  score -= Math.min(30, overdueAssignments * 10);

  // Assignment completion bonus (up to +10)
  score += Math.round(completionRatio * 10);

  // Study notes bonus
  if (hasStudyNotes) score += 10;

  // Recency bonuses/penalties
  if (studiedRecently) score += 5;
  if (lastStudiedDaysAgo !== null && lastStudiedDaysAgo >= 7 && daysUntilNextExam !== null) score -= 10;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const label: ReadinessLabel =
    score < 35 ? 'critical' :
    score < 55 ? 'at-risk'  :
    score < 75 ? 'building' :
    'strong';

  // ── Recommendation ────────────────────────────────────────────────────────
  let recommendation: string;
  if (overdueAssignments > 0) {
    recommendation = `${overdueAssignments} overdue — recover now`;
  } else if (daysUntilNextExam !== null && daysUntilNextExam <= 3) {
    recommendation = `Exam in ${daysUntilNextExam}d — intensive review`;
  } else if (daysUntilNextExam !== null && daysUntilNextExam <= 7) {
    recommendation = `Exam in ${daysUntilNextExam}d — daily sessions`;
  } else if (lastStudiedDaysAgo !== null && lastStudiedDaysAgo >= 5 && nextExam) {
    recommendation = `${lastStudiedDaysAgo}d since last study — restart`;
  } else if (studyMinsThisWeek < 30 && nextExam) {
    recommendation = 'Start 45 min sessions this week';
  } else if (score >= 75) {
    recommendation = 'On track — maintain consistency';
  } else {
    recommendation = 'Increase study frequency';
  }

  return {
    courseId: course.id, courseName: course.name,
    score, label,
    studyMinsThisWeek, daysUntilNextExam,
    overdueAssignments, pendingAssignments,
    hasStudyNotes, lastStudiedDaysAgo,
    recommendation,
  };
}

// ─── Batch computation ────────────────────────────────────────────────────────

export function computeAllReadiness(
  courses:  Course[],
  exams:    Exam[],
  assignments: Assignment[],
  focusSessions: FocusSession[],
  memories: MemoryEntry[],
  goals:    Goal[],
  today:    string,
): Record<string, CourseReadiness> {
  const result: Record<string, CourseReadiness> = {};
  for (const course of courses) {
    result[course.id] = computeCourseReadiness(course, exams, assignments, focusSessions, memories, goals, today);
  }
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function readinessLabelColor(label: ReadinessLabel): string {
  switch (label) {
    case 'critical': return '#F87171';
    case 'at-risk':  return '#FB923C';
    case 'building': return '#C9A84C';
    case 'strong':   return '#4ADE80';
  }
}

export function overallAcademicScore(readiness: Record<string, CourseReadiness>): number {
  const values = Object.values(readiness);
  if (!values.length) return 0;
  return Math.round(values.reduce((s, r) => s + r.score, 0) / values.length);
}
