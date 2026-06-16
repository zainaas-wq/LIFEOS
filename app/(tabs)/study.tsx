import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, KeyboardAvoidingView, Platform, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import { getTodayDate } from '../../src/lib/utils';
import { readinessLabelColor, overallAcademicScore } from '../../src/ai/readinessEngine';
import { highestRiskLevel, riskLevelColor } from '../../src/ai/academicRiskEngine';
import { weaknessLabelColor } from '../../src/ai/weaknessEngine';
import type { Course, Assignment, Exam, Topic, AssignmentType, ExamType } from '../../src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const COURSE_COLORS = [
  '#6C8EBF', '#C9A84C', '#4ADE80', '#F472B6',
  '#A78BFA', '#FB923C', '#34D399', '#F87171',
];

const ASSIGNMENT_TYPES: AssignmentType[] = ['homework', 'quiz', 'project', 'lab', 'reading', 'other'];
const EXAM_TYPES: ExamType[]             = ['midterm', 'final', 'quiz', 'practical'];

const PRIORITY_COLOR = { high: '#F87171', medium: '#FB923C', low: Colors.gold };

const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  midterm: 'Midterm', final: 'Final', quiz: 'Quiz', practical: 'Practical',
};

type AddMode = 'course' | 'assignment' | 'exam';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function urgencyColor(days: number): string {
  if (days <= 2)  return '#F87171';
  if (days <= 7)  return '#FB923C';
  if (days <= 14) return Colors.gold;
  return Colors.textMuted;
}

// ─── Command Center ───────────────────────────────────────────────────────────

function CommandCenter({
  courses, exams, assignments, readiness, risks, onAsk,
}: {
  courses: Course[];
  exams: Exam[];
  assignments: Assignment[];
  readiness: ReturnType<typeof useAppStore.getState>['courseReadiness'];
  risks: ReturnType<typeof useAppStore.getState>['academicRisks'];
  onAsk: (prompt: string) => void;
}) {
  const today = getTodayDate();

  const overallScore = useMemo(() => overallAcademicScore(readiness), [readiness]);
  const topRisk = useMemo(() => highestRiskLevel(risks), [risks]);
  const topRiskColor = riskLevelColor(topRisk);

  const nextExam = useMemo(() =>
    exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
    [exams, today],
  );

  const nextAssignment = useMemo(() =>
    assignments.filter((a) => !a.completed && a.dueDate >= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null,
    [assignments, today],
  );

  // Lowest-readiness course as priority
  const priorityCourse = useMemo(() => {
    const vals = Object.values(readiness).sort((a, b) => a.score - b.score);
    return vals[0] ?? null;
  }, [readiness]);

  if (courses.length === 0) return null;

  const criticalRisks = risks.filter((r) => r.riskLevel === 'critical');
  const highRisks     = risks.filter((r) => r.riskLevel === 'high');

  return (
    <View style={cc.container}>
      {/* Header row */}
      <View style={cc.headerRow}>
        <View style={cc.titleBlock}>
          <Text style={cc.label}>COMMAND CENTER</Text>
          <Text style={cc.overallScore}>
            {overallScore}%
            <Text style={cc.overallLabel}> academic readiness</Text>
          </Text>
        </View>
        {topRisk && (
          <View style={[cc.riskBadge, { backgroundColor: topRiskColor + '22', borderColor: topRiskColor + '55' }]}>
            <Text style={[cc.riskBadgeText, { color: topRiskColor }]}>{topRisk.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* Metrics grid */}
      <View style={cc.grid}>
        <View style={cc.metric}>
          <Ionicons name="flag-outline" size={14} color={Colors.gold} />
          <Text style={cc.metricLabel}>Priority</Text>
          <Text style={cc.metricValue} numberOfLines={1}>
            {priorityCourse?.courseName ?? '—'}
          </Text>
          {priorityCourse && (
            <Text style={[cc.metricSub, { color: readinessLabelColor(priorityCourse.label as any) }]}>
              {priorityCourse.score}% · {priorityCourse.label}
            </Text>
          )}
        </View>

        <View style={cc.divider} />

        <View style={cc.metric}>
          <Ionicons name="document-text-outline" size={14} color={Colors.gold} />
          <Text style={cc.metricLabel}>Next Exam</Text>
          {nextExam ? (
            <>
              <Text style={cc.metricValue} numberOfLines={1}>{nextExam.title}</Text>
              <Text style={[cc.metricSub, { color: urgencyColor(daysUntil(nextExam.date)) }]}>
                {daysUntil(nextExam.date)}d away
              </Text>
            </>
          ) : (
            <Text style={cc.metricValue}>None</Text>
          )}
        </View>

        <View style={cc.divider} />

        <View style={cc.metric}>
          <Ionicons name="alarm-outline" size={14} color={Colors.gold} />
          <Text style={cc.metricLabel}>Deadline</Text>
          {nextAssignment ? (
            <>
              <Text style={cc.metricValue} numberOfLines={1}>{nextAssignment.title}</Text>
              <Text style={[cc.metricSub, { color: urgencyColor(daysUntil(nextAssignment.dueDate)) }]}>
                {daysUntil(nextAssignment.dueDate)}d
              </Text>
            </>
          ) : (
            <Text style={cc.metricValue}>Clear</Text>
          )}
        </View>
      </View>

      {/* Risk alerts */}
      {criticalRisks.length > 0 && (
        <TouchableOpacity
          style={[cc.alert, { borderColor: '#F87171' + '55', backgroundColor: '#F87171' + '11' }]}
          onPress={() => onAsk(`Help me prepare for my ${criticalRisks[0].courseName} exam urgently — what should I do right now?`)}
          activeOpacity={0.8}
        >
          <Ionicons name="warning" size={14} color="#F87171" />
          <View style={{ flex: 1 }}>
            <Text style={[cc.alertTitle, { color: '#F87171' }]}>{criticalRisks[0].reason}</Text>
            <Text style={cc.alertSub}>{criticalRisks[0].actionRequired}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="#F87171" />
        </TouchableOpacity>
      )}
      {criticalRisks.length === 0 && highRisks.length > 0 && (
        <TouchableOpacity
          style={[cc.alert, { borderColor: '#FB923C' + '55', backgroundColor: '#FB923C' + '11' }]}
          onPress={() => onAsk(`I have a high risk in ${highRisks[0].courseName}. Help me create a study plan to address it.`)}
          activeOpacity={0.8}
        >
          <Ionicons name="alert-circle-outline" size={14} color="#FB923C" />
          <View style={{ flex: 1 }}>
            <Text style={[cc.alertTitle, { color: '#FB923C' }]}>{highRisks[0].reason}</Text>
            <Text style={cc.alertSub}>{highRisks[0].actionRequired}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="#FB923C" />
        </TouchableOpacity>
      )}

      {/* Ask button */}
      <TouchableOpacity
        style={cc.askBtn}
        onPress={() => onAsk('What should I study today? Give me specific recommendations based on my readiness scores and upcoming exams.')}
        activeOpacity={0.8}
      >
        <Ionicons name="sparkles" size={14} color={Colors.gold} />
        <Text style={cc.askText}>Ask Learning Agent</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.gold} />
      </TouchableOpacity>
    </View>
  );
}

const cc = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  titleBlock: { gap: 2 },
  label: {
    fontSize: FontSize.xs - 1, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  overallScore: {
    fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary,
  },
  overallLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.regular, color: Colors.textMuted },
  riskBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1,
  },
  riskBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  grid: { flexDirection: 'row', padding: Spacing.md, gap: Spacing.xs },
  metric: { flex: 1, gap: 2 },
  metricLabel: {
    fontSize: FontSize.xs - 1, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3,
  },
  metricValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  metricSub:   { fontSize: FontSize.xs - 1, color: Colors.textMuted },
  divider:     { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  alert: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.md, marginBottom: Spacing.xs,
    padding: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1,
  },
  alertTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  alertSub:   { fontSize: FontSize.xs - 1, color: Colors.textMuted, marginTop: 1 },
  askBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  askText: { flex: 1, fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium },
});

