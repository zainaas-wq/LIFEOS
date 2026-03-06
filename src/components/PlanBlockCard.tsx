import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PlanBlock, Goal } from '../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { formatTime } from '../lib/utils';

interface PlanBlockCardProps {
  block: PlanBlock;
  goal?: Goal;
  onPress: () => void;
}

const TYPE_CONFIG: Record<
  PlanBlock['type'],
  { color: string; icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  study: { color: '#6C8EBF', icon: 'book-outline',       label: 'Study'    },
  skill: { color: Colors.gold, icon: 'code-slash-outline', label: 'Skill'   },
  rest:  { color: '#4ADE80',   icon: 'leaf-outline',       label: 'Rest'    },
};

export function PlanBlockCard({ block, goal, onPress }: PlanBlockCardProps) {
  const cfg = TYPE_CONFIG[block.type];
  const startMins =
    parseInt(block.startTime.split(':')[0], 10) * 60 +
    parseInt(block.startTime.split(':')[1], 10);
  const endMins =
    parseInt(block.endTime.split(':')[0], 10) * 60 +
    parseInt(block.endTime.split(':')[1], 10);
  const durationMins = endMins - startMins;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.container, block.completed && styles.containerDone]}
    >
      {/* Left accent */}
      <View style={[styles.accent, { backgroundColor: cfg.color }]} />

      {/* Time column */}
      <View style={styles.timeCol}>
        <Text style={styles.timeText}>{formatTime(block.startTime)}</Text>
        <Text style={styles.durationText}>{durationMins}m</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Ionicons name={cfg.icon} size={13} color={cfg.color} />
          <Text style={[styles.title, block.completed && styles.titleDone]} numberOfLines={1}>
            {goal?.title ?? cfg.label}
          </Text>
        </View>
        <Text style={styles.sub}>
          {formatTime(block.startTime)} – {formatTime(block.endTime)} · {cfg.label}
        </Text>
        {block.note && (
          <Text style={styles.note} numberOfLines={2}>{block.note}</Text>
        )}
      </View>

      {/* Focus / Done indicator */}
      <View style={styles.right}>
        {block.completed ? (
          <View style={styles.doneChip}>
            <Ionicons name="checkmark" size={12} color={Colors.success} />
          </View>
        ) : (
          <View style={[styles.focusChip, { borderColor: cfg.color }]}>
            <Ionicons name="flash-outline" size={12} color={cfg.color} />
            <Text style={[styles.focusLabel, { color: cfg.color }]}>Focus</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  containerDone: {
    opacity: 0.45,
  },
  accent: {
    width: 3,
    alignSelf: 'stretch',
  },
  timeCol: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    minWidth: 52,
  },
  timeText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  durationText: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  content: {
    flex: 1,
    paddingVertical: Spacing.md,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    flex: 1,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  sub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  note: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    opacity: 0.75,
    lineHeight: 16,
  },
  right: {
    paddingHorizontal: Spacing.md,
  },
  focusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 3,
  },
  focusLabel: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
  },
  doneChip: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: Colors.successMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
