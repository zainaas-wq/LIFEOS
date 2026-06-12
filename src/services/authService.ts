import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

// Required for expo-web-browser to close the auth session on Android
// when the user returns to the app after OAuth.
WebBrowser.maybeCompleteAuthSession();

export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session!;
}

export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  // If email confirmation is disabled in Supabase, session is returned immediately.
  // If enabled, data.session is null and the user must confirm their email.
  return { needsConfirmation: !data.session };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Initiate OAuth sign-in via an in-app browser (expo-web-browser).
 *
 * Flow:
 *  1. Ask Supabase for the OAuth URL (skipBrowserRedirect=true so we control when to open).
 *  2. Open it in an in-app Custom Tab / ASWebAuthenticationSession.
 *  3. When the provider redirects to lifeos://auth/callback, WebBrowser captures it
 *     and returns { type: 'success', url }.
 *  4. We immediately call exchangeCodeForSession — no deep-link race required.
 *
 * Supabase dashboard requirements:
 *   Authentication → Providers → Google / Apple → enable + set Client ID + Secret
 *   Authentication → URL Configuration → add "lifeos://auth/callback" to Redirect URLs
 */
export async function signInWithOAuthProvider(
  provider: 'google' | 'apple',
): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: 'lifeos://auth/callback',
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) return;

  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    'lifeos://auth/callback',
  );

  if (result.type === 'success' && result.url) {
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
    if (sessionError) throw sessionError;
    // Session is now active — onAuthStateChange in _layout.tsx fires SIGNED_IN
  }
  // type === 'cancel' or 'dismiss' → user closed the browser, silently do nothing
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'lifeos://auth/callback',
  });
  if (error) throw error;
}

export function onAuthStateChange(
  callback: (session: Session | null) => void,
): { unsubscribe: () => void } {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return { unsubscribe: () => data.subscription.unsubscribe() };
}
