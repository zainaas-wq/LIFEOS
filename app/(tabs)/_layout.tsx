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
        {/* ── 5 visible tabs — HOME | MEMORY | FOCUS | COACH | MORE ───────── */}

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
          name="memory"
          options={{
            title: 'Memory',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'library' : 'library-outline'} focused={focused} />
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
          name="coach"
          options={{
            title: 'Coach',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'sparkles' : 'sparkles-outline'} focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'grid' : 'grid-outline'} focused={focused} />
            ),
          }}
        />

        {/* ── Routes kept valid but hidden from tab bar ────────────────────
            Accessible via router.push() from the More screen and Coach.   */}

        <Tabs.Screen name="plan"     options={{ href: null }} />
        <Tabs.Screen name="planner"  options={{ href: null }} />
        <Tabs.Screen name="ai"       options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="goals"    options={{ href: null }} />
        <Tabs.Screen name="rules"    options={{ href: null }} />
        <Tabs.Screen name="schedule" options={{ href: null }} />
        <Tabs.Screen name="profile"  options={{ href: null }} />
        <Tabs.Screen name="study"     options={{ href: null }} />
        <Tabs.Screen name="projects"  options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
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
  tabLabel:      { fontSize: FontSize.xs - 1, letterSpacing: 0.2 },
  iconWrap:      { alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  iconWrapActive: {},
});
