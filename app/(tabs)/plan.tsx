/**
 * Plan tab — Sprint 3 Block 0
 *
 * Thin orchestrator: tab bar + section routing.
 * All section logic lives in src/components/plan/.
 *
 * Today section renders ControlDailyView inline (app/ → app/ import, no
 * dependency-direction issue). All other sections are imported from src/.
 *
 * Migration notes:
 * - planner.tsx default export (PlannerScreen) unchanged; /(tabs)/planner valid
 * - ControlDailyView named export from planner.tsx unchanged
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../src/store/useAppStore';
import { ControlDailyView } from './planner';
import { PlanTracksSection }   from '../../src/components/plan/PlanTracksSection';
import { PlanMonthSection }    from '../../src/components/plan/PlanMonthSection';
import { PlanFrictionSection } from '../../src/components/plan/PlanFrictionSection';
import { PlanScheduleSection } from '../../src/components/plan/PlanScheduleSection';
import { PLAN_SECTIONS } from '../../src/components/plan/constants';
import type { PlanSection } from '../../src/components/plan/constants';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';

// Today section — inline wrapper (ControlDailyView is already in app/, no cross-boundary import)
function PlanTodaySection() {
  return <ControlDailyView />;
}

export default function PlanScreen() {
  const [section, setSection] = useState<PlanSection>('today');

  const profile = useAppStore((s) => s.profile);
  const goals   = useAppStore((s) => s.goals);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Section tab bar ───────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {PLAN_SECTIONS.map((s) => (
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

      {/* Today owns its own ScrollView — render outside shared scroll */}
      {section === 'today' && <PlanTodaySection />}

      {section !== 'today' && (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {section === 'tracks'   && <PlanTracksSection   profile={profile} goals={goals} />}
          {section === 'month'    && <PlanMonthSection />}
          {section === 'friction' && <PlanFrictionSection profile={profile} />}
          {section === 'schedule' && <PlanScheduleSection profile={profile} />}
        </ScrollView>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },

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
});
