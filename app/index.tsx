import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { useAppStore } from '../src/store/useAppStore';
import { computeSubscriptionState } from '../src/lib/trialUtils';

/**
 * Root dispatcher — routes users to the correct first screen.
 *
 * Flow:
 *   Not onboarded, no language chosen → /language
 *   Not onboarded, language chosen    → /onboarding
 *   Migration: onboarded + no trialStartDate → set trialStartDate = now
 *   subscriptionState === 'pro'           → /(tabs)/home
 *   subscriptionState === 'trial_active'  → /(tabs)/home
 *   subscriptionState === 'trial_expired' → /paywall
 */
export default function Index() {
  const profile           = useAppStore((s) => s.profile);
  const languageSelected  = useAppStore((s) => s.languageSelected);
  const trialStartDate    = useAppStore((s) => s.trialStartDate);
  const setTrialStartDate = useAppStore((s) => s.setTrialStartDate);

  const isOnboarded = profile?.onboardingComplete ?? false;
  const isPro       = profile?.isPro ?? false;

  // Migration guard: existing onboarded users who pre-date trial tracking get a
  // fresh 3-day trial starting from the first open after this version ships.
  useEffect(() => {
    if (isOnboarded && !isPro && !trialStartDate) {
      setTrialStartDate(new Date().toISOString());
    }
  }, [isOnboarded, isPro, trialStartDate, setTrialStartDate]);

  if (!isOnboarded && !languageSelected) return <Redirect href="/language" />;
  if (!isOnboarded)                       return <Redirect href="/onboarding" />;

  // For migrating users who haven't had trialStartDate set yet — render nothing
  // until the useEffect above fires and triggers a re-render.
  if (!isPro && !trialStartDate) return null;

  const subState = computeSubscriptionState(trialStartDate, isPro);

  if (subState === 'trial_expired') return <Redirect href="/paywall" />;
  return <Redirect href="/(tabs)/home" />;
}
