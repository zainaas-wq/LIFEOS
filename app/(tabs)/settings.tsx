/**
 * settings.tsx — legacy screen, superseded by profile.tsx.
 *
 * All functionality (export, sign out, identity, schedule, danger zone)
 * has been migrated to /(tabs)/profile. This file redirects there so any
 * existing programmatic references don't land on a blank screen.
 */

import { Redirect } from 'expo-router';

export default function SettingsScreen() {
  return <Redirect href="/(tabs)/profile" />;
}
