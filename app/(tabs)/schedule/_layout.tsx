import { Stack } from 'expo-router';

export default function ScheduleLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="import" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
