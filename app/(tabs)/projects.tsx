import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, KeyboardAvoidingView, Platform, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import { healthLabelColor, highestProjectRisk, overallProjectScore } from '../../src/ai/projectIntelligenceEngine';
import type {
  Project, Milestone, ProjectStatus, MilestoneStatus, ProjectHealth,
} from '../../src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_COLORS = [
  '#C9A84C', '#6C8EBF', '#4ADE80', '#F472B6',
  '#A78BFA', '#FB923C', '#34D399', '#F87171',
];

const STATUS_COLOR: Record<ProjectStatus, string> = {
  active:    Colors.gold,
  paused:    '#6B7280',
  completed: '#4ADE80',
  cancelled: '#F87171',
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active:    'Active',
  paused:    'Paused',
  completed: 'Done',
  cancelled: 'Cancelled',
};

const MS_STATUS_COLOR: Record<MilestoneStatus, string> = {
  pending:     Colors.border,
  in_progress: Colors.gold,
  completed:   Colors.success,
  blocked:     '#F87171',
};

const MS_STATUS_ICON: Record<MilestoneStatus, keyof typeof Ionicons.glyphMap> = {
  pending:     'ellipse-outline',
  in_progress: 'time-outline',
  completed:   'checkmark-circle',
  blocked:     'ban-outline',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - today.getTime()) / 86_400_000);
}

function urgencyColor(days: number): string {
  if (days <= 3)  return '#F87171';
  if (days <= 7)  return '#FB923C';
  if (days <= 14) return Colors.gold;
  return Colors.textMuted;
}

// ─── Command Center ───────────────────────────────────────────────────────────

function CommandCenter({
  projectIntelligence, projectRisks, projects, milestones, onAsk,
}: {
  projectIntelligence: ReturnType<typeof useAppStore.getState>['projectIntelligence'];
  projectRisks:        ReturnType<typeof useAppStore.getState>['projectRisks'];
  projects:            Project[];
  milestones:          Milestone[];
  onAsk:               (prompt: string) => void;
}) {
  const overall    = overallProjectScore(projectIntelligence);
  const topRisk    = highestProjectRisk(projectRisks);
  const topRiskColor = topRisk
    ? (topRisk === 'critical' ? '#F87171' : topRisk === 'high' ? '#FB923C' : Colors.gold)
    : Colors.textMuted;

  const worstProject = useMemo(() =>
    Object.values(projectIntelligence).sort((a, b) => a.healthScore - b.healthScore)[0] ?? null,
    [projectIntelligence],
  );

  const stalledMs = useMemo(() =>
    milestones
      .filter((m) => m.status !== 'completed')
      .sort((a, b) => {
        const pa = projectIntelligence[a.projectId];
        const pb = projectIntelligence[b.projectId];
        const da = pa?.daysSinceActivity ?? 0;
        const db = pb?.daysSinceActivity ?? 0;
        return db - da;
      })[0] ?? null,
    [milestones, projectIntelligence],
  );

  const nextDeadlineProject = useMemo(() =>
    projects
      .filter((p) => p.status === 'active' && p.deadline)
      .sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0] ?? null,
    [projects],
  );

  const criticalRisks = projectRisks.filter((r) => r.riskLevel === 'critical');
  const highRisks     = projectRisks.filter((r) => r.riskLevel === 'high');

  if (projects.filter((p) => p.status === 'active').length === 0) return null;

  return (
    <View style={cc.container}>
      <View style={cc.headerRow}>
        <View style={cc.titleBlock}>
          <Text style={cc.label}>COMMAND CENTER</Text>
          <Text style={cc.overallScore}>
            {overall}%
            <Text style={cc.overallLabel}> portfolio health</Text>
          </Text>
        </View>
        {topRisk && (
          <View style={[cc.riskBadge, { backgroundColor: topRiskColor + '22', borderColor: topRiskColor + '55' }]}>
            <Text style={[cc.riskBadgeText, { color: topRiskColor }]}>{topRisk.toUpperCase()}</Text>
          </View>
        )}
      </View>

      <View style={cc.grid}>
        <View style={cc.metric}>
          <Ionicons name="warning-outline" size={14} color="#F87171" />
          <Text style={cc.metricLabel}>Highest Risk</Text>
          {worstProject ? (
            <>
              <Text style={cc.metricValue} numberOfLines={1}>{worstProject.projectName}</Text>
              <Text style={[cc.metricSub, { color: healthLabelColor(worstProject.healthLabel as any) }]}>
                {worstProject.healthScore}% · {worstProject.healthLabel}
              </Text>
            </>
          ) : (
            <Text style={cc.metricValue}>—</Text>
          )}
        </View>

        <View style={cc.divider} />

        <View style={cc.metric}>
          <Ionicons name="pause-circle-outline" size={14} color="#FB923C" />
          <Text style={cc.metricLabel}>Stalled</Text>
          {stalledMs ? (
            <>
              <Text style={cc.metricValue} numberOfLines={1}>{stalledMs.title}</Text>
              <Text style={cc.metricSub}>
                {projectIntelligence[stalledMs.projectId]?.projectName ?? ''}
              </Text>
            </>
          ) : (
            <Text style={cc.metricValue}>None</Text>
          )}
        </View>

        <View style={cc.divider} />

        <View style={cc.metric}>
          <Ionicons name="time-outline" size={14} color={Colors.gold} />
          <Text style={cc.metricLabel}>Next Deadline</Text>
          {nextDeadlineProject ? (
            <>
              <Text style={cc.metricValue} numberOfLines={1}>{nextDeadlineProject.title}</Text>
              <Text style={[cc.metricSub, { color: urgencyColor(daysUntil(nextDeadlineProject.deadline!)) }]}>
                {daysUntil(nextDeadlineProject.deadline!)}d left
              </Text>
            </>
          ) : (
            <Text style={cc.metricValue}>Clear</Text>
          )}
        </View>
      </View>

      {criticalRisks.length > 0 && (
        <TouchableOpacity
          style={[cc.alert, { borderColor: '#F87171' + '55', backgroundColor: '#F87171' + '11' }]}
          onPress={() => onAsk(`What is blocking ${criticalRisks[0].projectName} and what should I do right now?`)}
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
          onPress={() => onAsk(`${highRisks[0].projectName} has a high risk: ${highRisks[0].reason}. Help me address it.`)}
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

      <TouchableOpacity
        style={cc.askBtn}
        onPress={() => onAsk('What should I work on next across all my projects? Give me a prioritized recommendation based on health scores, blockers, and deadlines.')}
        activeOpacity={0.8}
      >
        <Ionicons name="sparkles" size={14} color={Colors.gold} />
        <Text style={cc.askText}>Ask Builder Agent</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.gold} />
      </TouchableOpacity>
    </View>
  );
}

