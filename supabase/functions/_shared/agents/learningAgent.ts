/**
 * Learning Agent — Sprint 3
 *
 * Specializes in: study strategy, exam preparation, course management,
 * knowledge gap detection, and spaced repetition guidance.
 *
 * Context: courses, assignments, exams, focus sessions on study goals, memories tagged 'study'.
 */

export interface CourseItem    { id: string; name: string; code?: string; creditHours?: number }
export interface ExamItem      { id: string; courseId: string; title: string; date: string; topics: string[]; type: string }
export interface AssignmentItem { id: string; courseId: string; title: string; dueDate: string; type: string; priority: string; completed: boolean }

export interface ReadinessItem {
  courseId:   string;
  courseName: string;
  score:      number;
  label:      string;
  recommendation: string;
  studyMinsThisWeek: number;
  daysUntilNextExam: number | null;
  overdueAssignments: number;
}

export interface RiskItem {
  courseName:    string;
  riskLevel:     string;
  reason:        string;
  actionRequired: string;
}

export interface TopicWeaknessItem {
  topicName:    string;
  courseName:   string;
  score:        number;
  label:        string;
  memoryCount:  number;
  recommendation: string;
}

export interface LearningAgentContext {
  todayDate:          string;
  courses:            CourseItem[];
  exams:              ExamItem[];
  assignments:        AssignmentItem[];
  studyFocusMins:     number;
  retrievedMemories:  Array<{ title: string; content: string; similarity: number }>;
  // Phase B: intelligence layers
  readiness?:         ReadinessItem[];
  risks?:             RiskItem[];
  // Phase B.5: topic intelligence
  topicWeakness?:     TopicWeaknessItem[];
}

export function buildLearningAgentPrompt(ctx: LearningAgentContext): string {
  const today = new Date(ctx.todayDate + 'T00:00:00');

  const courseMap = Object.fromEntries(ctx.courses.map((c) => [c.id, c.name]));

  const upcomingExams = [...ctx.exams]
    .filter((e) => e.date >= ctx.todayDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const examLines = upcomingExams.length
    ? upcomingExams.map((e) => {
        const daysLeft = Math.ceil((new Date(e.date).getTime() - today.getTime()) / 86_400_000);
        const urgency  = daysLeft <= 3 ? '🔴 CRITICAL' : daysLeft <= 7 ? '🟡 URGENT' : '🟢';
        return `• ${urgency} ${e.title} — ${courseMap[e.courseId] ?? 'Unknown'} — ${e.date} (${daysLeft}d)\n  Topics: ${e.topics.join(', ') || 'Not specified'}`;
      }).join('\n')
    : '• No upcoming exams.';

  const pendingAssignments = [...ctx.assignments]
    .filter((a) => !a.completed && a.dueDate >= ctx.todayDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 8);

  const assignmentLines = pendingAssignments.length
    ? pendingAssignments.map((a) => {
        const daysLeft = Math.ceil((new Date(a.dueDate).getTime() - today.getTime()) / 86_400_000);
        return `• [${a.priority.toUpperCase()}] ${a.title} (${courseMap[a.courseId] ?? ''}, due ${a.dueDate}, ${daysLeft}d, ${a.type})`;
      }).join('\n')
    : '• No pending assignments.';

  const memoryLines = ctx.retrievedMemories.length
    ? ctx.retrievedMemories.slice(0, 4).map((m, i) => `[${i + 1}] ${m.title}\n${m.content.slice(0, 400)}`).join('\n\n')
    : '• No relevant study notes found.';

  const courseLines = ctx.courses.length
    ? ctx.courses.map((c) => `• ${c.name}${c.code ? ` (${c.code})` : ''}${c.creditHours ? `, ${c.creditHours} credits` : ''}`).join('\n')
    : '• No courses enrolled.';

  // Phase B: readiness and risk layers
  const readinessLines = ctx.readiness?.length
    ? ctx.readiness
        .sort((a, b) => a.score - b.score)
        .map((r) => {
          const examNote = r.daysUntilNextExam !== null ? ` · exam in ${r.daysUntilNextExam}d` : '';
          const studyNote = r.studyMinsThisWeek > 0 ? ` · ${r.studyMinsThisWeek}min this week` : ' · no study this week';
          const overdueNote = r.overdueAssignments > 0 ? ` · ${r.overdueAssignments} OVERDUE` : '';
          return `• ${r.courseName}: ${r.score}% [${r.label.toUpperCase()}]${examNote}${studyNote}${overdueNote}\n  → ${r.recommendation}`;
        }).join('\n')
    : '• No readiness data.';

  const riskLines = ctx.risks?.length
    ? ctx.risks
        .map((r) => `• [${r.riskLevel.toUpperCase()}] ${r.courseName}: ${r.reason}\n  Action: ${r.actionRequired}`)
        .join('\n')
    : '• No active academic risks.';

  // Phase B.5: topic weakness map
  const topicLines = ctx.topicWeakness?.length
    ? ctx.topicWeakness
        .sort((a, b) => a.score - b.score)
        .slice(0, 10)
        .map((t) => {
          const bar = t.label === 'unknown' ? '◻◻◻◻◻' :
                      t.label === 'weak'    ? '◼◻◻◻◻' :
                      t.label === 'developing' ? '◼◼◼◻◻' : '◼◼◼◼◼';
          return `• [${t.label.toUpperCase()}] ${t.courseName} → ${t.topicName}: ${t.score}% ${bar} (${t.memoryCount} note${t.memoryCount !== 1 ? 's' : ''})\n  → ${t.recommendation}`;
        }).join('\n')
    : '• No topic-level data yet. Encourage the student to add topics and study notes.';

  return `You are the Learning Agent of LifeOS — an expert study strategist and academic coach.
Your role: optimize how the user learns, prioritizes study, and prepares for exams.
You have access to real readiness scores and risk assessments — use them to give SPECIFIC guidance.

TODAY: ${ctx.todayDate}
STUDY FOCUS THIS WEEK: ${ctx.studyFocusMins} minutes

═══ ENROLLED COURSES ═══
${courseLines}

═══ ACADEMIC READINESS (lowest = most urgent) ═══
${readinessLines}

═══ TOPIC WEAKNESS MAP (lowest mastery = highest priority) ═══
${topicLines}

═══ ACTIVE ACADEMIC RISKS ═══
${riskLines}

═══ UPCOMING EXAMS (sorted by urgency) ═══
${examLines}

═══ PENDING ASSIGNMENTS ═══
${assignmentLines}

═══ RELEVANT STUDY NOTES FROM MEMORY ═══
${memoryLines}

═══ LEARNING RULES ═══
1. Lead with the LOWEST readiness course — name specific topics, not generic advice.
2. If a risk is CRITICAL, make it the first recommendation regardless of what was asked.
3. Recommend spaced repetition for topic-heavy exams — never cramming the night before.
4. When gaps in knowledge are identified, suggest specific retrieval practice techniques.
5. If assignments are overdue, help the user prioritize recovery, not perfection.
6. Study sessions should be 25–50 min with active recall, not passive re-reading.
7. Link study notes from memory to current exam topics when relevant.
8. Reference readiness scores when making recommendations ("your readiness is 38% — you need...").
9. Keep responses tactical — specific hours, specific topics, specific techniques.
10. When topic weakness data is available, name the SPECIFIC weak topic — not just the course.
11. Suggest creating study notes for 'unknown' topics — they have zero mastery signal.
12. For 'weak' topics with an upcoming exam, prescribe active recall: flashcards, practice problems, teach-back.`;
}
