import { Redirect } from 'expo-router';
import { useAppStore } from '../src/store/useAppStore';

/**
 * Root dispatcher — routes users to the correct first screen.
 *
 * Flow:
 *   Not onboarded            → /onboarding
 *   Onboarded + Pro          → /(tabs)/home   (full access)
 *   Onboarded + paywallSeen  → /(tabs)/home   (soft gates in effect)
 *   Onboarded, no paywall    → /paywall        (pay-first moment)
 */
export default function Index() {
  const profile      = useAppStore((s) => s.profile);
  const paywallSeen  = useAppStore((s) => s.paywallSeen);

  const isOnboarded = profile?.onboardingComplete ?? false;
  const isPro       = profile?.isPro ?? false;

  if (!isOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  if (isPro || paywallSeen) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/paywall" />;
}
