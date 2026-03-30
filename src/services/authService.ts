import { Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

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
 * Initiate OAuth sign-in via system browser.
 * On success the browser redirects to lifeos://auth/callback, which is
 * picked up by the deep-link listener in app/_layout.tsx.
 *
 * Requires Supabase dashboard configuration:
 *   Authentication → Providers → Google / Apple → enable + set redirect URL
 *   Authentication → URL Configuration → add "lifeos://auth/callback" to allowed redirects
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
  if (data?.url) {
    await Linking.openURL(data.url);
  }
}

export function onAuthStateChange(
  callback: (session: Session | null) => void,
): { unsubscribe: () => void } {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return { unsubscribe: () => data.subscription.unsubscribe() };
}