// ─── Readiness Bar ────────────────────────────────────────────────────────────

function ReadinessBar({ courseId, courseName, color, readiness }: {
  courseId: string;
  courseName: string;
  color: string;
  readiness: ReturnType<typeof useAppStore.getState>['courseReadiness'];
}) {
  const r = readiness[courseId];
  if (!r) return null;
  const barColor = readinessLabelColor(r.label as any);

  return (
    <View style={rb.row}>
      <View style={rb.nameRow}>
        <View style={[rb.dot, { backgroundColor: color }]} />
        <Text style={rb.name} numberOfLines={1}>{courseName}</Text>
        <Text style={[rb.score, { color: barColor }]}>{r.score}%</Text>
      </View>
      <View style={rb.track}>
        <View style={[rb.fill, { width: `${r.score}%` as any, backgroundColor: barColor }]} />
      </View>
      <Text style={rb.rec} numberOfLines={1}>{r.recommendation}</Text>
    </View>
  );
}

const rb = StyleSheet.create({
  row:     { gap: 4, paddingVertical: Spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  dot:     { width: 7, height: 7, borderRadius: 3.5 },
  name:    { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  score:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  track:   {
    height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceHigh, overflow: 'hidden',
  },
  fill:    { height: '100%', borderRadius: 2 },
  rec:     { fontSize: FontSize.xs - 1, color: Colors.textMuted },
});

// ─── Topic Row ────────────────────────────────────────────────────────────────

function TopicRow({ topic, weakness, onDelete }: {
  topic: Topic;
  weakness: ReturnType<typeof useAppStore.getState>['topicWeakness'];
  onDelete: () => void;
}) {
  const w = weakness[topic.id];
  const color = w ? weaknessLabelColor(w.label) : Colors.textMuted;

  return (
    <View style={tr.row}>
      <View style={tr.body}>
        <Text style={tr.name}>{topic.name}</Text>
        {w && (
          <View style={tr.meta}>
            <Text style={[tr.label, { color }]}>{w.label}</Text>
            <Text style={tr.sep}>·</Text>
            <Text style={tr.score}>{w.score}%</Text>
            <Text style={tr.sep}>·</Text>
            <Text style={tr.notes}>{w.memoryCount} note{w.memoryCount !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>
      {w && (
        <View style={tr.barTrack}>
          <View style={[tr.barFill, { width: `${w.score}%` as any, backgroundColor: color }]} />
        </View>
      )}
      <TouchableOpacity
        onPress={() => Alert.alert('Delete Topic', `Delete "${topic.name}"?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: onDelete },
        ])}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close-circle-outline" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const tr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5 },
  body: { flex: 1 },
  name: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  label: { fontSize: FontSize.xs - 1, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  sep:   { fontSize: FontSize.xs - 1, color: Colors.textMuted },
  score: { fontSize: FontSize.xs - 1, color: Colors.textMuted },
  notes: { fontSize: FontSize.xs - 1, color: Colors.textMuted },
  barTrack: { width: 50, height: 3, borderRadius: 1.5, backgroundColor: Colors.surfaceHigh, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 1.5 },
});

// ─── Save Study Note Modal ────────────────────────────────────────────────────

function SaveNoteModal({
  visible, courseId, courseName, topics, exams, assignments, onClose, onSave,
}: {
  visible: boolean;
  courseId: string;
  courseName: string;
  topics: Topic[];
  exams: import('../../src/types').Exam[];
  assignments: import('../../src/types').Assignment[];
  onClose: () => void;
  onSave: (opts: {
    title: string; content: string; courseId: string;
    topicId?: string; examId?: string; assignmentId?: string;
  }) => void;
}) {
  const [title,        setTitle]     = useState('');
  const [content,      setContent]   = useState('');
  const [error,        setError]     = useState('');
  const [topicId,      setTopicId]   = useState<string | undefined>(undefined);
  const [examId,       setExamId]    = useState<string | undefined>(undefined);
  const [assignmentId, setAsnId]     = useState<string | undefined>(undefined);

  const courseTopics      = topics.filter((t) => t.courseId === courseId);
  const courseExams       = exams.filter((e) => e.courseId === courseId && e.date >= new Date().toISOString().slice(0, 10));
  const courseAssignments = assignments.filter((a) => a.courseId === courseId && !a.completed);

  const reset = () => {
    setTitle(''); setContent(''); setError('');
    setTopicId(undefined); setExamId(undefined); setAsnId(undefined);
  };

  const handleSave = () => {
    if (!title.trim())   { setError('Title is required'); return; }
    if (!content.trim()) { setError('Content is required'); return; }
    onSave({ title: title.trim(), content: content.trim(), courseId, topicId, examId, assignmentId });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={nm.root}>
          <View style={nm.header}>
            <View>
              <Text style={nm.headerTitle}>Save Study Note</Text>
              <Text style={nm.headerSub}>{courseName}</Text>
            </View>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={nm.body} keyboardShouldPersistTaps="handled">
            <Input
              label="Title"
              value={title}
              onChangeText={(t) => { setTitle(t); setError(''); }}
              placeholder="e.g. Java Thread Synchronization notes"
              autoFocus
              error={error && !title.trim() ? error : ''}
            />
            <View>
              <Text style={nm.fieldLabel}>Notes</Text>
              <TextInput
                style={nm.textarea}
                value={content}
                onChangeText={(t) => { setContent(t); setError(''); }}
                placeholder="Write your study notes, key concepts, or lecture summary..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
              />
              {error && content.trim() === '' && <Text style={nm.error}>{error}</Text>}
            </View>

            {/* Link to Topic */}
            {courseTopics.length > 0 && (
              <View>
                <Text style={nm.fieldLabel}>Link to Topic (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                    <TouchableOpacity
                      style={[nm.linkChip, topicId === undefined && nm.linkChipActive]}
                      onPress={() => setTopicId(undefined)}
                    >
                      <Text style={[nm.linkChipText, topicId === undefined && nm.linkChipTextActive]}>None</Text>
                    </TouchableOpacity>
                    {courseTopics.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        style={[nm.linkChip, topicId === t.id && nm.linkChipActive]}
                        onPress={() => setTopicId(t.id)}
                      >
                        <Text style={[nm.linkChipText, topicId === t.id && nm.linkChipTextActive]}>{t.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Link to Exam */}
            {courseExams.length > 0 && (
              <View>
                <Text style={nm.fieldLabel}>Link to Exam (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                    <TouchableOpacity
                      style={[nm.linkChip, examId === undefined && nm.linkChipActive]}
                      onPress={() => setExamId(undefined)}
                    >
                      <Text style={[nm.linkChipText, examId === undefined && nm.linkChipTextActive]}>None</Text>
                    </TouchableOpacity>
                    {courseExams.map((e) => (
                      <TouchableOpacity
                        key={e.id}
                        style={[nm.linkChip, examId === e.id && nm.linkChipActive]}
                        onPress={() => setExamId(e.id)}
                      >
                        <Text style={[nm.linkChipText, examId === e.id && nm.linkChipTextActive]}>{e.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Link to Assignment */}
            {courseAssignments.length > 0 && (
              <View>
                <Text style={nm.fieldLabel}>Link to Assignment (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                    <TouchableOpacity
                      style={[nm.linkChip, assignmentId === undefined && nm.linkChipActive]}
                      onPress={() => setAsnId(undefined)}
                    >
                      <Text style={[nm.linkChipText, assignmentId === undefined && nm.linkChipTextActive]}>None</Text>
                    </TouchableOpacity>
                    {courseAssignments.map((a) => (
                      <TouchableOpacity
                        key={a.id}
                        style={[nm.linkChip, assignmentId === a.id && nm.linkChipActive]}
                        onPress={() => setAsnId(a.id)}
                      >
                        <Text style={[nm.linkChipText, assignmentId === a.id && nm.linkChipTextActive]}>{a.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <Text style={nm.hint}>
              This note enters the Memory Engine with semantic embeddings.
              The Learning Agent uses linked topics, exams, and assignments to give precise study guidance.
            </Text>
          </ScrollView>
          <View style={nm.footer}>
            <Button label="Cancel" onPress={() => { reset(); onClose(); }} variant="secondary" style={{ flex: 1 }} />
            <Button label="Save to Memory" onPress={handleSave} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const nm = StyleSheet.create({
  root:        { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  headerSub:   { fontSize: FontSize.sm, color: Colors.gold, marginTop: 2 },
  body:        { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  fieldLabel: {
    fontSize: FontSize.xs, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs,
  },
  textarea: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.sm, color: Colors.textPrimary,
    minHeight: 140,
  },
  error: { fontSize: FontSize.xs, color: '#F87171', marginTop: 4 },
  hint:  { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18 },
  linkChip: {
    paddingHorizontal: Spacing.sm + 2, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  linkChipActive:    { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  linkChipText:      { fontSize: FontSize.xs, color: Colors.textSecondary },
  linkChipTextActive: { color: Colors.gold, fontWeight: FontWeight.semibold },
  footer: {
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border,
  },
});

// ─── Exam Card ────────────────────────────────────────────────────────────────

function ExamCard({ exam, course, onDelete }: {
  exam: Exam; course?: Course; onDelete: () => void;
}) {
  const days   = daysUntil(exam.date);
  const accent = urgencyColor(days);
  const label  = days < 0 ? 'Passed' : days === 0 ? 'TODAY' : `${days}d`;

  return (
    <View style={[examStyles.card, { borderColor: accent + '44' }]}>
      <View style={[examStyles.bar, { backgroundColor: accent }]} />
      <View style={examStyles.body}>
        <View style={examStyles.row}>
          <View style={[examStyles.typeBadge, { backgroundColor: accent + '22' }]}>
            <Text style={[examStyles.typeText, { color: accent }]}>{EXAM_TYPE_LABEL[exam.type]}</Text>
          </View>
          <View style={[examStyles.countdown, { backgroundColor: accent + '18' }]}>
            <Text style={[examStyles.countdownText, { color: accent }]}>{label}</Text>
          </View>
          <TouchableOpacity
            onPress={() => Alert.alert('Delete Exam', `Delete "${exam.title}"?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: onDelete },
            ])}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={13} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={examStyles.title}>{exam.title}</Text>
        {course && (
          <View style={examStyles.metaRow}>
            <View style={[examStyles.dot, { backgroundColor: course.color }]} />
            <Text style={examStyles.meta}>{course.name}</Text>
            {exam.date && <Text style={examStyles.meta}>· {exam.date}</Text>}
            {exam.location && <Text style={examStyles.meta}>· {exam.location}</Text>}
          </View>
        )}
        {exam.topics.length > 0 && (
          <View style={examStyles.topicsRow}>
            {exam.topics.slice(0, 4).map((t, i) => (
              <View key={i} style={examStyles.topicChip}>
                <Text style={examStyles.topicText}>{t}</Text>
              </View>
            ))}
            {exam.topics.length > 4 && (
              <Text style={examStyles.topicMore}>+{exam.topics.length - 4}</Text>
            )}
          </View>
        )}
        {exam.prepProgress !== undefined && (
          <View style={examStyles.prepRow}>
            <View style={examStyles.prepTrack}>
              <View style={[examStyles.prepFill, { width: `${exam.prepProgress}%` as any, backgroundColor: accent }]} />
            </View>
            <Text style={[examStyles.prepPct, { color: accent }]}>{exam.prepProgress}%</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const examStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.sm,
  },
  bar:  { width: 3 },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.xs },
  row:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  typeText:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  countdown: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full },
  countdownText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot:  { width: 6, height: 6, borderRadius: 3 },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted },
  topicsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  topicChip: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full,
  },
  topicText: { fontSize: FontSize.xs - 1, color: Colors.textSecondary },
  topicMore: { fontSize: FontSize.xs - 1, color: Colors.textMuted, alignSelf: 'center' },
  prepRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: 2 },
  prepTrack: { flex: 1, height: 4, backgroundColor: Colors.surfaceHigh, borderRadius: 2, overflow: 'hidden' },
  prepFill:  { height: '100%', borderRadius: 2 },
  prepPct:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, minWidth: 30, textAlign: 'right' },
});

