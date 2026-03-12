/**
 * Plan tab — Sprint 2 Block B
 *
 * Product shell for the Plan experience.
 * Five sections: Today | Tracks | 30-Day | Friction | Schedule
 *
 * "Today" renders ControlDailyView from planner.tsx — full existing planner,
 * no logic duplicated. All other sections are either real profile data or
 * placeholder shells that establish product language.
 *
 * Migration notes:
 * - planner.tsx default export (PlannerScreen) is unchanged; legacy route valid
 * - ControlDailyView exported as named export from planner.tsx (no logic change)
 * - Goals, Rules, Schedule tabs untouched
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { ControlDailyView } from './planner';
import { Card } from '../../src/components/ui/Card';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import type { Goal, UserProfile } from '../../src/types';

// ─── Section definitions ──────────────────────────────────────────────────────

type PlanSection = 'today' | 'tracks' | 'month' | 'friction' | 'schedule';

const SECTIONS: Array<{ id: PlanSection; label: string }> = [
  { id: 'today',    label: 'Today' },
  { id: 'tracks',   label: 'Tracks' },
  { id: 'month',    label: '30-Day' },
  { id: 'friction', label: 'Friction' },
  { id: 'schedule', label: 'Schedule' },
];

// ─── Label maps (mirrors onboarding constants) ────────────────────────────────

const TRACK_LABELS: Record<string, string> = {
  coding:        'Coding',
  fitness:       'Fitness',
  music:         'Music',
  language:      'Language',
  reading:       'Reading',
  writing:       'Writing',
  career:        'Career',
  business:      'Business',
  health:        'Health',
  creative:      'Creativity',
  relationships: 'Relationships',
  mindfulness:   'Mindfulness',
};

const FRICTION_LABELS: Record<string, string> = {
  phone:           'Phone & notifications',
  social_media:    'Social media',
  procrastination: 'Procrastination',
  noise:           'Noise & environment',
  fatigue:         'Fatigue & low energy',
  lack_of_clarity: 'Lack of clarity',
  people:          'People & interruptions',
  overthinking:    'Overthinking',
};

const CATEGORY_COLOR: Record<string, string> = {
  study:  '#6C8EBF',
  skill:  Colors.gold,
  health: '#4ADE80',
  life:   '#F472B6',
  career: '#A78BFA',
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlanScreen() {
  const [section, setSection] = useState<PlanSection>('today');

  const profile = useAppStore((s) => s.profile);
  const goals   = useAppStore((s) => s.goals);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Section tab bar ────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {SECTIONS.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => setSection(s.id)}
            style={[styles.tab, section === s.id && styles.tabActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, section === s.id && styles.tabTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Section content ───────────────────────────────────────────────── */}

      {/* Today: full working daily planner (owns its own ScrollView) */}
      {section === 'today' && <ControlDailyView />}

      {/* All other sections share a ScrollView */}
      {section !== 'today' && (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {section === 'tracks'   && <TracksSection   profile={profile} goals={goals} />}
          {section === 'month'    && <MonthSection />}
          {section === 'friction' && <FrictionSection profile={profile} />}
          {section === 'schedule' && <ScheduleSection profile={profile} />}
        </ScrollView>
      )}

    </SafeAreaView>
  );
}

// ─── Tracks section ───────────────────────────────────────────────────────────

