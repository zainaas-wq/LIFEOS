import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { View, StyleSheet, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../src/store/useAppStore';
import { FocusBanner } from '../../src/components/FocusBanner';
import { NudgeBanner } from '../../src/components/NudgeBanner';
import { Colors, FontSize } from '../../src/constants/theme';
import { generateId, getTodayDate } from '../../src/lib/utils';
import { computeSubscriptionState } from '../../src/lib/trialUtils';
import { useNotificationSync } from '../../src/hooks/useNotificationSync';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={name} size={22} color={focused ? Colors.gold : Colors.textMuted} />
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const activeFocus     = useAppStore((s) => s.activeFocus);
  const activeNudge     = useAppStore((s) => s.activeNudge);
  const goals           = useAppStore((s) => s.goals);
  const controlPlan     = useAppStore((s) => s.controlPlan);
  const tickBehavior               = useAppStore((s) => s.tickBehavior);
  const toggleControlPlanItem      = useAppStore((s) => s.toggleControlPlanItem);
  const dismissNudge               = useAppStore((s) => s.dismissNudge);
  const snoozeNudge                = useAppStore((s) => s.snoozeNudge);
  const startFocus                 = useAppStore((s) => s.startFocus);
  const endFocus                   = useAppStore((s) => s.endFocus);
  const computeDailyDecisionAction = useAppStore((s) => s.computeDailyDecisionAction);
  const archiveEnforcementDay      = useAppStore((s) => s.archiveEnforcementDay);
  const archiveMissedTasksFromPlan = useAppStore((s) => s.archiveMissedTasksFromPlan);
  const loadStarterDay             = useAppStore((s) => s.loadStarterDay);
  const autoGeneratePlanIfNeeded        = useAppStore((s) => s.autoGeneratePlanIfNeeded);
  const migrateHabitsToRecurringTasks   = useAppStore((s) => s.migrateHabitsToRecurringTasks);
  const trialStartDate             = useAppStore((s) => s.trialStartDate);
  const isPro                      = useAppStore((s) => s.profile?.isPro ?? false);

  const subState = computeSubscriptionState(trialStartDate, isPro);

  // Notification sync — manages all local notification scheduling.
  // Mounted here so it has access to the full store and the router.
  // Inactive for expired trial users (no plan = no notifications to schedule).
  useNotificationSync();

  // ── Trial gate — redirect expired users before any behavior engine runs ───
  useEffect(() => {
    if (subState === 'trial_expired') {
      router.replace('/paywall');
    }
  }, [subState]);

  // ── Behavior tick — 60s interval + app foreground ─────────────────────────
  // tickBehavior internally calls checkEnforcementTick — do not add a separate
  // checkEnforcementTick interval or enforcement will fire twice per minute.
  useEffect(() => {
    if (subState === 'trial_expired') return;

    const tick = () => tickBehavior(new Date().toISOString());
    tick(); // immediate on mount / subState change

    const interval = setInterval(tick, 60_000);

    // Re-tick when app returns to foreground (catches long background sessions)
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') tick();
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [subState]);

  // ── Recompute daily decision on mount — also archive if day rolled over ──
  useEffect(() => {
    if (subState === 'trial_expired') return;

    // Clear stale focus sessions abandoned more than 12 hours ago.
    // activeFocus is persisted to AsyncStorage; without this guard a session
    // started yesterday survives app kill and blocks a new session today.
    if (activeFocus && Date.now() - new Date(activeFocus.startedAt).getTime() > 12 * 3_600_000) {
      endFocus();
    }

    const today = getTodayDate();
    migrateHabitsToRecurringTasks(); // idempotent one-time migration
    archiveMissedTasksFromPlan(today);
    archiveEnforcementDay();
    computeDailyDecisionAction(today);
    loadStarterDay(today);
    autoGeneratePlanIfNeeded(today);
  }, [subState]);

  // ── Focus handler for 'start' type nudges ─────────────────────────────────
  const handleNudgeFocus = () => {
    if (!activeNudge || !controlPlan) return;
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

      {activeNudge && (
        <NudgeBanner
          nudge={activeNudge}
          onDone={() => {
            if (activeNudge.itemId !== 'drift'
                && !activeNudge.itemId.includes('missed')
                && activeNudge.itemId !== 'skip') {
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
          tabBarItemStyle: styles.tabItem,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: t('tabs.home'),
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="goals"
          options={{
            title: t('tabs.goals') ?? 'Goals',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'flag' : 'flag-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="habits"
          options={{
            title: t('tabs.habits') ?? 'Habits',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'checkmark-circle' : 'checkmark-circle-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="coach"
          options={{
            title: t('tabs.coach'),
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'sparkles' : 'sparkles-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />
            ),
          }}
        />

        {/* Hidden routes — accessible programmatically */}
        <Tabs.Screen name="plan"     options={{ href: null }} />
        <Tabs.Screen name="focus"    options={{ href: null }} />
        <Tabs.Screen name="planner"  options={{ href: null }} />
        <Tabs.Screen name="ai"       options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
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
    borderTopColor: 'rgba(255,255,255,0.06)',
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabItem: {
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconWrapActive: {},
  activeDot: {
    position: 'absolute',
    bottom: -6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gold,
  },
});
