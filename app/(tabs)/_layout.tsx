import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { FocusBanner } from '../../src/components/FocusBanner';
import { Colors, FontSize } from '../../src/constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={name} size={20} color={focused ? Colors.gold : Colors.textMuted} />
    </View>
  );
}

export default function TabsLayout() {
  const activeFocus = useAppStore((s) => s.activeFocus);

  return (
    <View style={styles.root}>
      {activeFocus && <FocusBanner session={activeFocus} />}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarShowLabel: true,
          tabBarActiveTintColor: Colors.gold,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: styles.tabLabel,
          tabBarHideOnKeyboard: true,
        }}
      >
        {/* ── 5 visible tabs ──────────────────────────────────────────────── */}

        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: 'Plan',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'calendar' : 'calendar-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="coach"
          options={{
            title: 'Coach',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'sparkles' : 'sparkles-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="focus"
          options={{
            title: 'Focus',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'timer' : 'timer-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />
            ),
          }}
        />

        {/* ── Legacy tabs — hidden from tab bar, routes remain valid ────────
            These screens are still accessible programmatically via router.push.
            They will be deprecated gradually as their content migrates into
            the new tab shells above. Do not delete them yet.            ── */}

        <Tabs.Screen name="planner"  options={{ href: null }} />
        <Tabs.Screen name="ai"       options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="goals"    options={{ href: null }} />
        <Tabs.Screen name="rules"    options={{ href: null }} />
        <Tabs.Screen name="schedule" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 60,
    paddingBottom: 6,
    paddingTop: 4,
  },
  tabLabel: { fontSize: FontSize.xs - 1, letterSpacing: 0.2 },
  iconWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  iconWrapActive: {},
});