const cc = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  titleBlock:    { gap: 2 },
  label: {
    fontSize: FontSize.xs - 1, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  overallScore:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  overallLabel:  { fontSize: FontSize.sm, fontWeight: FontWeight.regular, color: Colors.textMuted },
  riskBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1,
  },
  riskBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  grid:    { flexDirection: 'row', padding: Spacing.md, gap: Spacing.xs },
  metric:  { flex: 1, gap: 2 },
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
  alertTitle:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  alertSub:    { fontSize: FontSize.xs - 1, color: Colors.textMuted, marginTop: 1 },
  askBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  askText: { flex: 1, fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium },
});

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ score, color, size = 36 }: { score: number; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[ringS.track, { width: size, height: size, borderRadius: size / 2, borderColor: color + '33' }]}>
        <Text style={[ringS.pct, { fontSize: size < 40 ? FontSize.xs - 1 : FontSize.xs, color }]}>{score}%</Text>
      </View>
    </View>
  );
}

const ringS = StyleSheet.create({
  track: { borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  pct:   { fontWeight: FontWeight.bold },
});

// ─── Milestone Row ────────────────────────────────────────────────────────────

function MilestoneRow({ milestone, onToggle, onDelete }: {
  milestone: Milestone; onToggle: () => void; onDelete: () => void;
}) {
  const accent = MS_STATUS_COLOR[milestone.status];
  const done   = milestone.status === 'completed';

  return (
    <View style={msS.row}>
      <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name={MS_STATUS_ICON[milestone.status]} size={18} color={accent} />
      </TouchableOpacity>
      <View style={msS.body}>
        <Text style={[msS.title, done && msS.done]} numberOfLines={1}>{milestone.title}</Text>
        <View style={msS.meta}>
          {milestone.dueDate && (
            <Text style={[msS.metaText, { color: done ? Colors.textMuted : urgencyColor(daysUntil(milestone.dueDate)) }]}>
              Due {milestone.dueDate}
            </Text>
          )}
          {milestone.estimatedHours && <Text style={msS.metaText}>· ~{milestone.estimatedHours}h</Text>}
          {milestone.status === 'blocked' && <Text style={[msS.metaText, { color: '#F87171' }]}>· Blocked</Text>}
          {milestone.status === 'in_progress' && <Text style={[msS.metaText, { color: Colors.gold }]}>· In progress</Text>}
        </View>
      </View>
      <TouchableOpacity
        onPress={() => Alert.alert('Delete', `Delete "${milestone.title}"?`, [
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

const msS = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  body:     { flex: 1 },
  title:    { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  done:     { textDecorationLine: 'line-through', color: Colors.textMuted },
  meta:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  metaText: { fontSize: FontSize.xs, color: Colors.textMuted },
});

// ─── Save Project Note Modal ──────────────────────────────────────────────────

function SaveNoteModal({
  visible, projectId, projectName, milestones, onClose, onSave,
}: {
  visible:     boolean;
  projectId:   string;
  projectName: string;
  milestones:  Milestone[];
  onClose:     () => void;
  onSave:      (opts: { title: string; content: string; projectId: string; milestoneId?: string }) => void;
}) {
  const [title,       setTitle]       = useState('');
  const [content,     setContent]     = useState('');
  const [milestoneId, setMilestoneId] = useState<string | undefined>(undefined);
  const [error,       setError]       = useState('');

  const active = milestones.filter((m) => m.status !== 'completed');

  const reset = () => { setTitle(''); setContent(''); setMilestoneId(undefined); setError(''); };

  const handleSave = () => {
    if (!title.trim())   { setError('Title is required'); return; }
    if (!content.trim()) { setError('Notes are required'); return; }
    onSave({ title: title.trim(), content: content.trim(), projectId, milestoneId });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={snm.root}>
          <View style={snm.header}>
            <View>
              <Text style={snm.title}>Save Project Note</Text>
              <Text style={snm.sub}>{projectName}</Text>
            </View>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={snm.body} keyboardShouldPersistTaps="handled">
            <Input label="Title" value={title} onChangeText={(t) => { setTitle(t); setError(''); }}
              placeholder="e.g. Architecture Decision: Supabase vs Firebase" autoFocus error={error} />
            <View>
              <Text style={snm.fieldLabel}>Notes</Text>
              <TextInput
                style={snm.textarea}
                value={content}
                onChangeText={(t) => { setContent(t); setError(''); }}
                placeholder="Document decisions, research findings, meeting notes, blockers..."
                placeholderTextColor={Colors.textMuted}
                multiline numberOfLines={8} textAlignVertical="top"
              />
              {error && !content.trim() && <Text style={snm.error}>{error}</Text>}
            </View>

            {active.length > 0 && (
              <View>
                <Text style={snm.fieldLabel}>Link to Milestone (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                    <TouchableOpacity
                      style={[snm.chip, milestoneId === undefined && snm.chipActive]}
                      onPress={() => setMilestoneId(undefined)}
                    >
                      <Text style={[snm.chipText, milestoneId === undefined && snm.chipTextActive]}>None</Text>
                    </TouchableOpacity>
                    {active.map((m) => (
                      <TouchableOpacity
                        key={m.id}
                        style={[snm.chip, milestoneId === m.id && snm.chipActive]}
                        onPress={() => setMilestoneId(m.id)}
                      >
                        <Text style={[snm.chipText, milestoneId === m.id && snm.chipTextActive]}>{m.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <Text style={snm.hint}>
              This note enters the Memory Engine with semantic embeddings.
              The Builder Agent uses it to answer questions about your project's decisions and context.
            </Text>
          </ScrollView>
          <View style={snm.footer}>
            <Button label="Cancel" onPress={() => { reset(); onClose(); }} variant="secondary" style={{ flex: 1 }} />
            <Button label="Save to Memory" onPress={handleSave} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const snm = StyleSheet.create({
  root:  { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  sub:    { fontSize: FontSize.sm, color: Colors.gold, marginTop: 2 },
  body:   { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  fieldLabel: {
    fontSize: FontSize.xs, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs,
  },
  textarea: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.sm, color: Colors.textPrimary, minHeight: 140,
  },
  error:        { fontSize: FontSize.xs, color: '#F87171', marginTop: 4 },
  hint:         { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18 },
  chip:         { paddingHorizontal: Spacing.sm + 2, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceElevated },
  chipActive:   { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  chipText:     { fontSize: FontSize.xs, color: Colors.textSecondary },
  chipTextActive: { color: Colors.gold, fontWeight: FontWeight.semibold },
  footer: {
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border,
  },
});

// ─── Recommendation Reasons ───────────────────────────────────────────────────

function RecommendationReasons({ intel }: { intel: ReturnType<typeof useAppStore.getState>['projectIntelligence'][string] }) {
  const reasons: string[] = [];

  if (intel.blockedCount > 0)
    reasons.push(`${intel.blockedCount} milestone${intel.blockedCount > 1 ? 's' : ''} blocked`);
  if (intel.overdueCount > 0)
    reasons.push(`${intel.overdueCount} milestone${intel.overdueCount > 1 ? 's' : ''} overdue`);
  if (intel.daysSinceActivity > 7)
    reasons.push(`${intel.daysSinceActivity}d without activity`);
  if (intel.deadlineRisk === 'critical')
    reasons.push(`deadline in ${intel.daysUntilDeadline}d`);
  else if (intel.deadlineRisk === 'high')
    reasons.push(`deadline approaching (${intel.daysUntilDeadline}d)`);
  if (intel.healthScore < 40)
    reasons.push(`health score ${intel.healthScore}%`);

  if (reasons.length === 0) return null;

  return (
    <View style={rrS.row}>
      <Ionicons name="information-circle-outline" size={11} color={Colors.textMuted} />
      <Text style={rrS.text}>Because: {reasons.join(' · ')}</Text>
    </View>
  );
}

const rrS = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  text: {
    fontSize: FontSize.xs - 1,
    color: Colors.textMuted,
    lineHeight: 16,
    flex: 1,
  },
});

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project, health, intelligence, milestones, goals,
  onEdit, onDelete, onAddMilestone, onToggleMilestone, onDeleteMilestone, onSaveNote,
}: {
  project:    Project;
  health:     ProjectHealth;
  intelligence: ReturnType<typeof useAppStore.getState>['projectIntelligence'][string] | undefined;
  milestones: Milestone[];
  goals:      Array<{ id: string; title: string }>;
  onEdit:             () => void;
  onDelete:           () => void;
  onAddMilestone:     () => void;
  onToggleMilestone:  (id: string) => void;
  onDeleteMilestone:  (id: string) => void;
  onSaveNote:         () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color  = project.color;
  const sCo    = STATUS_COLOR[project.status];
  const isDone = project.status === 'completed' || project.status === 'cancelled';
  const sorted = [...milestones].sort((a, b) => a.order - b.order);

  const intel       = intelligence;
  const healthColor = intel ? healthLabelColor(intel.healthLabel as any) : color;

  const daysLeft = project.deadline ? daysUntil(project.deadline) : null;
  const deadlineColor = daysLeft !== null ? urgencyColor(daysLeft) : Colors.textMuted;

  const linkedGoal = goals.find((g) => g.id === project.goalId);

  return (
    <View style={[pcS.card, intel?.healthLabel === 'critical' && { borderColor: '#F87171' + '44' }, intel?.healthLabel === 'at-risk' && { borderColor: '#FB923C' + '33' }]}>
      <View style={[pcS.bar, { backgroundColor: color }]} />
      <View style={pcS.body}>

        {/* Header */}
        <View style={pcS.header}>
          <View style={pcS.headerLeft}>
            <Text style={[pcS.title, isDone && pcS.titleDim]} numberOfLines={1}>{project.title}</Text>
            <View style={[pcS.statusBadge, { backgroundColor: sCo + '22', borderColor: sCo + '44' }]}>
              <Text style={[pcS.statusText, { color: sCo }]}>{STATUS_LABEL[project.status]}</Text>
            </View>
          </View>
          <View style={pcS.headerRight}>
            {intel && intel.totalCount > 0 && (
              <ProgressRing score={intel.healthScore} color={healthColor} />
            )}
            <TouchableOpacity onPress={onSaveNote} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="create-outline" size={14} color={Colors.gold} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="pencil-outline" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert('Delete Project', `Delete "${project.title}" and all its milestones?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: onDelete },
              ])}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {project.description ? <Text style={pcS.desc} numberOfLines={2}>{project.description}</Text> : null}

        {/* Intelligence row */}
        {intel && (
          <View style={pcS.intelRow}>
            <View style={[pcS.intelBadge, { backgroundColor: healthColor + '18', borderColor: healthColor + '44' }]}>
              <Text style={[pcS.intelText, { color: healthColor }]}>{intel.healthLabel.toUpperCase()}</Text>
            </View>
            {intel.totalCount > 0 && (
              <Text style={pcS.intelMeta}>{intel.completedCount}/{intel.totalCount} done</Text>
            )}
            {intel.velocity > 0 && (
              <Text style={pcS.intelMeta}>· {intel.velocity.toFixed(1)}/week</Text>
            )}
            {intel.blockedCount > 0 && (
              <Text style={[pcS.intelMeta, { color: '#F87171' }]}>· {intel.blockedCount} blocked</Text>
            )}
            {daysLeft !== null && (
              <Text style={[pcS.intelMeta, { color: deadlineColor }]}>· {daysLeft}d left</Text>
            )}
            {linkedGoal && (
              <Text style={pcS.intelMeta}>· {linkedGoal.title}</Text>
            )}
          </View>
        )}

        {/* Progress bar */}
        {health.totalCount > 0 && (
          <View style={pcS.track}>
            <View style={[pcS.fill, { width: `${Math.round(health.progress * 100)}%` as any, backgroundColor: isDone ? Colors.success : healthColor }]} />
          </View>
        )}

        {/* Recommendation + AI Explanation */}
        {intel && intel.recommendation && (
          <View style={pcS.recommendationBlock}>
            <Text style={pcS.recommendation}>→ {intel.recommendation}</Text>
            <RecommendationReasons intel={intel} />
          </View>
        )}

        {/* Stagnation / stalled warning (from old ProjectHealth) */}
        {health.isStalled && !intel?.recommendation && (
          <View style={pcS.stalledRow}>
            <Ionicons name="pause-circle-outline" size={13} color="#FB923C" />
            <Text style={pcS.stalledText}>{health.stalledReason}</Text>
          </View>
        )}

        {/* Expand/collapse milestones */}
        {health.totalCount > 0 && (
          <TouchableOpacity style={pcS.expandRow} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
            <Text style={pcS.expandText}>{expanded ? 'Hide' : 'Show'} milestones</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={Colors.textMuted} />
          </TouchableOpacity>
        )}

        {expanded && (
          <View style={pcS.milestones}>
            {sorted.map((m) => (
              <MilestoneRow
                key={m.id} milestone={m}
                onToggle={() => onToggleMilestone(m.id)}
                onDelete={() => onDeleteMilestone(m.id)}
              />
            ))}
            <TouchableOpacity style={pcS.addMs} onPress={onAddMilestone}>
              <Ionicons name="add-circle-outline" size={14} color={Colors.gold} />
              <Text style={pcS.addMsText}>Add milestone</Text>
            </TouchableOpacity>
          </View>
        )}

        {health.totalCount === 0 && (
          <TouchableOpacity style={pcS.addMs} onPress={onAddMilestone}>
            <Ionicons name="add-circle-outline" size={14} color={color} />
            <Text style={[pcS.addMsText, { color }]}>Add first milestone</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const pcS = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden', marginBottom: Spacing.sm,
  },
  bar:  { width: 3 },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  header:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft:  { flex: 1, gap: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginLeft: Spacing.sm },
  title:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  titleDim:    { color: Colors.textSecondary },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  statusText:  { fontSize: FontSize.xs - 1, fontWeight: FontWeight.semibold, letterSpacing: 0.5 },
  desc:        { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },
  intelRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  intelBadge:  { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  intelText:   { fontSize: FontSize.xs - 1, fontWeight: FontWeight.bold, letterSpacing: 0.4 },
  intelMeta:   { fontSize: FontSize.xs, color: Colors.textMuted },
  track:       { height: 3, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, overflow: 'hidden' },
  fill:        { height: '100%', borderRadius: Radius.full },
  recommendationBlock: { gap: 2 },
  recommendation: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 17 },
  stalledRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  stalledText: { fontSize: FontSize.xs, color: '#FB923C', flex: 1 },
  expandRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  expandText:  { fontSize: FontSize.xs, color: Colors.textMuted },
  milestones:  { gap: 0, paddingTop: Spacing.xs },
  addMs:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: Spacing.sm },
  addMsText:   { fontSize: FontSize.sm, color: Colors.gold },
});

// ─── Add Modal ────────────────────────────────────────────────────────────────

type ModalMode = 'project' | 'milestone';

function AddModal({
  visible, defaultMode, projectId, nextOrder, goals, onClose, onAddProject, onAddMilestone,
}: {
  visible:        boolean;
  defaultMode:    ModalMode;
  projectId?:     string;
  nextOrder:      number;
  goals:          Array<{ id: string; title: string }>;
  onClose:        () => void;
  onAddProject:   (p: any) => void;
  onAddMilestone: (m: any) => void;
}) {
  const [mode, setMode] = useState<ModalMode>(defaultMode);

  const [pTitle,  setPTitle]  = useState('');
  const [pDesc,   setPDesc]   = useState('');
  const [pColor,  setPColor]  = useState(PROJECT_COLORS[0]);
  const [pStatus, setPStatus] = useState<ProjectStatus>('active');
  const [pDL,     setPDL]     = useState('');
  const [pGoal,   setPGoal]   = useState('');

  const [mTitle,  setMTitle]  = useState('');
  const [mStatus, setMStatus] = useState<MilestoneStatus>('pending');
  const [mDue,    setMDue]    = useState('');
  const [mHours,  setMHours]  = useState('');

  const [error, setError] = useState('');

  const reset = () => {
    setPTitle(''); setPDesc(''); setPColor(PROJECT_COLORS[0]); setPStatus('active'); setPDL(''); setPGoal('');
    setMTitle(''); setMStatus('pending'); setMDue(''); setMHours(''); setError('');
  };

  const handleSave = () => {
    if (mode === 'project') {
      if (!pTitle.trim()) { setError('Project title is required'); return; }
      onAddProject({
        title: pTitle.trim(), description: pDesc.trim() || undefined,
        color: pColor, status: pStatus,
        deadline: pDL.match(/^\d{4}-\d{2}-\d{2}$/) ? pDL : undefined,
        goalId: pGoal || undefined,
      });
    } else {
      if (!mTitle.trim()) { setError('Milestone title is required'); return; }
      onAddMilestone({
        projectId: projectId!, title: mTitle.trim(), status: mStatus,
        dueDate: mDue.match(/^\d{4}-\d{2}-\d{2}$/) ? mDue : undefined,
        estimatedHours: mHours ? parseFloat(mHours) : undefined,
        order: nextOrder,
      });
    }
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={modalS.root}>
          <View style={modalS.header}>
            <Text style={modalS.headerTitle}>Add New</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {!projectId && (
            <View style={modalS.tabs}>
              {(['project', 'milestone'] as ModalMode[]).map((m) => (
                <TouchableOpacity key={m} style={[modalS.tab, mode === m && modalS.tabActive]}
                  onPress={() => { setMode(m); setError(''); }}>
                  <Text style={[modalS.tabText, mode === m && modalS.tabTextActive]}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <ScrollView contentContainerStyle={modalS.body} keyboardShouldPersistTaps="handled">
            {mode === 'project' && (
              <>
                <Input label="Project Title" value={pTitle}
                  onChangeText={(t) => { setPTitle(t); setError(''); }}
                  placeholder="e.g. Build Portfolio Website" autoFocus error={error} />
                <Input label="Description (optional)" value={pDesc}
                  onChangeText={setPDesc} placeholder="What is this project about?" />
                <View>
                  <Text style={modalS.fieldLabel}>Color</Text>
                  <View style={modalS.colorGrid}>
                    {PROJECT_COLORS.map((col) => (
                      <TouchableOpacity key={col}
                        style={[modalS.colorSwatch, { backgroundColor: col }, pColor === col && modalS.colorSwatchActive]}
                        onPress={() => setPColor(col)}>
                        {pColor === col && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View>
                  <Text style={modalS.fieldLabel}>Status</Text>
                  <View style={modalS.chipRow}>
                    {(['active', 'paused'] as ProjectStatus[]).map((st) => (
                      <TouchableOpacity key={st}
                        style={[modalS.chip, pStatus === st && { borderColor: STATUS_COLOR[st], backgroundColor: STATUS_COLOR[st] + '22' }]}
                        onPress={() => setPStatus(st)}>
                        <Text style={[modalS.chipText, pStatus === st && { color: STATUS_COLOR[st] }]}>
                          {STATUS_LABEL[st]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <Input label="Deadline (optional)" value={pDL} onChangeText={setPDL}
                  placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
                {goals.length > 0 && (
                  <View>
                    <Text style={modalS.fieldLabel}>Link to Goal (optional)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing.xs }}>
                      <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                        <TouchableOpacity
                          style={[modalS.chip, !pGoal && { borderColor: Colors.gold, backgroundColor: Colors.goldMuted }]}
                          onPress={() => setPGoal('')}>
                          <Text style={[modalS.chipText, !pGoal && { color: Colors.gold }]}>None</Text>
                        </TouchableOpacity>
                        {goals.map((g) => (
                          <TouchableOpacity key={g.id}
                            style={[modalS.chip, pGoal === g.id && { borderColor: Colors.gold, backgroundColor: Colors.goldMuted }]}
                            onPress={() => setPGoal(g.id)}>
                            <Text style={[modalS.chipText, pGoal === g.id && { color: Colors.gold }]} numberOfLines={1}>
                              {g.title}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}
              </>
            )}

            {mode === 'milestone' && (
              <>
                <Input label="Milestone Title" value={mTitle}
                  onChangeText={(t) => { setMTitle(t); setError(''); }}
                  placeholder="e.g. Complete authentication flow" autoFocus error={error} />
                <View>
                  <Text style={modalS.fieldLabel}>Status</Text>
                  <View style={modalS.chipRow}>
                    {(['pending', 'in_progress', 'blocked'] as MilestoneStatus[]).map((st) => (
                      <TouchableOpacity key={st}
                        style={[modalS.chip, mStatus === st && { borderColor: MS_STATUS_COLOR[st], backgroundColor: MS_STATUS_COLOR[st] + '22' }]}
                        onPress={() => setMStatus(st)}>
                        <Text style={[modalS.chipText, mStatus === st && { color: MS_STATUS_COLOR[st] }]}>
                          {st.replace('_', ' ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <Input label="Due Date (optional)" value={mDue} onChangeText={setMDue}
                  placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
                <Input label="Estimated Hours (optional)" value={mHours} onChangeText={setMHours}
                  placeholder="e.g. 4" keyboardType="decimal-pad" />
              </>
            )}
          </ScrollView>

          <View style={modalS.footer}>
            <Button label="Cancel" onPress={() => { reset(); onClose(); }} variant="secondary" style={{ flex: 1 }} />
            <Button label={mode === 'project' ? 'Add Project' : 'Add Milestone'} onPress={handleSave} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Edit Project Modal ───────────────────────────────────────────────────────

function EditProjectModal({ project, goals, onClose, onSave }: {
  project: Project;
  goals:   Array<{ id: string; title: string }>;
  onClose: () => void;
  onSave:  (patch: Partial<Project>) => void;
}) {
  const [title,    setTitle]    = useState(project.title);
  const [desc,     setDesc]     = useState(project.description ?? '');
  const [color,    setColor]    = useState(project.color);
  const [status,   setStatus]   = useState<ProjectStatus>(project.status);
  const [deadline, setDeadline] = useState(project.deadline ?? '');
  const [error,    setError]    = useState('');

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={modalS.root}>
          <View style={modalS.header}>
            <Text style={modalS.headerTitle}>Edit Project</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={modalS.body} keyboardShouldPersistTaps="handled">
            <Input label="Title" value={title}
              onChangeText={(t) => { setTitle(t); setError(''); }} autoFocus error={error} />
            <Input label="Description (optional)" value={desc} onChangeText={setDesc} />
            <View>
              <Text style={modalS.fieldLabel}>Color</Text>
              <View style={modalS.colorGrid}>
                {PROJECT_COLORS.map((col) => (
                  <TouchableOpacity key={col}
                    style={[modalS.colorSwatch, { backgroundColor: col }, color === col && modalS.colorSwatchActive]}
                    onPress={() => setColor(col)}>
                    {color === col && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View>
              <Text style={modalS.fieldLabel}>Status</Text>
              <View style={modalS.chipRow}>
                {(['active', 'paused', 'completed', 'cancelled'] as ProjectStatus[]).map((st) => (
                  <TouchableOpacity key={st}
                    style={[modalS.chip, status === st && { borderColor: STATUS_COLOR[st], backgroundColor: STATUS_COLOR[st] + '22' }]}
                    onPress={() => setStatus(st)}>
                    <Text style={[modalS.chipText, status === st && { color: STATUS_COLOR[st] }]}>{STATUS_LABEL[st]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Input label="Deadline (optional)" value={deadline} onChangeText={setDeadline}
              placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
          </ScrollView>
          <View style={modalS.footer}>
            <Button label="Cancel" onPress={onClose} variant="secondary" style={{ flex: 1 }} />
            <Button label="Save Changes" style={{ flex: 1 }}
              onPress={() => {
                if (!title.trim()) { setError('Title is required'); return; }
                onSave({
                  title: title.trim(), description: desc.trim() || undefined,
                  color, status,
                  deadline: deadline.match(/^\d{4}-\d{2}-\d{2}$/) ? deadline : undefined,
                });
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalS = StyleSheet.create({
  root:          { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  tabs:          { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab:           { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: Colors.gold },
  tabText:       { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  tabTextActive: { color: Colors.gold, fontWeight: FontWeight.bold },
  body:          { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  fieldLabel: {
    fontSize: FontSize.xs, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs,
  },
  colorGrid:         { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  colorSwatch:       { width: 32, height: 32, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  colorSwatchActive: { borderWidth: 2, borderColor: Colors.textPrimary },
  chipRow:           { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  chipText: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'capitalize' },
  footer: {
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProjectsScreen() {
  const projects             = useAppStore((s) => s.projects);
  const milestones           = useAppStore((s) => s.milestones);
  const goals                = useAppStore((s) => s.goals);
  const projectIntelligence  = useAppStore((s) => s.projectIntelligence);
  const projectRisks         = useAppStore((s) => s.projectRisks);
  const addProject           = useAppStore((s) => s.addProject);
  const updateProject        = useAppStore((s) => s.updateProject);
  const deleteProject        = useAppStore((s) => s.deleteProject);
  const addMilestone         = useAppStore((s) => s.addMilestone);
  const toggleMilestone      = useAppStore((s) => s.toggleMilestone);
  const deleteMilestone      = useAppStore((s) => s.deleteMilestone);
  const getProjectHealth     = useAppStore((s) => s.getProjectHealth);
  const getStalledProjects   = useAppStore((s) => s.getStalledProjects);
  const addLocalMemory       = useAppStore((s) => s.addLocalMemory);
  const setPendingCoachMessage = useAppStore((s) => s.setPendingCoachMessage);

  const [modalVisible,   setModalVisible]   = useState(false);
  const [modalMode,      setModalMode]      = useState<ModalMode>('project');
  const [activeProjId,   setActiveProjId]   = useState<string | undefined>();
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [noteModal,      setNoteModal]      = useState<{ projectId: string; projectName: string } | null>(null);

  const healthMap = useMemo(() => {
    const m: Record<string, ProjectHealth> = {};
    projects.forEach((p) => { m[p.id] = getProjectHealth(p.id); });
    return m;
  }, [projects, milestones]);

  const stalledProjects  = useMemo(() => getStalledProjects(), [projects, milestones]);
  const activeProjects   = projects.filter((p) => p.status === 'active');
  const pausedProjects   = projects.filter((p) => p.status === 'paused');
  const doneProjects     = projects.filter((p) => p.status === 'completed' || p.status === 'cancelled');
  const totalMsDone      = milestones.filter((m) => m.status === 'completed').length;

  const handlePrompt = useCallback((prompt: string) => {
    setPendingCoachMessage(prompt);
    router.push('/(tabs)/coach' as any);
  }, [setPendingCoachMessage]);

  const goalOptions = goals.map((g) => ({ id: g.id, title: g.title }));

  const handleSaveNote = useCallback((opts: { title: string; content: string; projectId: string; milestoneId?: string }) => {
    const project = projects.find((p) => p.id === opts.projectId);
    addLocalMemory({
      title:   opts.title,
      content: opts.content,
      source:  'knowledge',
      tags:    project ? [project.title, 'project'] : ['project'],
      linkedProjectId:   opts.projectId,
      linkedMilestoneId: opts.milestoneId,
    });
  }, [addLocalMemory, projects]);

  const nextOrder = (projectId: string) =>
    milestones.filter((m) => m.projectId === projectId).length;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.screenLabel}>Project Intelligence</Text>
            <Text style={s.screenTitle}>Projects</Text>
          </View>
          <TouchableOpacity style={s.addBtn} onPress={() => { setModalMode('project'); setActiveProjId(undefined); setModalVisible(true); }} activeOpacity={0.7}>
            <Ionicons name="add" size={22} color={Colors.gold} />
          </TouchableOpacity>
        </View>

        {/* ── Stats strip ─────────────────────────────────────────────────── */}
        {projects.length > 0 && (
          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={s.statNum}>{activeProjects.length}</Text>
              <Text style={s.statLabel}>Active</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.stat}>
              <Text style={s.statNum}>{totalMsDone}</Text>
              <Text style={s.statLabel}>Done</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.stat}>
              <Text style={[s.statNum, stalledProjects.length > 0 && { color: '#FB923C' }]}>
                {stalledProjects.length}
              </Text>
              <Text style={s.statLabel}>Stalled</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.stat}>
              <Text style={s.statNum}>{doneProjects.length}</Text>
              <Text style={s.statLabel}>Shipped</Text>
            </View>
          </View>
        )}

        {/* ── Command Center ───────────────────────────────────────────────── */}
        {activeProjects.length > 0 && (
          <CommandCenter
            projectIntelligence={projectIntelligence}
            projectRisks={projectRisks}
            projects={projects}
            milestones={milestones}
            onAsk={handlePrompt}
          />
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {projects.length === 0 && (
          <Card elevated style={s.emptyCard}>
            <Ionicons name="git-branch-outline" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>Start your first project</Text>
            <Text style={s.emptyText}>
              Break big goals into projects and milestones.{'\n'}
              LifeOS tracks health, velocity, and blockers.
            </Text>
            <Button label="Add First Project" onPress={() => { setModalMode('project'); setActiveProjId(undefined); setModalVisible(true); }} size="sm" />
          </Card>
        )}

        {/* ── Active Projects ──────────────────────────────────────────────── */}
        {activeProjects.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Active Projects</Text>
            {activeProjects.map((p) => (
              <ProjectCard
                key={p.id} project={p}
                health={healthMap[p.id]}
                intelligence={projectIntelligence[p.id]}
                milestones={milestones.filter((m) => m.projectId === p.id)}
                goals={goalOptions}
                onEdit={() => setEditingProject(p)}
                onDelete={() => deleteProject(p.id)}
                onAddMilestone={() => { setModalMode('milestone'); setActiveProjId(p.id); setModalVisible(true); }}
                onToggleMilestone={toggleMilestone}
                onDeleteMilestone={deleteMilestone}
                onSaveNote={() => setNoteModal({ projectId: p.id, projectName: p.title })}
              />
            ))}
          </View>
        )}

        {/* ── Paused ───────────────────────────────────────────────────────── */}
        {pausedProjects.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Paused</Text>
            {pausedProjects.map((p) => (
              <ProjectCard
                key={p.id} project={p}
                health={healthMap[p.id]}
                intelligence={projectIntelligence[p.id]}
                milestones={milestones.filter((m) => m.projectId === p.id)}
                goals={goalOptions}
                onEdit={() => setEditingProject(p)}
                onDelete={() => deleteProject(p.id)}
                onAddMilestone={() => { setModalMode('milestone'); setActiveProjId(p.id); setModalVisible(true); }}
                onToggleMilestone={toggleMilestone}
                onDeleteMilestone={deleteMilestone}
                onSaveNote={() => setNoteModal({ projectId: p.id, projectName: p.title })}
              />
            ))}
          </View>
        )}

        {/* ── Completed / Cancelled ────────────────────────────────────────── */}
        {doneProjects.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Completed / Cancelled</Text>
            {doneProjects.map((p) => (
              <ProjectCard
                key={p.id} project={p}
                health={healthMap[p.id]}
                intelligence={projectIntelligence[p.id]}
                milestones={milestones.filter((m) => m.projectId === p.id)}
                goals={goalOptions}
                onEdit={() => setEditingProject(p)}
                onDelete={() => deleteProject(p.id)}
                onAddMilestone={() => { setModalMode('milestone'); setActiveProjId(p.id); setModalVisible(true); }}
                onToggleMilestone={toggleMilestone}
                onDeleteMilestone={deleteMilestone}
                onSaveNote={() => setNoteModal({ projectId: p.id, projectName: p.title })}
              />
            ))}
          </View>
        )}

      </ScrollView>

      <AddModal
        visible={modalVisible} defaultMode={modalMode}
        projectId={activeProjId}
        nextOrder={activeProjId ? nextOrder(activeProjId) : 0}
        goals={goalOptions}
        onClose={() => setModalVisible(false)}
        onAddProject={addProject}
        onAddMilestone={addMilestone}
      />

      {editingProject && (
        <EditProjectModal
          project={editingProject} goals={goalOptions}
          onClose={() => setEditingProject(null)}
          onSave={(patch) => { updateProject(editingProject.id, patch); setEditingProject(null); }}
        />
      )}

      {noteModal && (
        <SaveNoteModal
          visible={!!noteModal}
          projectId={noteModal.projectId}
          projectName={noteModal.projectName}
          milestones={milestones.filter((m) => m.projectId === noteModal.projectId)}
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
  screenLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  screenTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 2 },
  addBtn: {
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },

  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  stat:     { flex: 1, alignItems: 'center', gap: 3 },
  statNum:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs - 1, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  statDiv:  { width: 1, backgroundColor: Colors.border, marginVertical: 4 },

  emptyCard:  { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  emptyText:  { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },

  section:      { gap: Spacing.xs },
  sectionTitle: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, fontWeight: FontWeight.semibold,
  },
});
