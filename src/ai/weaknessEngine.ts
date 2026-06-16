/**
 * weaknessEngine — Phase B.5: Topic Intelligence
 *
 * Computes a weakness score (0–100) for each Topic.
 * Higher score = stronger mastery. Lower score = weaker, needs attention.
 *
 * Scoring formula:
 *   Base:                   10
 *   Per linked memory:     +15 (cap at +45)
 *   Memory recency (<3d):  +15
 *   Memory recency (<7d):  +8
 *   Exam topics include:   +10 if topic appears in any exam's topics list
 *   No memories at all:      0 (label = 'unknown')
 */

import type { Topic, Course, MemoryEntry, Exam, FocusSession } from '../types';

// ─── Output types ─────────────────────────────────────────────────────────────

export type WeaknessLabel = 'unknown' | 'weak' | 'developing' | 'strong';

export interface TopicWeakness {
  topicId:        string;
  topicName:      string;
  courseId:       string;
  courseName:     string;
  score:          number;        // 0–100
  label:          WeaknessLabel;
  memoryCount:    number;
  lastStudiedAt:  string | null; // ISO of most recent linked memory
  recommendation: string;
}

// ─── Per-topic computation ────────────────────────────────────────────────────

export function computeTopicWeakness(
  topic: Topic,
  course: Course,
  memories: MemoryEntry[],
  exams: Exam[],
  today: string,
): TopicWeakness {
  const linked = memories.filter((m) => m.linkedTopicId === topic.id);

  if (linked.length === 0) {
    // No notes at all — complete unknown
    return {
      topicId:       topic.id,
      topicName:     topic.name,
      courseId:      topic.courseId,
      courseName:    course.name,
      score:         0,
      label:         'unknown',
      memoryCount:   0,
      lastStudiedAt: null,
      recommendation: `No study notes for ${topic.name} yet. Create your first note to start tracking mastery.`,
    };
  }

  let score = 10;

  // Memory count contribution (cap at 3 × 15 = 45)
  score += Math.min(linked.length * 15, 45);

  // Recency of most recent memory
  const sorted = [...linked].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const latest = sorted[0];
  const lastMs = latest ? new Date(latest.updatedAt).getTime() : 0;
  const todayMs = new Date(today + 'T23:59:59').getTime();
  const daysSince = Math.floor((todayMs - lastMs) / 86_400_000);

  if (daysSince <= 3)       score += 15;
  else if (daysSince <= 7)  score += 8;
  else if (daysSince <= 14) score += 4;
  else                      score -= 5; // stale knowledge

  // Bonus: topic name appears in an upcoming exam's topics list
  const topicNameLower = topic.name.toLowerCase();
  const appearsInExam = exams.some(
    (e) => e.courseId === topic.courseId &&
      e.date >= today &&
      e.topics.some((t) => t.toLowerCase().includes(topicNameLower) || topicNameLower.includes(t.toLowerCase())),
  );
  if (appearsInExam) score += 10;

  score = Math.max(0, Math.min(100, score));

  const label: WeaknessLabel =
    score >= 70 ? 'strong' :
    score >= 40 ? 'developing' :
    'weak';

  const recommendation =
    label === 'strong'     ? `${topic.name} looks solid. Review once more before exams.` :
    label === 'developing' ? `${topic.name} is building. Add more practice notes and test yourself.` :
                             `${topic.name} is weak. Prioritize this in your next study session.`;

  return {
    topicId:       topic.id,
    topicName:     topic.name,
    courseId:      topic.courseId,
    courseName:    course.name,
    score,
    label,
    memoryCount:   linked.length,
    lastStudiedAt: latest?.updatedAt ?? null,
    recommendation,
  };
}

// ─── Batch computation ────────────────────────────────────────────────────────

export function computeAllWeakness(
  topics: Topic[],
  courses: Course[],
  memories: MemoryEntry[],
  exams: Exam[],
  today: string,
): Record<string, TopicWeakness> {
  const courseMap = Object.fromEntries(courses.map((c) => [c.id, c]));
  const result: Record<string, TopicWeakness> = {};
  for (const topic of topics) {
    const course = courseMap[topic.courseId];
    if (!course) continue;
    result[topic.id] = computeTopicWeakness(topic, course, memories, exams, today);
  }
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function weaknessLabelColor(label: WeaknessLabel): string {
  switch (label) {
    case 'strong':     return '#4ADE80';
    case 'developing': return '#C9A84C';
    case 'weak':       return '#FB923C';
    case 'unknown':    return '#555555';
  }
}

export function weakestTopics(weakness: Record<string, TopicWeakness>, courseId?: string, limit = 5): TopicWeakness[] {
  return Object.values(weakness)
    .filter((t) => !courseId || t.courseId === courseId)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

export function courseWeaknessProfile(
  weakness: Record<string, TopicWeakness>,
  courseId: string,
): { weak: number; developing: number; strong: number; unknown: number; total: number } {
  const topics = Object.values(weakness).filter((t) => t.courseId === courseId);
  return {
    weak:       topics.filter((t) => t.label === 'weak').length,
    developing: topics.filter((t) => t.label === 'developing').length,
    strong:     topics.filter((t) => t.label === 'strong').length,
    unknown:    topics.filter((t) => t.label === 'unknown').length,
    total:      topics.length,
  };
}
