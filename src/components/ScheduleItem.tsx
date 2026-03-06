import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ScheduleItem as ScheduleItemType } from '../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { formatTime } from '../lib/utils';

interface ScheduleItemProps {
  item: ScheduleItemType;
}

const TYPE_COLOR: Record<ScheduleItemType['type'], string> = {
  task: Colors.gold,
  break: Colors.textMuted,
  blocked: Colors.error,
};

export function ScheduleItem({ item }: ScheduleItemProps) {
  const accentColor = TYPE_COLOR[item.type];

  return (
    <View style={styles.container}>
      {/* Time column */}
      <View style={styles.timeCol}>
        <Text style={styles.time}>{formatTime(item.startTime)}</Text>
      </View>

      {/* Connector line */}
      <View style={styles.connector}>
        <View style={[styles.dot, { backgroundColor: accentColor }]} />
        <View style={styles.line} />
      </View>

      {/* Content */}
      <View
        style={[
          styles.content,
          item.type === 'task' && styles.contentTask,
          item.type === 'blocked' && styles.contentBlocked,
          item.type === 'break' && styles.contentBreak,
        ]}
      >
        <Text
          style={[styles.label, { color: item.type === 'break' ? Colors.textMuted : Colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.label}
        </Text>
        <Text style={styles.duration}>
          {formatTime(item.startTime)} – {formatTime(item.endTime)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  timeCol: {
    width: 60,
    paddingTop: 2,
  },
  time: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  connector: {
    width: 24,
    alignItems: 'center',
    paddingTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  line: {
    flex: 1,
    width: 1,
    backgroundColor: Colors.border,
    marginTop: 4,
    minHeight: 24,
  },
  content: {
    flex: 1,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginLeft: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
    gap: 2,
  },
  contentTask: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.gold,
  },
  contentBlocked: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.error,
    backgroundColor: Colors.errorMuted,
  },
  contentBreak: {
    backgroundColor: Colors.surface,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  duration: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
});
