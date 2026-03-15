import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui/Card';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';
import { CATEGORY_COLOR } from './constants';
import { useAppStore } from '../../store/useAppStore';
import type { Goal, UserProfile, FocusSession } from '../../types';

interface Props {
  profile: UserProfile | null;
  goals: Goal[];
  focusSessions: FocusSession[];
}

// ─── Logged-hours helpers ─────────────────────────────────────────────────────

function getWeekStart(): Date {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay()); // back to Sunday
  start.setHours(0, 0, 0, 0);
  return start;
}

function getWeeklyLoggedMins(sessions: FocusSession[], goalId: string): number {
  const weekStart = getWeekStart();
  return sessions
    .filter((s) => s.goalId === goalId && !!s.end && new Date(s.start) >= weekStart)
    .reduce((sum, s) => {
      if (s.durationMinutes) return sum + s.durationMinutes;
      return sum + Math.round(
        (new Date(s.end!).getTime() - new Date(s.start).getTime()) / 60000,
      );
    }, 0);
}

function fmtHours(mins: number): string {
  if (mins === 0) return '0h';
  if (mins < 60) return `${mins}m`;
  const h = Math.round((mins / 60) * 10) / 10;
  return `${h}h`;
}

// ─── Track Card ───────────────────────────────────────────────────────────────

interface TrackCardProps {
  goal: Goal;
  loggedMins: number;
}

function TrackCard({ goal, loggedMins }: TrackCardProps) {
  const { t } = useTranslation();
  const updateGoal = useAppStore((s) => s.updateGoal);

  const targetMins = goal.weeklyHoursTarget * 60;
  const progress   = targetMins > 0 ? Math.min(loggedMins / targetMins, 1) : 0;
  const pct        = Math.round(progress * 100);
  const accent     = CATEGORY_COLOR[goal.category] ?? Colors.gold;

  const decrement = () => {
    if (goal.weeklyHoursTarget > 1) {
      updateGoal(goal.id, { weeklyHoursTarget: goal.weeklyHoursTarget - 1 });
    }
  };
  const increment = () => {
    if (goal.weeklyHoursTarget < 40) {
      updateGoal(goal.id, { weeklyHoursTarget: goal.weeklyHoursTarget + 1 });
    }
  };

  return (
    <Card elevated style={styles.card}>
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      <View style={styles.cardBody}>
        {/* Title + category badge */}
        <View style={styles.titleRow}>
          <Text style={styles.goalTitle} numberOfLines={1}>{goal.title}</Text>
          <View style={[styles.categoryBadge, { borderColor: accent }]}>
            <Text style={[styles.categoryText, { color: accent }]}>
              {t(`goalCategories.${goal.category}` as any)}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${pct}%` as any,
                backgroundColor: pct >= 100 ? Colors.success : accent,
              },
            ]}
          />
        </View>

        {/* Stats row: logged · pct · target stepper */}
        <View style={styles.statsRow}>
          <Text style={styles.loggedText}>
            {fmtHours(loggedMins)}{' '}
            <Text style={styles.loggedLabel}>{t('plan.tracks_logged')}</Text>
          </Text>

          <Text style={[styles.pctText, pct >= 100 && styles.pctComplete]}>
            {pct}%
          </Text>

          <View style={styles.stepper}>
            <TouchableOpacity
              onPress={decrement}
              style={[styles.stepBtn, goal.weeklyHoursTarget <= 1 && styles.stepBtnDisabled]}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.stepBtnText}>−</Text>
            </TouchableOpacity>

            <Text style={styles.targetText}>
              {t('plan.tracks_per_week', { hours: goal.weeklyHoursTarget })}
            </Text>

            <TouchableOpacity
              onPress={increment}
              style={[styles.stepBtn, goal.weeklyHoursTarget >= 40 && styles.stepBtnDisabled]}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Card>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

export function PlanTracksSection({ profile, goals, focusSessions }: Props) {
  const { t } = useTranslation();
  const tracks = profile?.selectedTrackTypes ?? [];

  return (
    <View style={styles.section}>

      {/* Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('plan.tracks_title')}</Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/goals' as any)}
          activeOpacity={0.7}
        >
          <Text style={styles.sectionAction}>{t('plan.tracks_add_goal')}</Text>
        </TouchableOpacity>
      </View>

      {/* Active track chips (selectedTrackTypes context) */}
      {tracks.length > 0 && (
        <View style={styles.chipRow}>
          {tracks.map((trackKey) => (
            <View key={trackKey} style={styles.trackChip}>
              <Text style={styles.trackChipText}>
                {t(`lifeTracks.${trackKey}` as any, { defaultValue: trackKey })}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Goal track cards */}
      {goals.length > 0 ? (
        <>
          {goals.map((g) => (
            <TrackCard
              key={g.id}
              goal={g}
              loggedMins={getWeeklyLoggedMins(focusSessions, g.id)}
            />
          ))}
        </>
      ) : (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('plan.tracks_no_goals')}</Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/goals' as any)}
            activeOpacity={0.7}
          >
            <Text style={styles.emptyLink}>{t('plan.tracks_add_first')}</Text>
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
  trackChipText: { fontSize: FontSize.xs, color: Colors.textSecondary },

  // ── Track card ──────────────────────────────────────────────────────────────
  card: {
    flexDirection: 'row',
    padding: 0,
    overflow: 'hidden',
  },
  accentBar: {
    width: 4,
    borderTopStartRadius: Radius.lg,
    borderBottomStartRadius: Radius.lg,
  },
  cardBody: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.xs,
  },

  titleRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  goalTitle:     { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  categoryBadge: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical:   2,
    borderRadius:      Radius.sm,
    borderWidth:       1,
  },
  categoryText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, textTransform: 'capitalize' },

  progressTrack: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  loggedText:  { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  loggedLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.regular },
  pctText:     { fontSize: FontSize.sm, color: Colors.textMuted },
  pctComplete: { color: Colors.success, fontWeight: FontWeight.semibold },

  stepper:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  stepBtn:         {
    width: 24, height: 24, borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.3 },
  stepBtnText:     { fontSize: FontSize.md, color: Colors.textPrimary, lineHeight: 20 },
  targetText:      { fontSize: FontSize.sm, color: Colors.textSecondary, minWidth: 44, textAlign: 'center' },

  emptyCard: { gap: Spacing.xs, alignItems: 'center', paddingVertical: Spacing.lg },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
  emptyLink: { fontSize: FontSize.sm, color: Colors.gold },
});
