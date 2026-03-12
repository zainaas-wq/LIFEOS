import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Card } from '../ui/Card';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';
import { FRICTION_LABELS } from './constants';
import type { UserProfile } from '../../types';

interface Props {
  profile: UserProfile | null;
}

export function PlanFrictionSection({ profile }: Props) {
  const frictions = profile?.mainFrictions ?? [];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Friction Map</Text>
      </View>

      {frictions.length > 0 ? (
        <>
          <Text style={styles.subtitle}>Your active friction patterns</Text>
          <Card elevated>
            {frictions.map((f, i) => (
              <View
                key={f}
                style={[styles.frictionRow, i < frictions.length - 1 && styles.frictionRowBorder]}
              >
                <View style={styles.frictionDot} />
                <Text style={styles.frictionLabel}>{FRICTION_LABELS[f] ?? f}</Text>
              </View>
            ))}
          </Card>
          <Text style={styles.note}>
            Friction logging and smart counter-strategies coming soon.
          </Text>
        </>
      ) : (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>No friction patterns configured.</Text>
          <TouchableOpacity onPress={() => router.push('/onboarding' as any)} activeOpacity={0.7}>
            <Text style={styles.emptyLink}>Complete your profile →</Text>
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

  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },

  frictionRow:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  frictionRowBorder:  { borderBottomWidth: 1, borderBottomColor: Colors.border },
  frictionDot:        { width: 6, height: 6, borderRadius: Radius.full, backgroundColor: Colors.textMuted },
  frictionLabel:      { fontSize: FontSize.md, color: Colors.textPrimary },
  note:               { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },

  emptyCard: { gap: Spacing.xs, alignItems: 'center', paddingVertical: Spacing.lg },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
  emptyLink: { fontSize: FontSize.sm, color: Colors.gold },
});
