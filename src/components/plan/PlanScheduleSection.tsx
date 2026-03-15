import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui/Card';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';
import type { UserProfile } from '../../types';

interface Props {
  profile: UserProfile | null;
}

export function PlanScheduleSection({ profile }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('plan.schedule_title')}</Text>
      </View>

      {(profile?.fixedScheduleStart || profile?.fixedScheduleEnd) && (
        <Card elevated style={styles.fixedCard}>
          <View style={styles.fixedRow}>
            <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.fixedLabel}>{t('plan.schedule_fixed_hours')}</Text>
            <Text style={styles.fixedTime}>
              {profile.fixedScheduleStart ?? '—'} – {profile.fixedScheduleEnd ?? '—'}
            </Text>
          </View>
        </Card>
      )}

      <Card elevated style={styles.gatewayCard}>
        <View style={styles.gatewayRow}>
          <Ionicons name="calendar-outline" size={22} color={Colors.textSecondary} />
          <View style={styles.gatewayText}>
            <Text style={styles.gatewayTitle}>{t('plan.schedule_manager_title')}</Text>
            <Text style={styles.gatewayBody}>{t('plan.schedule_manager_body')}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/schedule' as any)}
          style={styles.openBtn}
          activeOpacity={0.8}
        >
          <Text style={styles.openBtnText}>{t('plan.schedule_open_btn')}</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.gold} />
        </TouchableOpacity>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section:       { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },

  fixedCard: { gap: 0 },
  fixedRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fixedLabel:{ flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary },
  fixedTime: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },

  gatewayCard: { gap: Spacing.md },
  gatewayRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  gatewayText: { flex: 1, gap: 2 },
  gatewayTitle:{ fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  gatewayBody: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.goldDim,
  },
  openBtnText: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium },
});