// ─── Assignment Row ───────────────────────────────────────────────────────────

function AssignmentRow({ assignment, course, onToggle, onDelete }: {
  assignment: Assignment; course?: Course;
  onToggle: () => void; onDelete: () => void;
}) {
  const days   = daysUntil(assignment.dueDate);
  const accent = assignment.completed ? Colors.textMuted : PRIORITY_COLOR[assignment.priority];

  return (
    <View style={asgStyles.row}>
      <TouchableOpacity
        style={[asgStyles.check, assignment.completed && { backgroundColor: Colors.success + '22', borderColor: Colors.success }]}
        onPress={onToggle}
      >
        {assignment.completed && <Ionicons name="checkmark" size={12} color={Colors.success} />}
      </TouchableOpacity>
      <View style={asgStyles.body}>
        <Text style={[asgStyles.title, assignment.completed && asgStyles.done]} numberOfLines={1}>
          {assignment.title}
        </Text>
        <View style={asgStyles.meta}>
          {course && (
            <>
              <View style={[asgStyles.dot, { backgroundColor: course.color }]} />
              <Text style={asgStyles.metaText}>{course.name}</Text>
              <Text style={asgStyles.sep}>·</Text>
            </>
          )}
          <Text style={asgStyles.metaText}>{assignment.type}</Text>
          <Text style={asgStyles.sep}>·</Text>
          <Text style={[asgStyles.due, { color: assignment.completed ? Colors.textMuted : urgencyColor(days) }]}>
            {days < 0 ? 'Overdue' : days === 0 ? 'Today' : `${days}d`}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => Alert.alert('Delete', `Delete "${assignment.title}"?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: onDelete },
        ])}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={13} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const asgStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  check: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  body:     { flex: 1 },
  title:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  done:     { textDecorationLine: 'line-through', color: Colors.textMuted },
  meta:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  dot:      { width: 5, height: 5, borderRadius: 2.5 },
  metaText: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'capitalize' },
  sep:      { fontSize: FontSize.xs, color: Colors.textMuted },
  due:      { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
});

// ─── Course Row ───────────────────────────────────────────────────────────────

function CourseRow({ course, assignmentCount, examCount, readiness, topics, topicWeakness, onDelete, onSaveNote, onAddTopic, onDeleteTopic }: {
  course: Course;
  assignmentCount: number;
  examCount: number;
  readiness: ReturnType<typeof useAppStore.getState>['courseReadiness'];
  topics: Topic[];
  topicWeakness: ReturnType<typeof useAppStore.getState>['topicWeakness'];
  onDelete: () => void;
  onSaveNote: () => void;
  onAddTopic: (name: string) => void;
  onDeleteTopic: (id: string) => void;
}) {
  const r = readiness[course.id];
  const labelColor = r ? readinessLabelColor(r.label as any) : Colors.textMuted;
  const [expanded, setExpanded] = useState(false);
  const [addingTopic, setAddingTopic] = useState(false);
  const [topicInput, setTopicInput] = useState('');

  const submitTopic = () => {
    const name = topicInput.trim();
    if (!name) return;
    onAddTopic(name);
    setTopicInput('');
    setAddingTopic(false);
  };

  return (
    <View style={cStyles.wrapper}>
      <View style={cStyles.row}>
        <View style={[cStyles.swatch, { backgroundColor: course.color }]} />
        <View style={cStyles.body}>
          <Text style={cStyles.name}>{course.name}</Text>
          <View style={cStyles.meta}>
            {course.code && <Text style={cStyles.code}>{course.code}</Text>}
            {course.code && <Text style={cStyles.sep}>·</Text>}
            <Text style={cStyles.stat}>{assignmentCount} tasks</Text>
            <Text style={cStyles.sep}>·</Text>
            <Text style={cStyles.stat}>{examCount} exams</Text>
            <Text style={cStyles.sep}>·</Text>
            <Text style={cStyles.stat}>{topics.length} topics</Text>
            {r && (
              <>
                <Text style={cStyles.sep}>·</Text>
                <Text style={[cStyles.stat, { color: labelColor }]}>{r.score}%</Text>
              </>
            )}
          </View>
        </View>
        <TouchableOpacity
          onPress={onSaveNote}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginRight: Spacing.xs }}
        >
          <Ionicons name="create-outline" size={16} color={Colors.gold} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginRight: Spacing.xs }}
        >
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Alert.alert('Delete Course', `Delete "${course.name}" and all its data?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onDelete },
          ])}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {r && (
        <View style={cStyles.readinessRow}>
          <View style={cStyles.readinessTrack}>
            <View style={[cStyles.readinessFill, { width: `${r.score}%` as any, backgroundColor: labelColor }]} />
          </View>
          <Text style={[cStyles.readinessLabel, { color: labelColor }]}>{r.label}</Text>
        </View>
      )}

      {expanded && (
        <View style={cStyles.topicSection}>
          <View style={cStyles.topicHeader}>
            <Text style={cStyles.topicTitle}>Topics & Mastery</Text>
            <TouchableOpacity onPress={() => setAddingTopic((v) => !v)}>
              <Ionicons name="add-circle-outline" size={16} color={Colors.gold} />
            </TouchableOpacity>
          </View>
          {addingTopic && (
            <View style={cStyles.topicInput}>
              <TextInput
                style={cStyles.topicField}
                value={topicInput}
                onChangeText={setTopicInput}
                placeholder="Topic name (e.g. Thread Synchronization)"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                onSubmitEditing={submitTopic}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={submitTopic} style={cStyles.topicAdd}>
                <Ionicons name="checkmark" size={16} color={Colors.gold} />
              </TouchableOpacity>
            </View>
          )}
          {topics.length === 0 ? (
            <Text style={cStyles.noTopics}>
              Add topics to track mastery per concept — the Learning Agent will reason at this level.
            </Text>
          ) : (
            topics.map((t) => (
              <TopicRow key={t.id} topic={t} weakness={topicWeakness} onDelete={() => onDeleteTopic(t.id)} />
            ))
          )}
        </View>
      )}
    </View>
  );
}

