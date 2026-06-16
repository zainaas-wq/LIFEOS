import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { signOut } from '../../src/services/authService';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';

interface MenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  danger?: boolean;
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={avS.circle}>
      <Text style={avS.initials}>{initials || '?'}</Text>
    </View>
  );
}

const avS = StyleSheet.create({
  circle:   { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.goldMuted, borderWidth: 2, borderColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 28, fontWeight: FontWeight.bold, color: Colors.gold },
});

function MenuRow({ item, isLast }: { item: MenuItem; isLast: boolean }) {
  return (
    <>
      <TouchableOpacity style={mS.row} onPress={item.onPress} activeOpacity={0.7}>
        <View style={[mS.iconWrap, { backgroundColor: item.color + '18' }]}>
          <Ionicons name={item.icon} size={18} color={item.danger ? '#F87171' : item.color} />
        </View>
        <Text style={[mS.label, item.danger && mS.labelDanger]}>{item.label}</Text>
        {!item.danger && <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />}
      </TouchableOpacity>
      {!isLast && <View style={mS.divider} />}
    </>
  );
}

const mS = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.md },
  iconWrap:   { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  label:      { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  labelDanger:{ color: '#F87171' },
  divider:    { height: 1, backgroundColor: Colors.border, marginLeft: Spacing.md + 36 + Spacing.md },
});

export default function ProfileScreen() {
  const profile  = useAppStore((s) => s.profile);
  const resetAllData = useAppStore((s) => s.resetAllData);

  const displayName = profile?.name ?? 'LifeOS User';
  const roleLabel   = profile?.lifeRole ? profile.lifeRole.charAt(0).toUpperCase() + profile.lifeRole.slice(1) : 'No role set';

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try { await signOut(); } catch {}
          resetAllData();
        },
      },
    ]);
  };

  const MAIN_ITEMS: MenuItem[] = [
    {
      label:   'Settings',
      icon:    'settings-outline',
      color:   Colors.textSecondary,
      onPress: () => router.push('/(tabs)/settings'),
    },
    {
      label:   'Notifications',
      icon:    'notifications-outline',
      color:   '#6C63FF',
      onPress: () => Alert.alert('Notifications', 'Notification settings coming soon.'),
    },
    {
      label:   'Theme',
      icon:    'color-palette-outline',
      color:   '#A78BFA',
      onPress: () => Alert.alert('Theme', 'Theme settings coming soon.'),
    },
    {
      label:   'Privacy & Security',
      icon:    'shield-checkmark-outline',
      color:   '#4ADE80',
      onPress: () => Alert.alert('Privacy', 'Privacy settings coming soon.'),
    },
    {
      label:   'Help & Support',
      icon:    'help-circle-outline',
      color:   '#38BDF8',
      onPress: () => Alert.alert('Help', 'Visit our documentation at lifeos.app/docs'),
    },
  ];

  const DANGER_ITEMS: MenuItem[] = [
    {
      label:   'Log Out',
      icon:    'log-out-outline',
      color:   '#F87171',
      danger:  true,
      onPress: handleSignOut,
    },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <Text style={s.screenTitle}>Profile</Text>

        {/* ── Avatar card ─────────────────────────────────────────────────── */}
        <View style={s.avatarCard}>
          <Avatar name={displayName} />
          <View style={s.nameBlock}>
            <Text style={s.displayName}>{displayName}</Text>
            <Text style={s.roleLabel}>{roleLabel}</Text>
          </View>
        </View>

        {/* ── Main menu ───────────────────────────────────────────────────── */}
        <View style={s.menuCard}>
          {MAIN_ITEMS.map((item, i) => (
            <MenuRow key={item.label} item={item} isLast={i === MAIN_ITEMS.length - 1} />
          ))}
        </View>

        {/* ── Danger zone ─────────────────────────────────────────────────── */}
        <View style={s.menuCard}>
          {DANGER_ITEMS.map((item, i) => (
            <MenuRow key={item.label} item={item} isLast={i === DANGER_ITEMS.length - 1} />
          ))}
        </View>

        <Text style={s.version}>LifeOS 2.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  content:     { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  screenTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary },

  avatarCard: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.md,
  },
  nameBlock:   { alignItems: 'center', gap: 4 },
  displayName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  roleLabel:   { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'capitalize' },

  menuCard: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },

  version: { textAlign: 'center', fontSize: FontSize.xs, color: Colors.textMuted },
});
