import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Task } from '../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

interface TaskCardProps {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
}

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  high: Colors.gold,
  medium: Colors.warning,
  low: Colors.textMuted,
};

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function TaskCard({ task, onToggle, onDelete }: TaskCardProps) {
  const priorityColor = PRIORITY_COLOR[task.priority];

  return (
    <View style={[styles.container, task.completed && styles.containerDone]}>
      {/* Priority bar */}
      <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

      {/* Checkbox */}
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={styles.checkbox}>
        <View style={[styles.checkOuter, task.completed && styles.checkOuterDone]}>
          {task.completed && (
            <Ionicons name="checkmark" size={14} color={Colors.textInverse} />
          )}
        </View>
      </TouchableOpacity>

      {/* Content */}
      <View style={styles.content}>
        <Text
          style={[styles.title, task.completed && styles.titleDone]}
          numberOfLines={2}
        >
          {task.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.priority, { color: priorityColor }]}>
            {PRIORITY_LABEL[task.priority]}
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.duration}>{task.durationMinutes} min</Text>
          {task.scheduledStart ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.time}>
                {task.scheduledStart}–{task.scheduledEnd}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Delete */}
      <TouchableOpacity onPress={onDelete} activeOpacity={0.7} style={styles.delete}>
        <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
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
    marginBottom: Spacing.sm,
  },
  containerDone: {
    opacity: 0.5,
  },
  priorityBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  checkbox: {
    padding: Spacing.md,
  },
  checkOuter: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOuterDone: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  content: {
    flex: 1,
    paddingVertical: Spacing.md,
    gap: 4,
  },
  title: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  priority: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dot: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  duration: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  time: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  delete: {
    padding: Spacing.md,
  },
});