const cStyles = StyleSheet.create({
  wrapper: {
    gap: 6, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  row:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  body:   { flex: 1 },
  name:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  meta:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  code:   { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.medium },
  sep:    { fontSize: FontSize.xs, color: Colors.textMuted },
  stat:   { fontSize: FontSize.xs, color: Colors.textMuted },
  readinessRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingLeft: Spacing.lg },
  readinessTrack: {
    flex: 1, height: 3, borderRadius: 1.5,
    backgroundColor: Colors.surfaceHigh, overflow: 'hidden',
  },
  readinessFill: { height: '100%', borderRadius: 1.5 },
  readinessLabel: { fontSize: FontSize.xs - 1, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  topicSection: { paddingLeft: Spacing.lg, paddingTop: Spacing.xs, gap: 2 },
  topicHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  topicTitle:   { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  topicInput:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  topicField: {
    flex: 1, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    fontSize: FontSize.sm, color: Colors.textPrimary,
  },
  topicAdd: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center',
  },
  noTopics: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18, paddingVertical: Spacing.xs },
});

// ─── Add Modal ────────────────────────────────────────────────────────────────

function AddModal({
  visible, onClose, courses, defaultMode,
  onAddCourse, onAddAssignment, onAddExam,
}: {
  visible: boolean;
  onClose: () => void;
  courses: Course[];
  defaultMode: AddMode;
  onAddCourse:     (c: Omit<Course,     'id' | 'createdAt'>) => void;
  onAddAssignment: (a: Omit<Assignment, 'id' | 'createdAt' | 'completed'>) => void;
  onAddExam:       (e: Omit<Exam,       'id' | 'createdAt'>) => void;
}) {
  const [mode, setMode] = useState<AddMode>(defaultMode);

  const [cName, setCName]         = useState('');
  const [cCode, setCCode]         = useState('');
  const [cInstructor, setCInst]   = useState('');
  const [cColor, setCColor]       = useState(COURSE_COLORS[0]);

  const [aTitle, setATitle]       = useState('');
  const [aCourseId, setACourse]   = useState(courses[0]?.id ?? '');
  const [aType, setAType]         = useState<AssignmentType>('homework');
  const [aDueDate, setADue]       = useState('');
  const [aMins, setAMins]         = useState('');
  const [aPriority, setAPriority] = useState<'high'|'medium'|'low'>('medium');

  const [eTitle, setETitle]       = useState('');
  const [eCourseId, setECourse]   = useState(courses[0]?.id ?? '');
  const [eType, setEType]         = useState<ExamType>('midterm');
  const [eDate, setEDate]         = useState('');
  const [eTime, setETime]         = useState('');
  const [eLocation, setELoc]      = useState('');
  const [eTopics, setETopics]     = useState('');

  const [error, setError]         = useState('');

  const reset = () => {
    setCName(''); setCCode(''); setCInst(''); setCColor(COURSE_COLORS[0]);
    setATitle(''); setACourse(courses[0]?.id ?? ''); setAType('homework');
    setADue(''); setAMins(''); setAPriority('medium');
    setETitle(''); setECourse(courses[0]?.id ?? ''); setEType('midterm');
    setEDate(''); setETime(''); setELoc(''); setETopics('');
    setError('');
  };

  const handleSave = () => {
    if (mode === 'course') {
      if (!cName.trim()) { setError('Course name is required'); return; }
      onAddCourse({ name: cName.trim(), code: cCode.trim() || undefined, instructor: cInstructor.trim() || undefined, color: cColor });
    } else if (mode === 'assignment') {
      if (!aTitle.trim()) { setError('Title is required'); return; }
      if (!aDueDate.match(/^\d{4}-\d{2}-\d{2}$/)) { setError('Due date must be YYYY-MM-DD'); return; }
      if (!aCourseId) { setError('Select a course'); return; }
      onAddAssignment({
        courseId: aCourseId, title: aTitle.trim(), type: aType,
        dueDate: aDueDate, estimatedMins: aMins ? parseInt(aMins) : undefined,
        priority: aPriority,
      });
    } else {
      if (!eTitle.trim()) { setError('Exam title is required'); return; }
      if (!eDate.match(/^\d{4}-\d{2}-\d{2}$/)) { setError('Date must be YYYY-MM-DD'); return; }
      if (!eCourseId) { setError('Select a course'); return; }
      onAddExam({
        courseId: eCourseId, title: eTitle.trim(), type: eType,
        date: eDate, time: eTime.trim() || undefined,
        location: eLocation.trim() || undefined,
        topics: eTopics.split(',').map((t) => t.trim()).filter(Boolean),
      });
    }
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={mStyles.root}>
          <View style={mStyles.header}>
            <Text style={mStyles.headerTitle}>Add New</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={mStyles.tabs}>
            {(['course', 'assignment', 'exam'] as AddMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[mStyles.tab, mode === m && mStyles.tabActive]}
                onPress={() => { setMode(m); setError(''); }}
              >
                <Text style={[mStyles.tabText, mode === m && mStyles.tabTextActive]}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={mStyles.body} keyboardShouldPersistTaps="handled">

            {mode === 'course' && (
              <>
                <Input label="Course Name" value={cName} onChangeText={(t) => { setCName(t); setError(''); }}
                  placeholder="e.g. Data Structures" autoFocus error={error} />
                <Input label="Course Code (optional)" value={cCode} onChangeText={setCCode}
                  placeholder="e.g. CS201" />
                <Input label="Instructor (optional)" value={cInstructor} onChangeText={setCInst}
                  placeholder="e.g. Dr. Smith" />
                <View>
                  <Text style={mStyles.fieldLabel}>Color</Text>
                  <View style={mStyles.colorGrid}>
                    {COURSE_COLORS.map((col) => (
                      <TouchableOpacity
                        key={col}
                        style={[mStyles.colorSwatch, { backgroundColor: col },
                          cColor === col && mStyles.colorSwatchActive]}
                        onPress={() => setCColor(col)}
                      >
                        {cColor === col && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </>
            )}

            {mode === 'assignment' && (
              courses.length === 0 ? (
                <View style={mStyles.noCourses}>
                  <Ionicons name="book-outline" size={28} color={Colors.textMuted} />
                  <Text style={mStyles.noCoursesText}>Add a course first</Text>
                </View>
              ) : (
                <>
                  <Input label="Title" value={aTitle} onChangeText={(t) => { setATitle(t); setError(''); }}
                    placeholder="e.g. Chapter 5 Problems" autoFocus error={error} />
                  <View>
                    <Text style={mStyles.fieldLabel}>Course</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={mStyles.hScroll}>
                      {courses.map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          style={[mStyles.chip, aCourseId === c.id && { borderColor: c.color, backgroundColor: c.color + '22' }]}
                          onPress={() => setACourse(c.id)}
                        >
                          <View style={[mStyles.chipDot, { backgroundColor: c.color }]} />
                          <Text style={[mStyles.chipText, aCourseId === c.id && { color: c.color }]}>{c.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  <View>
                    <Text style={mStyles.fieldLabel}>Type</Text>
                    <View style={mStyles.typeRow}>
                      {ASSIGNMENT_TYPES.map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[mStyles.typeChip, aType === t && mStyles.typeChipActive]}
                          onPress={() => setAType(t)}
                        >
                          <Text style={[mStyles.typeChipText, aType === t && mStyles.typeChipTextActive]}>{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <Input label="Due Date" value={aDueDate} onChangeText={setADue}
                    placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
                  <Input label="Estimated Time (minutes)" value={aMins} onChangeText={setAMins}
                    placeholder="e.g. 90" keyboardType="number-pad" />
                  <View>
                    <Text style={mStyles.fieldLabel}>Priority</Text>
                    <View style={mStyles.priorityRow}>
                      {(['high', 'medium', 'low'] as const).map((p) => (
                        <TouchableOpacity
                          key={p}
                          style={[mStyles.priorityChip, aPriority === p && { borderColor: PRIORITY_COLOR[p], backgroundColor: PRIORITY_COLOR[p] + '22' }]}
                          onPress={() => setAPriority(p)}
                        >
                          <Text style={[mStyles.priorityText, aPriority === p && { color: PRIORITY_COLOR[p] }]}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              )
            )}

            {mode === 'exam' && (
              courses.length === 0 ? (
                <View style={mStyles.noCourses}>
                  <Ionicons name="book-outline" size={28} color={Colors.textMuted} />
                  <Text style={mStyles.noCoursesText}>Add a course first</Text>
                </View>
              ) : (
                <>
                  <Input label="Exam Title" value={eTitle} onChangeText={(t) => { setETitle(t); setError(''); }}
                    placeholder="e.g. Midterm Exam" autoFocus error={error} />
                  <View>
                    <Text style={mStyles.fieldLabel}>Course</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={mStyles.hScroll}>
                      {courses.map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          style={[mStyles.chip, eCourseId === c.id && { borderColor: c.color, backgroundColor: c.color + '22' }]}
                          onPress={() => setECourse(c.id)}
                        >
                          <View style={[mStyles.chipDot, { backgroundColor: c.color }]} />
                          <Text style={[mStyles.chipText, eCourseId === c.id && { color: c.color }]}>{c.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  <View>
                    <Text style={mStyles.fieldLabel}>Exam Type</Text>
                    <View style={mStyles.typeRow}>
                      {EXAM_TYPES.map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[mStyles.typeChip, eType === t && mStyles.typeChipActive]}
                          onPress={() => setEType(t)}
                        >
                          <Text style={[mStyles.typeChipText, eType === t && mStyles.typeChipTextActive]}>
                            {EXAM_TYPE_LABEL[t]}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <Input label="Date" value={eDate} onChangeText={setEDate}
                    placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
                  <Input label="Time (optional)" value={eTime} onChangeText={setETime} placeholder="e.g. 09:00" />
                  <Input label="Location (optional)" value={eLocation} onChangeText={setELoc} placeholder="e.g. Room 204" />
                  <Input label="Topics (comma-separated)" value={eTopics} onChangeText={setETopics}
                    placeholder="e.g. Arrays, Recursion, Trees"
                    hint="Helps the Learning Agent quiz you on the right content" />
                </>
              )
            )}
          </ScrollView>

          <View style={mStyles.footer}>
            <Button label="Cancel" onPress={() => { reset(); onClose(); }} variant="secondary" style={{ flex: 1 }} />
            <Button label={`Add ${mode.charAt(0).toUpperCase() + mode.slice(1)}`} onPress={handleSave} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.gold },
  tabText:       { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  tabTextActive: { color: Colors.gold, fontWeight: FontWeight.bold },
  body: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  fieldLabel: {
    fontSize: FontSize.xs, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs,
  },
  colorGrid:   { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  colorSwatch: { width: 32, height: 32, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  colorSwatchActive: { borderWidth: 2, borderColor: Colors.textPrimary },
  hScroll: { marginBottom: Spacing.xs },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated, marginRight: Spacing.xs,
  },
  chipDot:  { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  typeRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  typeChip: {
    paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  typeChipActive:     { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  typeChipText:       { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'capitalize' },
  typeChipTextActive: { color: Colors.gold, fontWeight: FontWeight.semibold },
  priorityRow: { flexDirection: 'row', gap: Spacing.sm },
  priorityChip: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  priorityText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  noCourses:     { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
  noCoursesText: { fontSize: FontSize.md, color: Colors.textMuted },
  footer: {
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function StudyScreen() {
  const courses          = useAppStore((s) => s.courses);
  const assignments      = useAppStore((s) => s.assignments);
  const exams            = useAppStore((s) => s.exams);
  const topics           = useAppStore((s) => s.topics);
  const courseReadiness  = useAppStore((s) => s.courseReadiness);
  const academicRisks    = useAppStore((s) => s.academicRisks);
  const topicWeakness    = useAppStore((s) => s.topicWeakness);
  const addCourse        = useAppStore((s) => s.addCourse);
  const addAssignment    = useAppStore((s) => s.addAssignment);
  const addExam          = useAppStore((s) => s.addExam);
  const addTopic         = useAppStore((s) => s.addTopic);
  const deleteTopic      = useAppStore((s) => s.deleteTopic);
  const toggleAssignment = useAppStore((s) => s.toggleAssignment);
  const deleteAssignment = useAppStore((s) => s.deleteAssignment);
  const deleteExam       = useAppStore((s) => s.deleteExam);
  const deleteCourse     = useAppStore((s) => s.deleteCourse);
  const addLocalMemory   = useAppStore((s) => s.addLocalMemory);
  const setPendingCoachMessage = useAppStore((s) => s.setPendingCoachMessage);

  const [modalVisible, setModalVisible] = useState(false);
  const [addMode, setAddMode]           = useState<AddMode>('course');
  const [noteModal, setNoteModal]       = useState<{ courseId: string; courseName: string } | null>(null);

  const today = getTodayDate();

  const upcomingExams = useMemo(() =>
    exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    [exams, today],
  );

  const dueSoon = useMemo(() => {
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in7Str = in7.toISOString().slice(0, 10);
    return assignments
      .filter((a) => !a.completed && a.dueDate <= in7Str && a.dueDate >= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.priority === 'high' ? -1 : 1));
  }, [assignments, today]);

  const overdue = useMemo(() =>
    assignments.filter((a) => !a.completed && a.dueDate < today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [assignments, today],
  );

  const handlePrompt = useCallback((prompt: string) => {
    setPendingCoachMessage(prompt);
    router.push('/(tabs)/ai' as any);
  }, [setPendingCoachMessage]);

  const courseMap = useMemo(() => {
    const m: Record<string, Course> = {};
    courses.forEach((c) => { m[c.id] = c; });
    return m;
  }, [courses]);

  const openAdd = (mode: AddMode) => { setAddMode(mode); setModalVisible(true); };

  const handleSaveNote = useCallback((opts: {
    title: string; content: string; courseId: string;
    topicId?: string; examId?: string; assignmentId?: string;
  }) => {
    const course = courseMap[opts.courseId];
    addLocalMemory({
      title:   opts.title,
      content: opts.content,
      source:  'knowledge',
      tags:    course ? [course.name, ...(course.code ? [course.code] : [])] : [],
      linkedCourseId:     opts.courseId,
      linkedTopicId:      opts.topicId,
      linkedExamId:       opts.examId,
      linkedAssignmentId: opts.assignmentId,
    });
  }, [addLocalMemory, courseMap]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.screenLabel}>Student Intelligence</Text>
            <Text style={s.screenTitle}>Study</Text>
          </View>
          <View style={s.headerActions}>
            <TouchableOpacity style={s.addBtn} onPress={() => openAdd('exam')} activeOpacity={0.7}>
              <Ionicons name="document-text-outline" size={18} color={Colors.gold} />
            </TouchableOpacity>
            <TouchableOpacity style={s.addBtn} onPress={() => openAdd('assignment')} activeOpacity={0.7}>
              <Ionicons name="checkbox-outline" size={18} color={Colors.gold} />
            </TouchableOpacity>
            <TouchableOpacity style={s.addBtn} onPress={() => openAdd('course')} activeOpacity={0.7}>
              <Ionicons name="add" size={22} color={Colors.gold} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Stats strip ─────────────────────────────────────────────────── */}
        {courses.length > 0 && (
          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={s.statNum}>{courses.length}</Text>
              <Text style={s.statLabel}>Courses</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.stat}>
              <Text style={s.statNum}>{assignments.filter((a) => !a.completed).length}</Text>
              <Text style={s.statLabel}>Pending</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.stat}>
              <Text style={[s.statNum, upcomingExams.length > 0 && { color: urgencyColor(daysUntil(upcomingExams[0].date)) }]}>
                {upcomingExams.length > 0 ? `${daysUntil(upcomingExams[0].date)}d` : '—'}
              </Text>
              <Text style={s.statLabel}>Next Exam</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.stat}>
              <Text style={[s.statNum, overdue.length > 0 && { color: '#F87171' }]}>
                {overdue.length}
              </Text>
              <Text style={s.statLabel}>Overdue</Text>
            </View>
          </View>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {courses.length === 0 && (
          <Card elevated style={s.emptyCard}>
            <Ionicons name="school-outline" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>Set up Student Intelligence</Text>
            <Text style={s.emptyText}>
              Add your courses, then track assignments and exams.{'\n'}
              The Learning Agent will analyze your readiness and guide you.
            </Text>
            <Button label="Add First Course" onPress={() => openAdd('course')} size="sm" />
          </Card>
        )}

        {/* ── Command Center ───────────────────────────────────────────────── */}
        {courses.length > 0 && (
          <CommandCenter
            courses={courses}
            exams={exams}
            assignments={assignments}
            readiness={courseReadiness}
            risks={academicRisks}
            onAsk={handlePrompt}
          />
        )}

        {/* ── Upcoming Exams ───────────────────────────────────────────────── */}
        {upcomingExams.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Upcoming Exams</Text>
              <TouchableOpacity onPress={() => openAdd('exam')}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.gold} />
              </TouchableOpacity>
            </View>
            {upcomingExams.map((exam) => (
              <ExamCard key={exam.id} exam={exam} course={courseMap[exam.courseId]} onDelete={() => deleteExam(exam.id)} />
            ))}
          </View>
        )}

        {/* ── Overdue ──────────────────────────────────────────────────────── */}
        {overdue.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, { color: '#F87171' }]}>Overdue</Text>
              <Text style={s.sectionCount}>{overdue.length}</Text>
            </View>
            <Card elevated>
              {overdue.map((a) => (
                <AssignmentRow key={a.id} assignment={a} course={courseMap[a.courseId]}
                  onToggle={() => toggleAssignment(a.id)} onDelete={() => deleteAssignment(a.id)} />
              ))}
            </Card>
          </View>
        )}

        {/* ── Due This Week ────────────────────────────────────────────────── */}
        {dueSoon.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Due This Week</Text>
              <TouchableOpacity onPress={() => openAdd('assignment')}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.gold} />
              </TouchableOpacity>
            </View>
            <Card elevated>
              {dueSoon.map((a) => (
                <AssignmentRow key={a.id} assignment={a} course={courseMap[a.courseId]}
                  onToggle={() => toggleAssignment(a.id)} onDelete={() => deleteAssignment(a.id)} />
              ))}
            </Card>
          </View>
        )}

        {/* ── Courses + Readiness ──────────────────────────────────────────── */}
        {courses.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Courses & Readiness</Text>
              <TouchableOpacity onPress={() => openAdd('course')}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.gold} />
              </TouchableOpacity>
            </View>
            <Card elevated>
              {courses.map((c) => (
                <CourseRow
                  key={c.id}
                  course={c}
                  assignmentCount={assignments.filter((a) => a.courseId === c.id).length}
                  examCount={exams.filter((e) => e.courseId === c.id).length}
                  readiness={courseReadiness}
                  topics={topics.filter((t) => t.courseId === c.id)}
                  topicWeakness={topicWeakness}
                  onDelete={() => deleteCourse(c.id)}
                  onSaveNote={() => setNoteModal({ courseId: c.id, courseName: c.name })}
                  onAddTopic={(name) => addTopic({ courseId: c.id, name })}
                  onDeleteTopic={deleteTopic}
                />
              ))}
            </Card>
          </View>
        )}

      </ScrollView>

      <AddModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        courses={courses}
        defaultMode={addMode}
        onAddCourse={addCourse}
        onAddAssignment={addAssignment}
        onAddExam={addExam}
      />

      {noteModal && (
        <SaveNoteModal
          visible={!!noteModal}
          courseId={noteModal.courseId}
          courseName={noteModal.courseName}
          topics={topics}
          exams={exams}
          assignments={assignments}
          onClose={() => setNoteModal(null)}
          onSave={handleSaveNote}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  screenLabel: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  screenTitle:   { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: Spacing.xs, marginTop: 4 },
  addBtn: {
    width: 36, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },

  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
  },
  stat:    { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs - 1, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  statDiv: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },

  emptyCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  emptyText:  { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },

  section:       { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle:  {
    fontSize: FontSize.xs, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, fontWeight: FontWeight.semibold,
  },
  sectionCount: {
    fontSize: FontSize.xs, color: '#F87171',
    fontWeight: FontWeight.bold, backgroundColor: '#F8717122',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.full,
  },
});
