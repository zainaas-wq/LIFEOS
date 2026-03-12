import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Card } from '../ui/Card';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';
import { TRACK_LABELS, CATEGORY_COLOR } from './constants';
import type { Goal, UserProfile } from '../../types';

interface Props {
  profile: UserProfile | null;
  goals: Goal[];
}

export function PlanTracksSection({ profile, goals }: Props) {
  const tracks = profile?.selectedTrackTypes ?? [];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Life Tracks</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/goals' as any)} activeOpacity={0.7}>
          <Text style={styles.sectionAction}>Manage Goals →</Text>
        </TouchableOpacity>
      </View>

      {tracks.length > 0 ? (
        <View style={styles.chipRow}>
          {tracks.map((t) => (
            <View key={t} style={styles.trackChip}>
              <Text style={styles.trackChipText}>{TRACK_LABELS[t] ?? t}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>No life tracks selected.</Text>
          <TouchableOpacity onPress={() => router.push('/onboarding' as any)} activeOpacity={0.7}>
            <Text style={styles.emptyLink}>Complete your profile →</Text>
          </TouchableOpacity>
        </Card>
      )}

      {goals.length > 0 ? (
        <Card elevated>
          {goals.map((g, i) => (
            <View
              key={g.id}
              style={[styles.goalRow, i < goals.length - 1 && styles.goalRowBorder]}
            >
              <View style={[styles.goalDot, { backgroundColor: CATEGORY_COLOR[g.category] ?? Colors.gold }]} />
              <Text style={styles.goalTitle} numberOfLines={1}>{g.title}</Text>
              <Text style={styles.goalHours}>{g.weeklyHoursTarget}h/wk</Text>
            </View>
          ))}
        </Card>
      ) : (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>No goals yet.</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/goals' as any)} activeOpacity={0.7}>
            <Text style={styles.emptyLink}>Add your first goal →</Text>
          </TouchableOpacity>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section:       { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  sectionAction: { fontSize: FontSize.sm, color: Colors.gold },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  trackChip: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical:   Spacing.xs,
    borderRadius:      Radius.full,
    backgroundColor:   Colors.surfaceElevated,
    borderWidth:       1,
    borderColor:       Colors.border,
  },
  trackChipText: { fontSize: FontSize.sm, color: Colors.textSecondary },

  goalRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs + 2 },
  goalRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  goalDot:       { width: 8, height: 8, borderRadius: Radius.full },
  goalTitle:     { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },
  goalHours:     { fontSize: FontSize.xs, color: Colors.textMuted },

  emptyCard: { gap: Spacing.xs, alignItems: 'center', paddingVertical: Spacing.lg },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
  emptyLink: { fontSize: FontSize.sm, color: Colors.gold },
});
