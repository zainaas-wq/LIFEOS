import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';

export function PlanMonthSection() {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>30-Day System</Text>
      </View>
      <Card elevated style={styles.placeholderCard}>
        <View style={styles.placeholderIcon}>
          <Ionicons name="trending-up-outline" size={28} color={Colors.textMuted} />
        </View>
        <Text style={styles.placeholderTitle}>30-Day Focus Arc</Text>
        <Text style={styles.placeholderBody}>
          Map your goals to a rolling 30-day arc. Track monthly milestones, review your
          mid-month system, and adjust your priorities as the month unfolds.
        </Text>
        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>In development</Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section:       { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },

  placeholderCard:  { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
  placeholderIcon:  {
    width: 56, height: 56, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  placeholderTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  placeholderBody:  { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  comingSoonBadge:  {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs - 1,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
  },
  comingSoonText: { fontSize: FontSize.xs, color: Colors.textMuted, letterSpacing: 0.5 },
});
