/**
 * academicRiskEngine — Phase B: Student Intelligence System
 *
 * Detects academic risks across all courses and surfaces actionable alerts.
 * Pure functions — no store imports.
 *
 * Risk levels:
 *   CRITICAL — exam in ≤3 days OR overdue high-priority assignment + low readiness
 *   HIGH     — exam in ≤7 days with readiness < 55, or multiple overdues
 *   MEDIUM   — exam in ≤14 days with readiness < 65, or no recent study
 */

import type { CourseReadiness } from './readinessEngine';
import type { Exam, Assignment } from '../types';

// ─── Output types ─────────────────────────────────────────────────────────────

export type RiskLevel = 'critical' | 'high' | 'medium';

export interface AcademicRisk {
  id:            string;         // deterministic key for list rendering
  courseId:      string;
  courseName:    string;
  riskLevel:     RiskLevel;
  reason:        string;
  actionRequired: string;
  examId?:       string;
  assignmentId?: string;
}

// ─── Detection ────────────────────────────────────────────────────────────────

export function detectAcademicRisks(
  readiness:   Record<string, CourseReadiness>,
  exams:       Exam[],
  assignments: Assignment[],
  today:       string,          // YYYY-MM-DD
): AcademicRisk[] {
  const risks: AcademicRisk[] = [];
  const todayMs = new Date(today + 'T00:00:00').getTime();

  for (const r of Object.values(readiness)) {
    // ── CRITICAL: exam in ≤3 days ──────────────────────────────────────────
    const criticalExams = exams.filter(
      (e) => e.courseId === r.courseId && e.date >= today &&
        Math.ceil((new Date(e.date + 'T00:00:00').getTime() - todayMs) / 86_400_000) <= 3,
    );
    for (const exam of criticalExams) {
      const days = Math.ceil((new Date(exam.date + 'T00:00:00').getTime() - todayMs) / 86_400_000);
      risks.push({
        id:           `critical-exam-${exam.id}`,
        courseId:     r.courseId,
        courseName:   r.courseName,
        riskLevel:    'critical',
        reason:       `${exam.title} is in ${days} day${days !== 1 ? 's' : ''}`,
        actionRequired: `Study ${exam.topics.slice(0, 2).join(', ') || 'core topics'} — intensive review now`,
        examId:       exam.id,
      });
    }

    // ── CRITICAL: overdue high-priority assignment + low readiness ─────────
    if (r.overdueAssignments > 0 && r.score < 45) {
      const overdueHighPriority = assignments.filter(
        (a) => a.courseId === r.courseId && !a.completed && a.dueDate < today && a.priority === 'high',
      );
      for (const a of overdueHighPriority) {
        risks.push({
          id:            `critical-overdue-${a.id}`,
          courseId:      r.courseId,
          courseName:    r.courseName,
          riskLevel:     'critical',
          reason:        `"${a.title}" is overdue`,
          actionRequired: 'Submit now even if incomplete — partial credit beats zero',
          assignmentId:  a.id,
        });
      }
    }

    // ── HIGH: exam in ≤7 days with readiness < 55 ─────────────────────────
    if (r.daysUntilNextExam !== null && r.daysUntilNextExam <= 7 && r.score < 55 && criticalExams.length === 0) {
      const urgentExams = exams.filter(
        (e) => e.courseId === r.courseId && e.date >= today &&
          Math.ceil((new Date(e.date + 'T00:00:00').getTime() - todayMs) / 86_400_000) <= 7,
      );
      for (const exam of urgentExams) {
        const days = Math.ceil((new Date(exam.date + 'T00:00:00').getTime() - todayMs) / 86_400_000);
        risks.push({
          id:        `high-exam-${exam.id}`,
          courseId:  r.courseId,
          courseName: r.courseName,
          riskLevel: 'high',
          reason:    `${exam.title} in ${days}d — readiness ${r.score}%`,
          actionRequired: `2+ study sessions before the exam — focus on: ${exam.topics.slice(0, 2).join(', ') || 'all topics'}`,
          examId:    exam.id,
        });
      }
    }

    // ── HIGH: multiple overdue assignments ────────────────────────────────
    if (r.overdueAssignments >= 2) {
      risks.push({
        id:           `high-multi-overdue-${r.courseId}`,
        courseId:     r.courseId,
        courseName:   r.courseName,
        riskLevel:    'high',
        reason:       `${r.overdueAssignments} assignments overdue`,
        actionRequired: 'Block 2h to clear backlog — prioritize by weight',
      });
    }

    // ── MEDIUM: exam in ≤14 days with readiness < 65 ─────────────────────
    if (
      r.daysUntilNextExam !== null && r.daysUntilNextExam > 7 && r.daysUntilNextExam <= 14 &&
      r.score < 65 && criticalExams.length === 0
    ) {
      risks.push({
        id:        `medium-exam-${r.courseId}`,
        courseId:  r.courseId,
        courseName: r.courseName,
        riskLevel: 'medium',
        reason:    `Exam in ${r.daysUntilNextExam}d — readiness ${r.score}%`,
        actionRequired: 'Start daily 30–45 min sessions now',
      });
    }

    // ── MEDIUM: no study in ≥7 days with upcoming exam ───────────────────
    if (
      r.lastStudiedDaysAgo !== null && r.lastStudiedDaysAgo >= 7 &&
      r.daysUntilNextExam !== null && r.daysUntilNextExam <= 21 &&
      criticalExams.length === 0
    ) {
      risks.push({
        id:        `medium-stale-${r.courseId}`,
        courseId:  r.courseId,
        courseName: r.courseName,
        riskLevel: 'medium',
        reason:    `${r.lastStudiedDaysAgo}d since last study — exam approaching`,
        actionRequired: 'Resume study today — even 25 min rebuilds momentum',
      });
    }
  }

  // Deduplicate by courseId + riskLevel (keep highest)
  const seen = new Set<string>();
  return risks
    .sort((a, b) => {
      const order: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2 };
      return order[a.riskLevel] - order[b.riskLevel];
    })
    .filter((risk) => {
      const key = risk.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ─── Summarize ────────────────────────────────────────────────────────────────

export function highestRiskLevel(risks: AcademicRisk[]): RiskLevel | null {
  if (risks.some((r) => r.riskLevel === 'critical')) return 'critical';
  if (risks.some((r) => r.riskLevel === 'high'))     return 'high';
  if (risks.some((r) => r.riskLevel === 'medium'))   return 'medium';
  return null;
}

export function riskLevelColor(level: RiskLevel | null): string {
  switch (level) {
    case 'critical': return '#F87171';
    case 'high':     return '#FB923C';
    case 'medium':   return '#C9A84C';
    default:         return '#4ADE80';
  }
}
