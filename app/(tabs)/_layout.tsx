import { useEffect, useState } from 'react';
import { Tabs, router } from 'expo-router';
import { View, StyleSheet, AppState, Modal, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../src/store/useAppStore';
import { FocusBanner } from '../../src/components/FocusBanner';
import { NudgeBanner } from '../../src/components/NudgeBanner';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/constants/theme';
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

/** Minutes elapsed since a session started, capped by lastCheckpointAt if present. */
function getSessionElapsedMins(session: { startedAt: string; lastCheckpointAt?: string }): number {
  const refMs = session.lastCheckpointAt
    ? new Date(session.lastCheckpointAt).getTime()
    : Date.now();
  return Math.max(1, Math.round((refMs - new Date(session.startedAt).getTime()) / 60000));
}

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const activeFocus                    = useAppStore((s) => s.activeFocus);
  const activeNudge                    = useAppStore((s) => s.activeNudge);
  const goals                          = useAppStore((s) => s.goals);
  const controlPlan                    = useAppStore((s) => s.controlPlan);
  const tickBehavior                   = useAppStore((s) => s.tickBehavior);
  const toggleControlPlanItem          = useAppStore((s) => s.toggleControlPlanItem);
  const dismissNudge                   = useAppStore((s) => s.dismissNudge);
  const snoozeNudge                    = useAppStore((s) => s.snoozeNudge);
  const startFocus                     = useAppStore((s) => s.startFocus);
  const endFocus                       = useAppStore((s) => s.endFocus);
  const discardFocus                   = useAppStore((s) => s.discardFocus);
  const checkpointFocus                = useAppStore((s) => s.checkpointFocus);
  const computeDailyDecisionAction     = useAppStore((s) => s.computeDailyDecisionAction);
  const archiveEnforcementDay          = useAppStore((s) => s.archiveEnforcementDay);
  const archiveMissedTasksFromPlan     = useAppStore((s) => s.archiveMissedTasksFromPlan);
  const loadStarterDay                 = useAppStore((s) => s.loadStarterDay);
  const autoGeneratePlanIfNeeded       = useAppStore((s) => s.autoGeneratePlanIfNeeded);
  const migrateHabitsToRecurringTasks  = useAppStore((s) => s.migrateHabitsToRecurringTasks);
  const trialStartDate                 = useAppStore((s) => s.trialStartDate);
  const isPro                          = useAppStore((s) => s.profile?.isPro ?? false);

  const subState = computeSubscriptionState(trialStartDate, isPro);

  // ── Focus session recovery modal ──────────────────────────────────────────
  const [recoverySession, setRecoverySession] = useState<typeof activeFocus>(null);

  // Notification sync — manages all local notification scheduling.
  useNotificationSync();

  // ── Trial gate ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (subState === 'trial_expired') {
      router.replace('/paywall');
    }
  }, [subState]);

  // ── Behavior tick — 60s interval + app foreground ─────────────────────────
  useEffect(() => {
    if (subState === 'trial_expired') return;

    const tick = () => tickBehavior(new Date().toISOString());
    tick();

    const interval = setInterval(tick, 60_000);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') tick();
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [subState]);

  // ── Focus checkpoint — every 5 minutes while a session is active ──────────
  useEffect(() => {
    if (!activeFocus) return;
    const id = setInterval(checkpointFocus, 5 * 60_000);
    return () => clearInterval(id);
  }, [activeFocus?.id]);

  // ── On mount: handle stale / orphaned focus sessions ──────────────────────
  useEffect(() => {
    if (subState === 'trial_expired') return;

    if (activeFocus) {
      const elapsedMs = Date.now() - new Date(activeFocus.startedAt).getTime();
      const elapsedMins = elapsedMs / 60_000;

      if (elapsedMins > 12 * 60) {
        // Truly abandoned (> 12h) — discard silently, no bogus session logged
        discardFocus();
      } else if (elapsedMins >= 2) {
        // Recoverable session (2 min – 12h) — show recovery prompt
        setRecoverySession(activeFocus);
      }
      // < 2 min: session just started before app restart — keep running silently
    }

    const today = getTodayDate();
    migrateHabitsToRecurringTasks();
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

  // ── Session recovery handlers ─────────────────────────────────────────────
  const handleRecoveryResume = () => setRecoverySession(null);

  const handleRecoveryLog = () => {
    endFocus(); // logs with lastCheckpointAt as effective end time
    setRecoverySession(null);
  };

  const handleRecoveryDiscard = () => {
    discardFocus();
    setRecoverySession(null);
  };

  const elapsedMins = recoverySession ? getSessionElapsedMins(recoverySession) : 0;

  return (
    <View style={styles.root}>
      {/* ── Focus session recovery modal ────────────────────────────────── */}
      <Modal
        visible={!!recoverySession}
        transparent
        animationType="fade"
        onRequestClose={handleRecoveryResume}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="timer-outline" size={24} color={Colors.gold} />
            </View>
            <Text style={styles.modalTitle}>Session in progress</Text>
            <Text style={styles.modalBody}>
              You had an active session for{' '}
              <Text style={styles.modalAccent}>{fmtMins(elapsedMins)}</Text>
              {recoverySession?.goalTitle ? ` on "${recoverySession.goalTitle}"` : ''}.
              {'\n'}What would you like to do?
            </Text>

            <TouchableOpacity style={styles.modalPrimaryBtn} onPress={handleRecoveryResume} activeOpacity={0.85}>
              <Text style={styles.modalPrimaryText}>Resume session</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalSecondaryBtn} onPress={handleRecoveryLog} activeOpacity={0.8}>
              <Text style={styles.modalSecondaryText}>Log {fmtMins(elapsedMins)} as completed</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalDiscardBtn} onPress={handleRecoveryDiscard} activeOpacity={0.7}>
              <Text style={styles.modalDiscardText}>Discard session</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  tabItem:  { paddingTop: 4 },
  tabLabel: { fontSize: 10, letterSpacing: 0.3, marginTop: 2 },
  iconWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  iconWrapActive: {},
  activeDot: {
    position: 'absolute',
    bottom: -6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gold,
  },

  // ── Recovery modal ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: Spacing.md,
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold as any,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalAccent: {
    color: Colors.gold,
    fontWeight: FontWeight.semibold as any,
  },
  modalPrimaryBtn: {
    width: '100%',
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  modalPrimaryText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold as any,
    color: Colors.textInverse,
  },
  modalSecondaryBtn: {
    width: '100%',
    backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  modalSecondaryText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium as any,
    color: Colors.textPrimary,
  },
  modalDiscardBtn: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  modalDiscardText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
});
