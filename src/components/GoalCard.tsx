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

const CAT_ICON: Record<Goal['category'], keyof typeof Ionicons.glyphMap> = {
  study:  'book-outline',
  skill:  'code-slash-outline',
  health: 'fitness-outline',
  life:   'heart-outline',
  career: 'briefcase-outline',
};

const CAT_COLOR: Record<Goal['category'], string> = {
  study:  '#38BDF8',
  skill:  '#C9A84C',
  health: '#4ADE80',
  life:   '#F472B6',
  career: '#A78BFA',
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

export function GoalCard({ goal, allocatedMins = 0, intelligence, onEdit, onDelete }: GoalCardProps) {
  const color      = CAT_COLOR[goal.category];
  const icon       = CAT_ICON[goal.category];
  const neededMins = Math.round(goal.weeklyHoursTarget * 60);
  const pct        = neededMins > 0 ? Math.min(1, allocatedMins / neededMins) : 0;
  const pctDisplay = Math.round(pct * 100);

  const riskLevel  = intelligence?.riskLevel ?? 'on-track';
  const riskColor  = RISK_COLOR[riskLevel];
  const prob       = intelligence?.probability ?? null;

  const probColor =
    prob === null     ? Colors.textMuted
    : prob >= 70      ? '#4ADE80'
    : prob >= 40      ? Colors.gold
    :                   '#F87171';

  return (
    <View style={[styles.card, intelligence && riskLevel !== 'on-track' && { borderColor: riskColor + '55' }]}>
      {/* Left: colored icon */}
      <View style={[styles.iconWrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>

      {/* Center: content */}
      <View style={styles.body}>
        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{goal.title}</Text>
          {prob !== null && (
            <View style={[styles.probBadge, { backgroundColor: probColor + '22', borderColor: probColor + '44' }]}>
              <Text style={[styles.probText, { color: probColor }]}>{prob}%</Text>
            </View>
          )}
        </View>

        {/* Category + risk badges */}
        <View style={styles.badgeRow}>
          <View style={[styles.catBadge, { backgroundColor: color + '18', borderColor: color + '33' }]}>
            <Text style={[styles.catBadgeText, { color }]}>{goal.category}</Text>
          </View>
          {intelligence && riskLevel !== 'on-track' && (
            <View style={[styles.riskBadge, { backgroundColor: riskColor + '18', borderColor: riskColor + '40' }]}>
              <Text style={[styles.riskBadgeText, { color: riskColor }]}>{RISK_LABEL[riskLevel]}</Text>
            </View>
          )}
          {goal.deadline && (
            <Text style={styles.deadline}>Due {goal.deadline}</Text>
          )}
        </View>

        {/* Progress bar */}
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pctDisplay}%` as any, backgroundColor: color }]} />
          </View>
          <Text style={[styles.progressPct, { color: pct >= 1 ? color : Colors.textMuted }]}>
            {pctDisplay}%
          </Text>
        </View>

        {/* Hours label */}
        <Text style={styles.hoursLabel}>
          {(allocatedMins / 60).toFixed(1)}h / {goal.weeklyHoursTarget.toFixed(1)}h per week
        </Text>

        {/* Activity line */}
        {intelligence && intelligence.weeklyHoursLogged > 0 && (
          <View style={styles.activityRow}>
            <Ionicons name="flash-outline" size={10} color={Colors.textMuted} />
            <Text style={styles.activityText}>
              {intelligence.weeklyHoursLogged.toFixed(1)}h logged this week
              {intelligence.inTodaysPlan ? " · In today's plan" : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Right: action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity onPress={onEdit} style={styles.actionBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Ionicons name="pencil-outline" size={15} color={Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.actionBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  body: { flex: 1, gap: Spacing.xs },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  title: {
    flex: 1,
    fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary,
  },
  probBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1,
  },
  probText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
  catBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1,
  },
  catBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'capitalize' },
  riskBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1,
  },
  riskBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.3 },
  deadline: { fontSize: FontSize.xs, color: Colors.textMuted },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
  progressTrack: {
    flex: 1, height: 5, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceHigh, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: Radius.full },
  progressPct: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, minWidth: 32, textAlign: 'right' },

  hoursLabel: { fontSize: FontSize.xs, color: Colors.textMuted },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activityText: { fontSize: FontSize.xs - 1, color: Colors.textMuted },

  actions: { gap: Spacing.sm, paddingTop: 2 },
  actionBtn: { padding: 2 },
});
