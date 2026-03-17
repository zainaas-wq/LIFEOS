import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { FocusBanner } from '../../src/components/FocusBanner';
import { NudgeBanner } from '../../src/components/NudgeBanner';
import { Colors, FontSize } from '../../src/constants/theme';
import { generateId, getTodayDate } from '../../src/lib/utils';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={name} size={20} color={focused ? Colors.gold : Colors.textMuted} />
    </View>
  );
}

export default function TabsLayout() {
  const activeFocus     = useAppStore((s) => s.activeFocus);
  const activeNudge     = useAppStore((s) => s.activeNudge);
  const goals           = useAppStore((s) => s.goals);
  const controlPlan     = useAppStore((s) => s.controlPlan);
  const checkEnforcementTick       = useAppStore((s) => s.checkEnforcementTick);
  const toggleControlPlanItem      = useAppStore((s) => s.toggleControlPlanItem);
  const dismissNudge               = useAppStore((s) => s.dismissNudge);
  const snoozeNudge                = useAppStore((s) => s.snoozeNudge);
  const startFocus                 = useAppStore((s) => s.startFocus);
  const computeDailyDecisionAction = useAppStore((s) => s.computeDailyDecisionAction);
  const archiveEnforcementDay      = useAppStore((s) => s.archiveEnforcementDay);
  const archiveMissedTasksFromPlan = useAppStore((s) => s.archiveMissedTasksFromPlan);

  // ── Enforcement tick — runs every 60s regardless of active tab ────────────
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      checkEnforcementTick(d.getHours() * 60 + d.getMinutes());
    };
    tick(); // run immediately on mount
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Recompute daily decision on mount — also archive if day rolled over ──
  useEffect(() => {
    const today = getTodayDate();
    // If the stored plan is from a previous day, archive it and reset enforcement
    archiveMissedTasksFromPlan(today);
    archiveEnforcementDay();
    computeDailyDecisionAction(today);
  }, []);

  // ── Focus handler for 'start' type nudges ─────────────────────────────────
  const handleNudgeFocus = () => {
    if (!activeNudge || !controlPlan) return;
    // P1 fix: never overwrite an already-running focus session
    if (activeFocus) { dismissNudge(); return; }
    const item = controlPlan.plan.items.find((i) => i.id === activeNudge.itemId);
    if (!item) { dismissNudge(); return; }

    const goal = goals.find((g) => g.id === item.goalId);
    startFocus({
      id:              generateId(),
      goalId:          item.goalId,
      goalTitle:       goal?.title ?? item.title,
      durationMinutes: Math.max(1,
        (parseInt(item.endTime.split(':')[0], 10) * 60 + parseInt(item.endTime.split(':')[1], 10)) -
        (parseInt(item.startTime.split(':')[0], 10) * 60 + parseInt(item.startTime.split(':')[1], 10)),
      ),
      startedAt: new Date().toISOString(),
    });
    dismissNudge();
  };

  return (
    <View style={styles.root}>
      {activeFocus && <FocusBanner session={activeFocus} />}

      {/* Global enforcement nudge banner — appears on every tab */}
      {activeNudge && (
        <NudgeBanner
          nudge={activeNudge}
          onDone={() => {
            // Mark complete only for real plan items (not drift/carryover synthetic ids)
            if (activeNudge.itemId !== 'drift' && !activeNudge.itemId.includes('missed')) {
              toggleControlPlanItem(activeNudge.itemId);
            }
            dismissNudge();
          }}
          onSnooze={() => snoozeNudge(10)}
          onSkip={dismissNudge}
          onFocus={activeNudge.type === 'start' ? handleNudgeFocus : undefined}
        />
      )}

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarShowLabel: true,
          tabBarActiveTintColor: Colors.gold,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: styles.tabLabel,
          tabBarHideOnKeyboard: true,
        }}
      >
        {/* ── 5 visible tabs ──────────────────────────────────────────────── */}

        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: 'Plan',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'calendar' : 'calendar-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="coach"
          options={{
            title: 'AI',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'sparkles' : 'sparkles-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="focus"
          options={{
            title: 'Focus',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'timer' : 'timer-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />
            ),
          }}
        />

        {/* ── Legacy tabs — hidden from tab bar, routes remain valid ────────
            These screens are still accessible programmatically via router.push.
            They will be deprecated gradually as their content migrates into
            the new tab shells above. Do not delete them yet.            ── */}

        <Tabs.Screen name="planner"  options={{ href: null }} />
        <Tabs.Screen name="ai"       options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="goals"    options={{ href: null }} />
        <Tabs.Screen name="rules"    options={{ href: null }} />
        <Tabs.Screen name="schedule" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 60,
    paddingBottom: 6,
    paddingTop: 4,
  },
  tabLabel: { fontSize: FontSize.xs - 1, letterSpacing: 0.2 },
  iconWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  iconWrapActive: {},
});
