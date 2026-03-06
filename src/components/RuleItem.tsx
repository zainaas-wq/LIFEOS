import React from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Rule } from '../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

interface RuleItemProps {
  rule: Rule;
  onToggleActive: () => void;
  onToggleFollowed: () => void;
  onDelete: () => void;
  locked?: boolean;
}

export function RuleItem({
  rule,
  onToggleActive,
  onToggleFollowed,
  onDelete,
  locked = false,
}: RuleItemProps) {
  return (
    <View style={[styles.container, !rule.enabled && styles.containerInactive]}>
      <View style={styles.header}>
        {/* Follow check */}
        <TouchableOpacity
          onPress={rule.enabled ? onToggleFollowed : undefined}
          activeOpacity={0.7}
          style={styles.followBtn}
        >
          <View
            style={[
              styles.followCircle,
              rule.followedToday && rule.enabled && styles.followCircleDone,
            ]}
          >
            {rule.followedToday && rule.enabled && (
              <Ionicons name="checkmark" size={12} color={Colors.textInverse} />
            )}
          </View>
        </TouchableOpacity>

        {/* Title */}
        <View style={styles.textContainer}>
          <Text style={[styles.title, !rule.enabled && styles.titleInactive]}>
            {rule.title}
          </Text>
          {rule.startTime ? (
            <Text style={styles.description} numberOfLines={1}>
              {rule.startTime}{rule.endTime ? `–${rule.endTime}` : ''} · {rule.type}
            </Text>
          ) : (
            <Text style={styles.description}>{rule.type}</Text>
          )}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Switch
            value={rule.enabled}
            onValueChange={locked && !rule.enabled ? undefined : onToggleActive}
            thumbColor={rule.enabled ? Colors.gold : Colors.textMuted}
            trackColor={{ false: Colors.surfaceHigh, true: Colors.goldMuted }}
            ios_backgroundColor={Colors.surfaceHigh}
          />
          <TouchableOpacity onPress={onDelete} activeOpacity={0.7} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {locked && !rule.enabled && (
        <View style={styles.lockedBanner}>
          <Ionicons name="lock-closed" size={11} color={Colors.gold} />
          <Text style={styles.lockedText}>Upgrade to Pro to activate more rules</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  containerInactive: {
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  followBtn: {
    padding: 2,
  },
  followCircle: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followCircleDone: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  titleInactive: {
    color: Colors.textSecondary,
  },
  description: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  deleteBtn: {
    padding: 4,
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.goldMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  lockedText: {
    fontSize: FontSize.xs,
    color: Colors.gold,
  },
});
