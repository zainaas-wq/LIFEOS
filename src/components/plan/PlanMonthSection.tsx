import React, { useRef, useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui/Card';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';
import { getLocalDateStr } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD strings for the last 30 days, oldest first, today last. */
function buildDays(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(getLocalDateStr(d));
  }
  return days;
}

// ─── Day dot ─────────────────────────────────────────────────────────────────

type DotIntensity = 'none' | 'low' | 'high';

interface DayDotProps {
  date: string;
  intensity: DotIntensity;
  isToday: boolean;
}

function DayDot({ date, intensity, isToday }: DayDotProps) {
  const dayNum = parseInt(date.slice(8), 10);
  return (
    <View style={styles.dayCell}>
      <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>
        {dayNum}
      </Text>
      <View
        style={[
          styles.dot,
          intensity === 'low'  && styles.dotLow,
          intensity === 'high' && styles.dotHigh,
          isToday && styles.dotToday,
        ]}
      />
    </View>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

export function PlanMonthSection() {
  const { t } = useTranslation();
  const profile       = useAppStore((s) => s.profile);
  const focusSessions = useAppStore((s) => s.focusSessions);
  const reflections   = useAppStore((s) => s.reflections);
  const updateProfile = useAppStore((s) => s.updateProfile);

  const scrollRef  = useRef<ScrollView>(null);
  const hasSynced  = useRef(false);

  const [intentionText, setIntentionText] = useState(
    profile?.transformationDirection ?? '',
  );

  // One-time sync if profile loads after initial render (cloud hydration)
  useEffect(() => {
    if (!hasSynced.current && profile?.transformationDirection) {
      setIntentionText(profile.transformationDirection);
      hasSynced.current = true;
    }
  }, [profile?.transformationDirection]);

  // ── Build intensity map: date → minutes logged ────────────────────────────
  const minsPerDay = new Map<string, number>();
  focusSessions.forEach((s) => {
    if (!s.end) return;
    const date = getLocalDateStr(new Date(s.start));
    const mins = s.durationMinutes
      ?? Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60_000);
    minsPerDay.set(date, (minsPerDay.get(date) ?? 0) + mins);
  });

  // Reflections count as low-intensity activity (no focus logged)
  reflections.forEach((r) => {
    if (!minsPerDay.has(r.date)) minsPerDay.set(r.date, 1);
  });

  const days          = buildDays();
  const today         = getLocalDateStr();
  const activeInRange = days.filter((d) => (minsPerDay.get(d) ?? 0) > 0).length;
  const totalFocusMins = days.reduce((s, d) => s + (minsPerDay.get(d) ?? 0), 0);

  function getIntensity(date: string): DotIntensity {
    const mins = minsPerDay.get(date) ?? 0;
    if (mins === 0) return 'none';
    if (mins < 60) return 'low';
    return 'high';
  }

  // ── Intention save ────────────────────────────────────────────────────────
  const handleIntentionSave = () => {
    if (!profile) return;
    const next = intentionText.trim();
    if (next && next !== (profile.transformationDirection ?? '')) {
      updateProfile({ transformationDirection: next });
    }
  };

  return (
    <View style={styles.section}>

      {/* Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('plan.month_title')}</Text>
        <View style={styles.headerStats}>
          {totalFocusMins > 0 && (
            <Text style={styles.focusHours}>
              {(t('plan.month_focus_hours') as string).replace(
                '{{h}}',
                (totalFocusMins / 60).toFixed(1),
              )}
            </Text>
          )}
          <Text style={styles.activeCount}>
            {t('plan.month_active_day', { count: activeInRange })}
          </Text>
        </View>
      </View>

      {/* Direction / intention */}
      <View style={styles.intentionBlock}>
        <Text style={styles.intentionLabel}>{t('plan.month_direction_label')}</Text>
        <TextInput
          style={styles.intentionInput}
          value={intentionText}
          onChangeText={setIntentionText}
          onBlur={handleIntentionSave}
          placeholder={t('plan.month_direction_placeholder')}
          placeholderTextColor={Colors.textMuted}
          returnKeyType="done"
          maxLength={120}
        />
      </View>

      {/* 30-day strip */}
      <Card elevated style={styles.stripCard}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: false })
          }
          contentContainerStyle={styles.stripContent}
        >
          {days.map((d) => (
            <DayDot
              key={d}
              date={d}
              intensity={getIntensity(d)}
              isToday={d === today}
            />
          ))}
        </ScrollView>

        {/* Month label row */}
        <View style={styles.stripFooter}>
          <Text style={styles.stripFooterLabel}>{t('plan.month_strip_left')}</Text>
          <Text style={styles.stripFooterLabel}>{t('plan.month_strip_right')}</Text>
        </View>
      </Card>

      {/* Contextual message */}
      {activeInRange === 0 && (
        <Text style={styles.hintText}>{t('plan.month_hint_none')}</Text>
      )}
      {activeInRange > 0 && activeInRange < 5 && (
        <Text style={styles.hintText}>
          {t('plan.month_hint_starting', { count: activeInRange })}
        </Text>
      )}
      {activeInRange >= 5 && (
        <Text style={styles.hintText}>
          {t('plan.month_hint_consistent', { count: activeInRange })}
        </Text>
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const DOT_SIZE    = 10;
const DOT_TODAY   = 13;
const CELL_WIDTH  = 36;

const styles = StyleSheet.create({
  section:       { gap: Spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  headerStats:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  focusHours:    { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.semibold },
  activeCount:   { fontSize: FontSize.sm, color: Colors.textMuted },

  // ── Intention ──────────────────────────────────────────────────────────────
  intentionBlock: { gap: Spacing.xs },
  intentionLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  intentionInput: {
    backgroundColor: Colors.surfaceHigh,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },

  // ── Strip ──────────────────────────────────────────────────────────────────
  stripCard:    { padding: 0, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  stripContent: { paddingHorizontal: Spacing.md, gap: 2 },

  dayCell: {
    width:          CELL_WIDTH,
    alignItems:     'center',
    gap:            4,
    paddingVertical: 2,
  },
  dayNum:      { fontSize: 10, color: Colors.textMuted, lineHeight: 13 },
  dayNumToday: { color: Colors.gold, fontWeight: FontWeight.bold },

  dot: {
    width:           DOT_SIZE,
    height:          DOT_SIZE,
    borderRadius:    DOT_SIZE / 2,
    borderWidth:     1,
    borderColor:     Colors.border,
    backgroundColor: 'transparent',
  },
  dotLow: {
    backgroundColor: Colors.success + '60',
    borderColor:     Colors.success + '60',
  },
  dotHigh: {
    backgroundColor: Colors.success,
    borderColor:     Colors.success,
  },
  dotToday: {
    width:           DOT_TODAY,
    height:          DOT_TODAY,
    borderRadius:    DOT_TODAY / 2,
    backgroundColor: Colors.gold,
    borderColor:     Colors.gold,
  },

  stripFooter: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom:  Spacing.sm,
    marginTop:      Spacing.xs,
  },
  stripFooterLabel: { fontSize: 10, color: Colors.textMuted },

  // ── Hint ───────────────────────────────────────────────────────────────────
  hintText: { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },
});
