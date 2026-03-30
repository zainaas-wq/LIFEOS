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

import React, { useEffect, useState } from 'react';
import {
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
import type { DailyReview } from '../src/types';

export default function ReviewScreen() {
  const router = useRouter();

  const pendingReview     = useAppStore((s) => s.pendingReview);
  const buildTodayReview  = useAppStore((s) => s.buildTodayReview);
  const saveDailyReviewAction = useAppStore((s) => s.saveDailyReviewAction);

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

  // Derived display values
  const review = pendingReview;

  const completionRate = review && review.totalCount > 0
    ? Math.round((review.completedCount / review.totalCount) * 100)
    : review ? 100 : null;

  function _formatFocusMins(mins: number): string {
    if (mins === 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0)          return `${h}h`;
    return `${m}m`;
  }

  const handleSave = async () => {
    if (!review) { router.back(); return; }
    const updated: DailyReview = {
      ...review,
      reflectionText: reflectionText.trim() || undefined,
      whatWorked:     whatWorked.trim() || undefined,
      whatFailed:     whatFailed.trim() || undefined,
      tomorrowFocus:  tomorrowFocus.trim() || undefined,
      savedAt:        new Date().toISOString(),
    };
    await saveDailyReviewAction(updated);
    router.back();
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
          <Text style={styles.title}>End of Day</Text>
          <View style={{ width: 22 }} />
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
              value={_formatFocusMins(review.focusMinutes)}
            />
            <StatChip
              label="Drifts"
              value={String(review.driftTypes.length)}
              warn={review.driftTypes.length > 0}
            />
            <StatChip
              label="Score"
              value={review.alignmentScore !== undefined ? `${review.alignmentScore}` : '—'}
              highlight={
                review.alignmentScore !== undefined && review.alignmentScore >= 70
              }
            />
          </View>

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

          {/* bottom padding so content clears the keyboard */}
          <View style={{ height: Spacing.xxl }} />
        </ScrollView>

        {/* ── Save button ─────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>Save Review</Text>
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
  },
  saveBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