function TracksSection({
  profile,
  goals,
}: {
  profile: UserProfile | null;
  goals: Goal[];
}) {
  const tracks = profile?.selectedTrackTypes ?? [];

  return (
    <View style={styles.section}>
      {/* Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Life Tracks</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/goals' as any)} activeOpacity={0.7}>
          <Text style={styles.sectionAction}>Manage Goals →</Text>
        </TouchableOpacity>
      </View>

      {/* Track chips */}
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

      {/* Goals list */}
      {goals.length > 0 ? (
        <Card elevated>
          {goals.map((g, i) => (
            <View
              key={g.id}
              style={[styles.goalRow, i < goals.length - 1 && styles.goalRowBorder]}
            >
              <View
                style={[styles.goalDot, { backgroundColor: CATEGORY_COLOR[g.category] ?? Colors.gold }]}
              />
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

// ─── 30-Day System section ────────────────────────────────────────────────────

function MonthSection() {
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

// ─── Friction Map section ─────────────────────────────────────────────────────

function FrictionSection({ profile }: { profile: UserProfile | null }) {
  const frictions = profile?.mainFrictions ?? [];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Friction Map</Text>
      </View>

      {frictions.length > 0 ? (
        <>
          <Text style={styles.frictionSubtitle}>Your active friction patterns</Text>
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
          <Text style={styles.frictionNote}>
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

// ─── Schedule section ─────────────────────────────────────────────────────────

function ScheduleSection({ profile }: { profile: UserProfile | null }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Schedule</Text>
      </View>

      {/* Fixed schedule block */}
      {(profile?.fixedScheduleStart || profile?.fixedScheduleEnd) && (
        <Card elevated style={styles.fixedScheduleCard}>
          <View style={styles.fixedScheduleRow}>
            <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.fixedScheduleLabel}>Fixed Hours</Text>
            <Text style={styles.fixedScheduleTime}>
              {profile.fixedScheduleStart ?? '—'} – {profile.fixedScheduleEnd ?? '—'}
            </Text>
          </View>
        </Card>
      )}

      {/* Open Schedule Manager */}
      <Card elevated style={styles.scheduleGateway}>
        <View style={styles.scheduleGatewayRow}>
          <Ionicons name="calendar-outline" size={22} color={Colors.textSecondary} />
          <View style={styles.scheduleGatewayText}>
            <Text style={styles.scheduleGatewayTitle}>Schedule Manager</Text>
            <Text style={styles.scheduleGatewayBody}>
              Manage recurring events, class blocks, and fixed commitments.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/schedule' as any)}
          style={styles.scheduleOpenBtn}
          activeOpacity={0.8}
        >
          <Text style={styles.scheduleOpenBtnText}>Open Schedule Manager</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.gold} />
        </TouchableOpacity>
      </Card>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },

  // Tab bar
  tabBar:        { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBarContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.xs },
  tab: {
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs,
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border,
  },
  tabActive:     { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tabText:       { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  tabTextActive: { color: Colors.textInverse, fontWeight: FontWeight.bold },

  // Section layout
  section:       { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  sectionAction: { fontSize: FontSize.sm, color: Colors.gold },

  // Track chips
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

  // Goals list
  goalRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs + 2 },
  goalRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  goalDot:       { width: 8, height: 8, borderRadius: Radius.full },
  goalTitle:     { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },
  goalHours:     { fontSize: FontSize.xs, color: Colors.textMuted },

  // Placeholder (30-Day)
  placeholderCard:  { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
  placeholderIcon:  { width: 56, height: 56, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  placeholderTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  placeholderBody:  { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  comingSoonBadge:  { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs - 1, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  comingSoonText:   { fontSize: FontSize.xs, color: Colors.textMuted, letterSpacing: 0.5 },

  // Friction
  frictionSubtitle:   { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  frictionRow:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  frictionRowBorder:  { borderBottomWidth: 1, borderBottomColor: Colors.border },
  frictionDot:        { width: 6, height: 6, borderRadius: Radius.full, backgroundColor: Colors.textMuted },
  frictionLabel:      { fontSize: FontSize.md, color: Colors.textPrimary },
  frictionNote:       { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },

  // Schedule
  fixedScheduleCard:    { gap: 0 },
  fixedScheduleRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fixedScheduleLabel:   { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary },
  fixedScheduleTime:    { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  scheduleGateway:      { gap: Spacing.md },
  scheduleGatewayRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  scheduleGatewayText:  { flex: 1, gap: 2 },
  scheduleGatewayTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  scheduleGatewayBody:  { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
  scheduleOpenBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.goldDim },
  scheduleOpenBtnText:  { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium },

  // Empty / shared
  emptyCard: { gap: Spacing.xs, alignItems: 'center', paddingVertical: Spacing.lg },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
  emptyLink: { fontSize: FontSize.sm, color: Colors.gold },
});
