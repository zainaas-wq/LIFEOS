import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { Colors } from '../src/constants/theme';
import { supabase } from '../src/lib/supabase';
import { useAppStore } from '../src/store/useAppStore';
import { initRevenueCat, logOutRevenueCat } from '../src/services/purchaseService';
import { track } from '../src/services/analyticsService';
import type { AnalyticsEventName } from '../src/services/analyticsService';
import {
  setupNotificationListener,
  registerNotificationRouter,
  requestNotificationPermissions,
} from '../src/services/notificationService';
// Initialise i18next before any component renders (side-effectful import)
import '../src/i18n';

export default function RootLayout() {
  const setSession        = useAppStore((s) => s.setSession);
  const session           = useAppStore((s) => s.session);
  const isGuestMode       = useAppStore((s) => s.isGuestMode);
  const hydrateFromCloud  = useAppStore((s) => s.hydrateFromCloud);
  const resetAllData      = useAppStore((s) => s.resetAllData);

  // ready: store has rehydrated from AsyncStorage (50 ms debounce)
  const [ready, setReady]               = useState(false);
  // sessionChecked: Supabase has resolved the current session from its storage
  const [sessionChecked, setSessionChecked] = useState(false);

  const segments = useSegments();
  const router   = useRouter();

  // ── 1. Wait for Zustand store to rehydrate ────────────────────────────────
  useEffect(() => {
    track('app_opened');
    const timer = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // ── Sprint 5: Notification listener + permission request ─────────────────
  useEffect(() => {
    registerNotificationRouter((screen) => router.replace(screen as any));
    const cleanup = setupNotificationListener();
    requestNotificationPermissions().catch(console.warn);
    return cleanup;
  }, []);

  // ── 2. Restore Supabase session and listen for auth changes ───────────────
  useEffect(() => {
    // Initial session check (reads from Supabase's own AsyncStorage keys)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        hydrateFromCloud(data.session.user.id).catch(console.warn);
        initRevenueCat(data.session.user.id);
      }
      setSessionChecked(true);
    }).catch(() => {
      // getSession failed (offline, Supabase unreachable, or AsyncStorage error).
      // Proceed as unauthenticated so the app never hangs on the splash screen.
      setSessionChecked(true);
    });

    // Live listener — fires on sign in, sign out, token refresh
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_IN' && newSession) {
        hydrateFromCloud(newSession.user.id).catch(console.warn);
        initRevenueCat(newSession.user.id);
      }
      if (event === 'SIGNED_OUT') {
        resetAllData();
        logOutRevenueCat().catch(console.warn);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // ── Retention milestones — fires once per day-N threshold ────────────────
  useEffect(() => {
    if (!ready) return;

    const { betaStats, markDayActive, setInstallDate } = useAppStore.getState();
    const today = new Date().toISOString().split('T')[0];

    if (!betaStats.installDate) {
      setInstallDate(today);
      return;
    }

    const install    = new Date(betaStats.installDate);
    const now        = new Date();
    const daysSince  = Math.floor((now.getTime() - install.getTime()) / (1000 * 60 * 60 * 24));

    const DAY_EVENT: Record<number, AnalyticsEventName> = {
      1: 'day_1_active', 3: 'day_3_active', 7: 'day_7_active', 14: 'day_14_active',
    };

    for (const day of [1, 3, 7, 14]) {
      if (daysSince >= day && !betaStats.daysActiveTracked.includes(day)) {
        markDayActive(day);
        track(DAY_EVENT[day]);
      }
    }
  }, [ready]);

  // ── 3. Route based on auth state (only once both checks pass) ─────────────
  useEffect(() => {
    if (!ready || !sessionChecked) return;

    const inAuthGroup  = (segments[0] as string) === 'auth';
    const isAuthorized = !!session || isGuestMode;

    if (!isAuthorized && !inAuthGroup) {
      // No session, not guest → send to login
      router.replace('/auth/login' as any);
    } else if (isAuthorized && inAuthGroup) {
      // Session restored or guest mode active → exit auth group
      router.replace('/');
    }
  }, [ready, sessionChecked, session, isGuestMode, segments]);

  // Hold splash until both rehydration and session check complete
  if (!ready || !sessionChecked) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={Colors.background} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboarding/index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="beta-feedback-review" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}
