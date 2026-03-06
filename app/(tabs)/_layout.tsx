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
          // Prevents the "collapsible" boolean DOM attribute warning on web
          tabBarHideOnKeyboard: true,
        }}
      >
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
          name="schedule"
          options={{
            title: 'Schedule',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'today' : 'today-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="goals"
          options={{
            title: 'Goals',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'flag' : 'flag-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="planner"
          options={{
            title: 'Planner',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'calendar' : 'calendar-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="rules"
          options={{
            title: 'Rules',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'shield' : 'shield-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="ai"
          options={{
            title: 'AI',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'sparkles' : 'sparkles-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'settings' : 'settings-outline'} focused={focused} />
            ),
          }}
        />
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
