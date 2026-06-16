import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';

// ─── Section item ─────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
  badge?: string;
}

const SYSTEMS: NavItem[] = [
  {
    label:       'Plan',
    description: 'Daily control plan · Tracks · Monthly',
    icon:        'calendar-outline',
    route:       '/(tabs)/plan',
    color:       Colors.gold,
  },
  {
    label:       'Goals',
    description: 'Life tracks · Weekly targets · Deadlines',
    icon:        'flag-outline',
    route:       '/(tabs)/goals',
    color:       '#A78BFA',
  },
  {
    label:       'Study',
    description: 'Courses · Assignments · Exam countdown · AI Coach',
    icon:        'book-outline',
    route:       '/(tabs)/study',
    color:       '#F472B6',
  },
  {
    label:       'Projects',
    description: 'Milestones · Stagnation detection · AI Coach',
    icon:        'git-branch-outline',
    route:       '/(tabs)/projects',
    color:       '#FB923C',
  },
  {
    label:       'Analytics',
    description: 'Focus patterns · Consistency · Goal health',
    icon:        'bar-chart-outline',
    route:       '/(tabs)/analytics',
    color:       '#34D399',
  },
  {
    label:       'Schedule',
    description: 'Fixed events · Classes · Recurring blocks',
    icon:        'time-outline',
    route:       '/(tabs)/schedule',
    color:       '#6C8EBF',
  },
  {
    label:       'Rules',
    description: 'Discipline rules · Habits · Boundaries',
    icon:        'shield-checkmark-outline',
    route:       '/(tabs)/rules',
    color:       '#4ADE80',
  },
  {
    label:       'Habits',
    description: 'Daily streaks · 7-day grid · Consistency',
    icon:        'flame-outline',
    route:       '/(tabs)/habits',
    color:       '#4ADE80',
  },
];

const ACCOUNT: NavItem[] = [
  {
    label:       'Profile',
    description: 'Identity · Energy · Work style',
    icon:        'person-outline',
    route:       '/(tabs)/profile',
    color:       Colors.textSecondary,
  },
  {
    label:       'Settings',
    description: 'API key · Language · Preferences',
    icon:        'settings-outline',
    route:       '/(tabs)/settings',
    color:       Colors.textSecondary,
  },
];

// ─── Row components ───────────────────────────────────────────────────────────

function NavRow({ item }: { item: NavItem }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(item.route as any)}
      activeOpacity={0.75}
    >
      <View style={[styles.rowIcon, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
        <Ionicons name={item.icon} size={18} color={item.color} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{item.label}</Text>
        <Text style={styles.rowDesc}>{item.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const profile = useAppStore((s) => s.profile);
  const goals   = useAppStore((s) => s.goals);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>Navigation</Text>
          <Text style={styles.headerTitle}>More</Text>
          {profile?.name && (
            <Text style={styles.headerSub}>{profile.name}</Text>
          )}
        </View>

        {/* ── Quick stats ────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{goals.length}</Text>
            <Text style={styles.statLabel}>Life Tracks</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{profile?.lifeRole ?? '—'}</Text>
            <Text style={styles.statLabel}>Role</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{profile?.energyStyle ?? '—'}</Text>
            <Text style={styles.statLabel}>Energy</Text>
          </View>
        </View>

        {/* ── Systems ────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Systems</Text>
          <View style={styles.card}>
            {SYSTEMS.map((item, i) => (
              <React.Fragment key={item.label}>
                <NavRow item={item} />
                {i < SYSTEMS.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* ── Account ────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            {ACCOUNT.map((item, i) => (
              <React.Fragment key={item.label}>
                <NavRow item={item} />
                {i < ACCOUNT.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        <Text style={styles.version}>LifeOS 2.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },

  header: { gap: 2, marginBottom: Spacing.xs },
  headerLabel: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  headerSub:   { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
  },
  statItem:    { flex: 1, alignItems: 'center', gap: 3 },
  statNum:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, textTransform: 'capitalize' },
  statLabel:   { fontSize: FontSize.xs, color: Colors.textMuted },
  statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },

  section:      { gap: Spacing.sm },
  sectionTitle: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.md,
  },
  rowDisabled: { opacity: 0.55 },
  rowIcon: {
    width: 36, height: 36, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  rowText:      { flex: 1, gap: 2 },
  rowLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowLabel:     { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  rowLabelDisabled: { color: Colors.textSecondary },
  rowDesc:      { fontSize: FontSize.xs, color: Colors.textMuted },

  badge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: Radius.full, backgroundColor: Colors.surfaceHigh,
    borderWidth: 1, borderColor: Colors.border,
  },
  badgeText: { fontSize: FontSize.xs - 1, color: Colors.textMuted, fontWeight: FontWeight.medium },

  divider: { height: 1, backgroundColor: Colors.border, marginLeft: Spacing.md + 36 + Spacing.md },

  version: {
    textAlign: 'center', fontSize: FontSize.xs,
    color: Colors.textMuted, marginTop: Spacing.sm,
  },
});
