import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { Colors } from '../src/constants/theme';
import OfflineBanner from '../src/components/OfflineBanner';
import { supabase } from '../src/lib/supabase';
import { useAppStore } from '../src/store/useAppStore';
import { initRevenueCat, logOutRevenueCat } from '../src/services/purchaseService';
import { track } from '../src/services/analyticsService';
import { setAppLanguage } from '../src/i18n';
import type { SupportedLanguage } from '../src/i18n';
// Initialise i18next before any component renders (side-effectful import)
import '../src/i18n';
import { NOTIF_IDS } from '../src/ai/notificationPlanner';

export default function RootLayout() {
  const setSession        = useAppStore((s) => s.setSession);
  const session           = useAppStore((s) => s.session);
  const isGuestMode       = useAppStore((s) => s.isGuestMode);
  const hydrateFromCloud  = useAppStore((s) => s.hydrateFromCloud);
  const resetAllData      = useAppStore((s) => s.resetAllData);
  const syncErrors        = useAppStore((s) => s.syncErrors);

  // ready: store has rehydrated from AsyncStorage (50 ms debounce)
  const [ready, setReady]               = useState(false);
  // sessionChecked: Supabase has resolved the current session from its storage
  const [sessionChecked, setSessionChecked] = useState(false);

  const segments = useSegments();
  const router   = useRouter();

  // ── 1. Wait for Zustand store to rehydrate, then restore saved language ───
  //
  // v2 fix: replaced the 50ms setTimeout (which races on slow Android devices)
  // with Zustand's own onFinishHydration callback. If the store has already
  // hydrated (hot-reload, fast device), we apply immediately via hasHydrated().
  useEffect(() => {
    track('app_opened');

    const applyReady = () => {
      // Restore user's saved language after AsyncStorage has hydrated.
      // i18next initialised from device locale; override with persisted choice.
      const savedLang = useAppStore.getState().appLanguage;
      if (savedLang && savedLang !== 'en') {
        setAppLanguage(savedLang as SupportedLanguage).catch(console.warn);
      }
      setReady(true);
    };

    // Synchronous path: store already rehydrated (common on hot-reload)
    if (useAppStore.persist.hasHydrated()) {
      applyReady();
      return;
    }

    // Async path: subscribe to hydration completion
    const unsub = useAppStore.persist.onFinishHydration(applyReady);
    return unsub;
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

  // ── 3. OAuth deep-link callback (lifeos://auth/callback?code=...) ─────────
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      // Validate that this deep link is our own auth callback.
      // Accept only the exact scheme + path prefix — reject anything else
      // to prevent malicious deep links from triggering session exchange.
      const isValidCallback =
        url.startsWith('lifeos://auth/callback') ||
        (__DEV__ && url.startsWith('exp://') && url.includes('/auth/callback'));
      if (!isValidCallback) return;

      // Exchange authorization code for a Supabase session
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(url);
        if (!error && data.session) {
          setSession(data.session);
          hydrateFromCloud(data.session.user.id).catch(console.warn);
          initRevenueCat(data.session.user.id);
        }
      } catch {
        // Fallback: getSession() may already have the session from the redirect
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) setSession(data.session);
        });
      }
    };

    // Listener for when the app is already open
    const sub = Linking.addEventListener('url', handleUrl);

    // Handle cold-start deep link (app opened via OAuth redirect)
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => sub.remove();
  }, []);

  // ── 4. Cold-start notification tap → post-auth navigation ────────────────
  // Handles the case where the app was killed and the user tapped a notification.
  // We wait until the app is ready + session is checked before navigating.
  // Guard: skip navigation entirely if there is no active session — the route
  // guard in step 5 will redirect to login, avoiding a flash of a protected screen.
  // Warm-start taps are handled by useNotificationSync's live listener.
  useEffect(() => {
    if (!ready || !sessionChecked) return;
    if (Platform.OS === 'web') return;
    // No session → don't navigate to any protected screen; let step 5 handle routing
    if (!session && !isGuestMode) return;

    // Dynamically import to avoid bundling expo-notifications on web
    import('expo-notifications').then((Notifications) => {
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        const data = response.notification.request.content.data as Record<string, string>;
        const id   = data?.notificationId ?? '';

        if (id === NOTIF_IDS.review) {
          router.push('/review' as any);
        }
        // task-start / task-missed / drift → home tab (default landing after auth)
      }).catch(() => {});
    }).catch(() => {});
  }, [ready, sessionChecked, session, isGuestMode]);

  // ── 5. Route based on auth state (only once both checks pass) ─────────────
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
        <Stack.Screen name="language" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboarding/index" options={{ gestureEnabled: false }} />
        <Stack.Screen name="paywall" />
        <Stack.Screen name="upgrade" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="legal/terms"   options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="legal/privacy" options={{ animation: 'slide_from_right' }} />
      </Stack>
      <OfflineBanner syncErrors={syncErrors} />
    </>
  );
}
