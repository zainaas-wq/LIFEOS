import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '../src/constants/theme';
import OfflineBanner from '../src/components/OfflineBanner';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { onConnectivityChange } from '../src/lib/networkUtils';
import { supabase } from '../src/lib/supabase';
import { useAppStore } from '../src/store/useAppStore';
import { initRevenueCat, logOutRevenueCat } from '../src/services/purchaseService';
import { track } from '../src/services/analyticsService';
import { setAppLanguage } from '../src/i18n';
import type { SupportedLanguage } from '../src/i18n';
// Initialise i18next before any component renders (side-effectful import)
import '../src/i18n';
import { NOTIF_IDS, NOTIF_ACTIONS } from '../src/ai/notificationPlanner';

// Keep the native splash screen visible until we explicitly hide it.
// This prevents the blank black screen flash while the store rehydrates.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const setSession           = useAppStore((s) => s.setSession);
  const session              = useAppStore((s) => s.session);
  const isGuestMode          = useAppStore((s) => s.isGuestMode);
  const hydrateFromCloud     = useAppStore((s) => s.hydrateFromCloud);
  const resetAllData         = useAppStore((s) => s.resetAllData);
  const syncErrors           = useAppStore((s) => s.syncErrors);
  const flushPendingToggles  = useAppStore((s) => s.flushPendingToggles);

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

    // Live listener — fires on sign in, sign out, token refresh, password recovery
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_IN' && newSession) {
        hydrateFromCloud(newSession.user.id).catch(console.warn);
        initRevenueCat(newSession.user.id);
      }
      if (event === 'PASSWORD_RECOVERY') {
        // User arrived via a password-reset email link.
        // Session is temporarily valid for password update only.
        router.push('/auth/update-password' as any);
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

      // Detect password recovery from URL (covers both PKCE and implicit flows)
      const isRecovery = url.includes('type=recovery');

      try {
        if (isRecovery && url.includes('#')) {
          // Implicit flow: Supabase puts tokens in the URL fragment
          // e.g. lifeos://auth/callback#access_token=...&refresh_token=...&type=recovery
          const fragment = url.split('#')[1] ?? '';
          const params = new URLSearchParams(fragment);
          const accessToken  = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            const { data: sd } = await supabase.auth.setSession({
              access_token:  accessToken,
              refresh_token: refreshToken,
            });
            if (sd.session) {
              setSession(sd.session);
              // PASSWORD_RECOVERY event from onAuthStateChange handles navigation
            }
          }
          return;
        }

        // PKCE flow: URL contains ?code= (OAuth sign-in OR PKCE password recovery)
        const { data, error } = await supabase.auth.exchangeCodeForSession(url);
        if (!error && data.session) {
          setSession(data.session);
          if (!isRecovery) {
            // Normal OAuth sign-in — hydrate data
            hydrateFromCloud(data.session.user.id).catch(console.warn);
            initRevenueCat(data.session.user.id);
          }
          // If isRecovery, PASSWORD_RECOVERY event from onAuthStateChange handles navigation
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
  // Handles the case where the app was killed and the user tapped a notification
  // or pressed an action button. We wait until the app is ready + session is
  // checked before navigating.
  //
  // Guard: skip navigation if there is no active session — the route guard in
  // step 5 will redirect to login, avoiding a flash of a protected screen.
  // Warm-start taps are handled by useNotificationSync's live listener.
  //
  // Routing table (mirrors useNotificationSync warm-start handler):
  //   review-reminder tap / review_now action   → /review
  //   task-start / task-missed / drift tap
  //     or start_now / open action               → /(tabs)/home
  //   snooze / later actions                     → no navigation
  useEffect(() => {
    if (!ready || !sessionChecked) return;
    if (Platform.OS === 'web') return;
    if (!session && !isGuestMode) return;

    import('expo-notifications').then((Notifications) => {
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;

        const data     = response.notification.request.content.data as Record<string, string>;
        const id       = data?.notificationId ?? '';
        const actionId = response.actionIdentifier;

        // Silent dismiss actions — user chose not to open the app
        if (actionId === NOTIF_ACTIONS.snooze || actionId === NOTIF_ACTIONS.later) return;

        if (id === NOTIF_IDS.review || actionId === NOTIF_ACTIONS.reviewNow) {
          router.push('/review' as any);
        } else if (
          id === NOTIF_IDS.drift      ||
          id === NOTIF_IDS.retention  ||
          id.startsWith('task-start-') ||
          id.startsWith('task-missed-')
        ) {
          router.push('/(tabs)/home' as any);
        }
      }).catch(() => {});
    }).catch(() => {});
  }, [ready, sessionChecked, session, isGuestMode]);

  // ── 5. Flush offline toggle queue when connectivity returns ──────────────
  useEffect(() => {
    const unsub = onConnectivityChange((online) => {
      if (online) flushPendingToggles().catch(console.warn);
    });
    return unsub;
  }, [flushPendingToggles]);

  // ── 6. Hide native splash once store + session are both resolved ────────────
  useEffect(() => {
    if (ready && sessionChecked) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready, sessionChecked]);

  // ── 7. Route based on auth state (only once both checks pass) ─────────────
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
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
