import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Goal, GoalIntelligence, GoalRiskLevel } from '../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

interface GoalCardProps {
  goal: Goal;
  allocatedMins?: number;
  intelligence?: GoalIntelligence;
  onEdit: () => void;
  onDelete: () => void;
}

const CATEGORY_ICON: Record<Goal['category'], keyof typeof Ionicons.glyphMap> = {
  study:  'book-outline',
  skill:  'code-slash-outline',
  health: 'fitness-outline',
  life:   'heart-outline',
  career: 'briefcase-outline',
};

const CATEGORY_COLOR: Record<Goal['category'], string> = {
  study:  '#6C8EBF',
  skill:  Colors.gold,
  health: '#4ADE80',
  life:   '#F472B6',
  career: '#A78BFA',
};

const PRIORITY_LABEL: Record<number, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Medium',
  4: 'Low',
  5: 'Optional',
};

const RISK_COLOR: Record<GoalRiskLevel, string> = {
  'on-track': '#4ADE80',
  'at-risk':  '#FB923C',
  'critical': '#F87171',
  'stalled':  '#6B7280',
};

const RISK_LABEL: Record<GoalRiskLevel, string> = {
  'on-track': 'On Track',
  'at-risk':  'At Risk',
  'critical': 'Critical',
  'stalled':  'Stalled',
};

const RISK_ICON: Record<GoalRiskLevel, keyof typeof Ionicons.glyphMap> = {
  'on-track': 'checkmark-circle-outline',
  'at-risk':  'warning-outline',
  'critical': 'flash',
  'stalled':  'pause-circle-outline',
};

export function GoalCard({ goal, allocatedMins = 0, intelligence, onEdit, onDelete }: GoalCardProps) {
  const color      = CATEGORY_COLOR[goal.category];
  const neededMins = Math.round(goal.weeklyHoursTarget * 60);
  const pct        = neededMins > 0 ? Math.min(1, allocatedMins / neededMins) : 0;
  const allocatedHrs = (allocatedMins / 60).toFixed(1);
  const neededHrs    = goal.weeklyHoursTarget.toFixed(1);

  const hasIntel   = !!intelligence;
  const riskLevel  = intelligence?.riskLevel ?? 'on-track';
  const riskColor  = RISK_COLOR[riskLevel];
  const prob       = intelligence?.probability ?? null;

  return (
    <View style={[
      styles.container,
      hasIntel && riskLevel !== 'on-track' && { borderColor: riskColor + '55' },
    ]}>
      <View style={[styles.accent, { backgroundColor: color }]} />

      <View style={styles.body}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={[styles.iconBadge, { backgroundColor: color + '22' }]}>
            <Ionicons name={CATEGORY_ICON[goal.category]} size={14} color={color} />
          </View>
          <Text style={styles.title} numberOfLines={1}>{goal.title}</Text>

          {/* Probability badge */}
          {prob !== null && (
            <View style={[styles.probBadge, { backgroundColor: riskColor + '22', borderColor: riskColor + '44' }]}>
              <Text style={[styles.probText, { color: riskColor }]}>{prob}%</Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity onPress={onEdit} style={styles.actionBtn}>
              <Ionicons name="pencil-outline" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={styles.actionBtn}>
              <Ionicons name="trash-outline" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Risk badge row — only shown when intelligence available */}
        {hasIntel && (
          <View style={styles.riskRow}>
            <View style={[styles.riskBadge, { backgroundColor: riskColor + '18', borderColor: riskColor + '40' }]}>
              <Ionicons name={RISK_ICON[riskLevel]} size={10} color={riskColor} />
              <Text style={[styles.riskLabel, { color: riskColor }]}>{RISK_LABEL[riskLevel]}</Text>
            </View>
            <Text style={styles.riskReason} numberOfLines={1}>{intelligence!.riskReason}</Text>
          </View>
        )}

        {/* Meta */}
        <View style={styles.metaRow}>
          <Text style={[styles.priorityTag, { color }]}>
            P{goal.priority} · {PRIORITY_LABEL[goal.priority] ?? 'Custom'}
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.meta}>{goal.category}</Text>
          {goal.deadline ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.meta}>Due {goal.deadline}</Text>
            </>
          ) : null}
        </View>

        {/* Progress bar */}
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(pct * 100)}%` as any, backgroundColor: color },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {allocatedHrs}h / {neededHrs}h
          </Text>
        </View>

        {/* Weekly hours logged — shown when intelligence available */}
        {hasIntel && intelligence!.weeklyHoursLogged > 0 && (
          <View style={styles.activityRow}>
            <Ionicons name="flash-outline" size={11} color={Colors.textMuted} />
            <Text style={styles.activityText}>
              {intelligence!.weeklyHoursLogged.toFixed(1)}h logged this week
              {intelligence!.inTodaysPlan ? ' · In today\'s plan' : ''}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  accent: { width: 3 },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.xs },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconBadge: {
    width: 26, height: 26, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },

  probBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1,
  },
  probText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  actions:   { flexDirection: 'row', gap: Spacing.xs },
  actionBtn: { padding: 4 },

  riskRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  riskBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing.xs + 2, paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1,
  },
  riskLabel:  { fontSize: FontSize.xs - 1, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  riskReason: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  priorityTag: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  dot:  { color: Colors.textMuted, fontSize: FontSize.xs },
  meta: { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'capitalize' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
  progressTrack: {
    flex: 1, height: 3, backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.full, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: Radius.full },
  progressLabel: { fontSize: FontSize.xs, color: Colors.textMuted, minWidth: 60, textAlign: 'right' },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activityText: { fontSize: FontSize.xs, color: Colors.textMuted },
});
