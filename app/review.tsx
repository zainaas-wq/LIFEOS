/**
 * app/review.tsx — End-of-day review screen.
 *
 * Minimal entry point for daily execution review.
 * Shows today's computed stats and lets the user add optional reflection
 * text before saving.
 *
 * Navigation: push from any screen (not a tab). Use router.push('/review').
 * Access: home screen "Review Day" button, or auto-shown at day boundary.
 *
 * Design constraints:
 *   - Single scroll, no tabs
 *   - Stats are read-only (computed by buildTodayReview)
 *   - All text fields are optional
 *   - Save always succeeds locally; Supabase sync is fire-and-forget
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../src/store/useAppStore';
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Spacing,
} from '../src/constants/theme';
import { getTodayDate } from '../src/lib/utils';
import type { DailyReview } from '../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtFocusMins(mins: number): string {
  if (mins === 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0)          return `${h}h`;
  return `${m}m`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function reviewStreak(reviews: DailyReview[], today: string): number {
  const savedDates = new Set(reviews.filter((r) => !!r.savedAt).map((r) => r.date));
  let streak = 0;
  const cursor = new Date(today + 'T12:00:00');
  while (savedDates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function ReviewScreen() {
  const router = useRouter();
  const today  = getTodayDate();

  const pendingReview         = useAppStore((s) => s.pendingReview);
  const buildTodayReview      = useAppStore((s) => s.buildTodayReview);
  const saveDailyReviewAction = useAppStore((s) => s.saveDailyReviewAction);
  const dailyReviews          = useAppStore((s) => s.dailyReviews);
  const focusSessions         = useAppStore((s) => s.focusSessions);

  // Ensure pendingReview is populated before rendering.
  useEffect(() => {
    if (!pendingReview) {
      buildTodayReview();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed text fields from pendingReview if user opened the screen twice.
  const [reflectionText, setReflectionText] = useState(pendingReview?.reflectionText ?? '');
  const [whatWorked,     setWhatWorked]     = useState(pendingReview?.whatWorked ?? '');
  const [whatFailed,     setWhatFailed]     = useState(pendingReview?.whatFailed ?? '');
  const [tomorrowFocus,  setTomorrowFocus]  = useState(pendingReview?.tomorrowFocus ?? '');

  const review = pendingReview;

  const completionRate = review && review.totalCount > 0
    ? Math.round((review.completedCount / review.totalCount) * 100)
    : review ? 100 : null;

  // Today's focus session count
  const todaySessionCount = useMemo(() => {
    return focusSessions.filter((s) => s.start.slice(0, 10) === today && !!s.end).length;
  }, [focusSessions, today]);

  // Review streak (consecutive saved review days including today)
  const streak = useMemo(() => reviewStreak(dailyReviews, today), [dailyReviews, today]);

  // Past saved reviews (excluding today, newest first, max 7)
  const pastReviews = useMemo(() => {
    return [...dailyReviews]
      .filter((r) => r.date !== today && !!r.savedAt)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7);
  }, [dailyReviews, today]);

  const [saved,   setSaved]   = useState(false);
  const [saving,  setSaving]  = useState(false);

  const handleSave = async () => {
    if (!review || saving) return;
    setSaving(true);
    const updated: DailyReview = {
      ...review,
      reflectionText: reflectionText.trim() || undefined,
      whatWorked:     whatWorked.trim() || undefined,
      whatFailed:     whatFailed.trim() || undefined,
      tomorrowFocus:  tomorrowFocus.trim() || undefined,
      savedAt:        new Date().toISOString(),
    };
    await saveDailyReviewAction(updated);
    setSaved(true);
    setSaving(false);
    setTimeout(() => router.back(), 900);
  };

  if (!review) {
    // Building — render an empty shell so layout doesn't flash.
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>End of Day</Text>
          <View style={{ width: 22 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>End of Day</Text>
            <Text style={styles.headerDate}>{fmtDate(today)}</Text>
          </View>
          {streak >= 2 ? (
            <View style={styles.streakBadge}>
              <Text style={styles.streakEmoji}>🔥</Text>
              <Text style={styles.streakText}>{streak}d</Text>
            </View>
          ) : (
            <View style={{ width: 42 }} />
          )}
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Stats strip ────────────────────────────────────────────────── */}
          <View style={styles.statsRow}>
            <StatChip
              label="Done"
              value={`${review.completedCount}/${review.totalCount}`}
              highlight={completionRate !== null && completionRate >= 80}
            />
            <StatChip
              label="Focus"
              value={fmtFocusMins(review.focusMinutes)}
            />
            <StatChip
              label="Sessions"
              value={String(todaySessionCount)}
              highlight={todaySessionCount >= 3}
            />
            <StatChip
              label="Score"
              value={review.alignmentScore !== undefined ? `${review.alignmentScore}` : '—'}
              highlight={review.alignmentScore !== undefined && review.alignmentScore >= 70}
            />
          </View>

          {/* ── Extra stats row ─────────────────────────────────────────────── */}
          {((review.distractionCount ?? 0) > 0 || (review.skipCount ?? 0) > 0) && (
            <View style={styles.extraStatsRow}>
              {(review.skipCount ?? 0) > 0 && (
                <View style={styles.extraChip}>
                  <Ionicons name="remove-circle-outline" size={12} color={Colors.textMuted} />
                  <Text style={styles.extraChipText}>{review.skipCount} skipped</Text>
                </View>
              )}
              {(review.distractionCount ?? 0) > 0 && (
                <View style={[styles.extraChip, styles.extraChipWarn]}>
                  <Ionicons name="warning-outline" size={12} color={Colors.warning} />
                  <Text style={[styles.extraChipText, { color: Colors.warning }]}>
                    {review.distractionCount} distractions
                  </Text>
                </View>
              )}
              {completionRate !== null && (
                <View style={[styles.extraChip, completionRate >= 80 && styles.extraChipGood]}>
                  <Ionicons
                    name="stats-chart-outline"
                    size={12}
                    color={completionRate >= 80 ? Colors.success : Colors.textMuted}
                  />
                  <Text style={[
                    styles.extraChipText,
                    completionRate >= 80 && { color: Colors.success },
                  ]}>
                    {completionRate}% done
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Status badges ───────────────────────────────────────────────── */}
          {review.criticalDone && (
            <View style={styles.criticalBadge}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              <Text style={styles.criticalText}>Critical task done</Text>
            </View>
          )}
          {review.recoveryUsed && (
            <View style={styles.recoveryBadge}>
              <Ionicons name="refresh-circle" size={14} color={Colors.recovery} />
              <Text style={styles.recoveryText}>
                Recovery used{review.recoveryMode ? ` · ${review.recoveryMode.replace('_', ' ')}` : ''}
              </Text>
            </View>
          )}

          {/* ── Drift tags (read-only) ────────────────────────────────────── */}
          {review.driftTypes.length > 0 && (
            <View style={styles.driftRow}>
              {review.driftTypes.map((dt) => (
                <View key={dt} style={styles.driftTag}>
                  <Text style={styles.driftTagText}>{dt.replace('_', ' ')}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Reflection fields ─────────────────────────────────────────── */}
          <Field
            label="What worked today?"
            value={whatWorked}
            onChangeText={setWhatWorked}
            placeholder="Something worth repeating..."
          />
          <Field
            label="What didn't work?"
            value={whatFailed}
            onChangeText={setWhatFailed}
            placeholder="Something to adjust..."
          />
          <Field
            label="Tomorrow's #1 focus"
            value={tomorrowFocus}
            onChangeText={setTomorrowFocus}
            placeholder="One thing that matters most..."
          />
          <Field
            label="Notes (optional)"
            value={reflectionText}
            onChangeText={setReflectionText}
            placeholder="Anything else..."
            multiline
            minHeight={72}
          />

          {/* ── Past reviews history ──────────────────────────────────────── */}
          {pastReviews.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.historyTitle}>Past Reviews</Text>
              {pastReviews.map((r) => {
                const rate = r.totalCount > 0
                  ? Math.round((r.completedCount / r.totalCount) * 100)
                  : 100;
                const snippet = r.whatWorked ?? r.reflectionText ?? r.tomorrowFocus;
                return (
                  <View key={r.date} style={styles.historyRow}>
                    <View style={styles.historyLeft}>
                      <Text style={styles.historyDate}>{fmtDate(r.date)}</Text>
                      {snippet ? (
                        <Text style={styles.historySnippet} numberOfLines={1}>
                          {snippet}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.historyRight}>
                      <Text style={[
                        styles.historyRate,
                        rate >= 80 && { color: Colors.success },
                        rate < 50  && { color: Colors.error },
                      ]}>
                        {rate}%
                      </Text>
                      <Text style={styles.historyFocus}>{fmtFocusMins(r.focusMinutes)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* bottom padding so content clears the keyboard */}
          <View style={{ height: Spacing.xxl }} />
        </ScrollView>

        {/* ── Save button ─────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, saved && styles.saveBtnDone]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving || saved}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.textInverse} />
            ) : saved ? (
              <>
                <Ionicons name="checkmark-circle" size={18} color={Colors.textInverse} />
                <Text style={styles.saveBtnText}>Saved!</Text>
              </>
            ) : (
              <Text style={styles.saveBtnText}>Save Review</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatChipProps {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}

function StatChip({ label, value, highlight, warn }: StatChipProps) {
  const valueColor = highlight
    ? Colors.success
    : warn
    ? Colors.warning
    : Colors.textPrimary;

  return (
    <View style={styles.statChip}>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  minHeight?: number;
}

function Field({ label, value, onChangeText, placeholder, multiline, minHeight }: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, minHeight ? { minHeight } : undefined]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  // ── Header enhancements ────────────────────────────────────────────────────
  headerCenter: { alignItems: 'center', gap: 1 },
  headerDate:   { fontSize: FontSize.xs, color: Colors.textMuted },
  streakBadge:  { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.goldMuted, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: Colors.goldDim },
  streakEmoji:  { fontSize: 11 },
  streakText:   { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.bold },

  // ── Extra stats row ────────────────────────────────────────────────────────
  extraStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  extraChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  extraChipWarn: { borderColor: Colors.warning + '40', backgroundColor: 'rgba(251,191,36,0.08)' },
  extraChipGood: { borderColor: Colors.success + '40', backgroundColor: Colors.successMuted },
  extraChipText: { fontSize: FontSize.xs, color: Colors.textMuted },

  // ── History section ────────────────────────────────────────────────────────
  historySection: { gap: Spacing.sm, marginTop: Spacing.sm },
  historyTitle:   { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: FontWeight.semibold },
  historyRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  historyLeft:    { flex: 1, gap: 2 },
  historyDate:    { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  historySnippet: { fontSize: FontSize.xs, color: Colors.textMuted },
  historyRight:   { alignItems: 'flex-end', gap: 2 },
  historyRate:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  historyFocus:   { fontSize: FontSize.xs, color: Colors.textMuted },

  // ── Stats strip ────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statChip: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  // ── Status badges ──────────────────────────────────────────────────────────
  criticalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.successMuted,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
  },
  criticalText: {
    fontSize: FontSize.sm,
    color: Colors.success,
    fontWeight: FontWeight.medium,
  },
  recoveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.recoveryMuted,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
  },
  recoveryText: {
    fontSize: FontSize.sm,
    color: Colors.recovery,
    fontWeight: FontWeight.medium,
  },
  // ── Drift tags ─────────────────────────────────────────────────────────────
  driftRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  driftTag: {
    backgroundColor: Colors.errorMuted,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  driftTagText: {
    fontSize: FontSize.xs,
    color: Colors.error,
  },
  // ── Reflection fields ──────────────────────────────────────────────────────
  fieldWrap: {
    gap: Spacing.xs,
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  fieldInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDone: {
    backgroundColor: Colors.success,
  },
  saveBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
