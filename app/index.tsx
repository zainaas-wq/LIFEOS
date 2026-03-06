import { Redirect } from 'expo-router';
import { useAppStore } from '../src/store/useAppStore';

export default function Index() {
  const profile = useAppStore((s) => s.profile);
  const isOnboarded = profile?.onboardingComplete ?? false;

  if (isOnboarded) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/onboarding" />;
}
