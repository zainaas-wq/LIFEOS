import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui/Card';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';
import { getLocalDateStr } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import type { UserProfile } from '../../types';

interface Props {
  profile: UserProfile | null;
}

// ─── Friction Card ────────────────────────────────────────────────────────────

interface FrictionCardProps {
  frictionKey: string;
  count: number;
  onLog: () => void;
}

function FrictionCard({ frictionKey, count, onLog }: FrictionCardProps) {
  const { t } = useTranslation();

  const label = t(`frictions.${frictionKey}` as any, { defaultValue: frictionKey });

  // Strategies live in translation resources — never hardcoded here
  const s0 = t(`frictionStrategies.${frictionKey}_0` as any, { defaultValue: '' });
  const s1 = t(`frictionStrategies.${frictionKey}_1` as any, { defaultValue: '' });
  const strategies = [s0, s1].filter(Boolean);

  return (
    <Card elevated style={styles.card}>
      {/* Header: label + badge + log button */}
      <View style={styles.cardHeader}>
        <Text style={styles.frictionLabel} numberOfLines={1}>{label}</Text>
        <View style={styles.headerRight}>
          {count > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {t('plan.friction_count', { count })}
              </Text>
            </View>
          )}
          <TouchableOpacity onPress={onLog} style={styles.logBtn} activeOpacity={0.7}>
            <Text style={styles.logBtnText}>{t('plan.friction_log_btn')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Counter-strategies */}
      {strategies.length > 0 && (
        <View style={styles.strategiesBlock}>
          {strategies.map((s, i) => (
            <View key={i} style={styles.strategyRow}>
              <Text style={styles.strategyBullet}>›</Text>
              <Text style={styles.strategyText}>{s}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

export function PlanFrictionSection({ profile }: Props) {
  const { t } = useTranslation();
  const distractionLogs = useAppStore((s) => s.distractionLogs);
  const logDistraction  = useAppStore((s) => s.logDistraction);

  const frictions = profile?.mainFrictions ?? [];
  const today     = getLocalDateStr();

  const countFor = (key: string) =>
    distractionLogs.filter((d) => getLocalDateStr(new Date(d.timestamp)) === today && d.note === key).length;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('plan.friction_title')}</Text>
      </View>

      {frictions.length > 0 ? (
        <>
          <Text style={styles.subtitle}>{t('plan.friction_subtitle')}</Text>
          {frictions.map((f) => (
            <FrictionCard
              key={f}
              frictionKey={f}
              count={countFor(f)}
              onLog={() => logDistraction(f)}
            />
          ))}
        </>
      ) : (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('plan.friction_empty')}</Text>
          <TouchableOpacity onPress={() => router.push('/onboarding' as any)} activeOpacity={0.7}>
            <Text style={styles.emptyLink}>{t('plan.friction_complete_profile')}</Text>
          </TouchableOpacity>
        </Card>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section:       { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  subtitle:      { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: { gap: Spacing.xs },

  cardHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  frictionLabel: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginRight: Spacing.xs,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },

  countBadge: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical:   2,
    borderRadius:      Radius.sm,
    backgroundColor:   Colors.surfaceHigh,
  },
  countText: { fontSize: FontSize.xs, color: Colors.textMuted },

  logBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical:   4,
    borderRadius:      Radius.sm,
    borderWidth:       1,
    borderColor:       Colors.gold,
  },
  logBtnText: { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.medium },

  // ── Strategies ────────────────────────────────────────────────────────────
  strategiesBlock: { gap: 3, marginTop: 2 },
  strategyRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  strategyBullet:  { fontSize: FontSize.sm, color: Colors.gold, lineHeight: 18, width: 10 },
  strategyText:    { flex: 1, fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 18 },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyCard: { gap: Spacing.xs, alignItems: 'center', paddingVertical: Spacing.lg },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
  emptyLink: { fontSize: FontSize.sm, color: Colors.gold },
});
