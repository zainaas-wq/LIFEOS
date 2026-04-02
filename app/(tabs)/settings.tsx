import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { signOut } from '../../src/services/authService';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Divider } from '../../src/components/ui/Divider';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';

export default function SettingsScreen() {
  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
  const isGuestMode = useAppStore((s) => s.isGuestMode);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const resetAllData = useAppStore((s) => s.resetAllData);

  const isAuthenticated = !!session && !isGuestMode;

  const store = useAppStore((s) => s);

  const handleExportData = async () => {
    try {
      const exportData = {
        profile: store.profile,
        goals: store.goals,
        rules: store.rules,
        scheduleEvents: store.scheduleEvents,
        skillPlans: store.skillPlans,
        focusSessions: store.focusSessions,
        tasks: store.tasks,
        exportedAt: new Date().toISOString(),
      };
      await Share.share({ message: JSON.stringify(exportData, null, 2), title: 'LifeOS Data Export' });
    } catch {
      Alert.alert('Export Failed', 'Could not export data.');
    }
  };

  const [editingFocus, setEditingFocus] = useState(false);
  const [focusValue, setFocusValue] = useState(profile?.mainFocus ?? '');

  const handleSaveFocus = () => {
    if (focusValue.trim()) {
      updateProfile({ mainFocus: focusValue.trim() });
    }
    setEditingFocus(false);
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Data',
      'This will permanently delete all your tasks, plans, rules, and preferences. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: () => {
            resetAllData();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          signOut().catch(console.warn);
          // resetAllData + redirect handled by SIGNED_OUT in _layout.tsx
        },
      },
    ]);
  };

  const handleUpgrade = () => {
    Alert.alert(
      'Pro Subscription',
      'Pro features: unlimited rules, advanced analytics, and priority planning.\n\nSubscription management coming soon.',
      [{ text: 'Got it', style: 'default' }]
    );
  };

  if (!profile) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenLabel}>Settings</Text>
          <Text style={styles.screenTitle}>Your System</Text>
        </View>

        {/* Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {profile.mainFocus?.charAt(0)?.toUpperCase() ?? 'L'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileFocus} numberOfLines={1}>
              {profile.mainFocus || 'No focus set'}
            </Text>
            <Text style={styles.profileBadge}>
              {profile.isPro ? '⚡ Pro' : 'Free Plan'}
            </Text>
          </View>
          <View style={styles.seriousnessTag}>
            <Text style={styles.seriousnessNum}>{profile.seriousnessScore}</Text>
            <Text style={styles.seriousnessLabel}>/10</Text>
          </View>
        </Card>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>

          <Card elevated>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Main Focus</Text>
                <Text style={styles.settingValue} numberOfLines={1}>
                  {profile.mainFocus || '—'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setEditingFocus(!editingFocus)}
                style={styles.editBtn}
              >
                <Ionicons
                  name={editingFocus ? 'checkmark' : 'pencil-outline'}
                  size={16}
                  color={Colors.gold}
                />
              </TouchableOpacity>
            </View>

            {editingFocus && (
              <View style={styles.editField}>
                <Input
                  value={focusValue}
                  onChangeText={setFocusValue}
                  placeholder="Your current main focus..."
                  autoFocus
                />
                <Button
                  label="Save"
                  onPress={handleSaveFocus}
                  size="sm"
                  variant="ghost"
                  style={styles.saveBtn}
                />
              </View>
            )}

            <Divider />

            <SettingRowStatic label="Biggest Distraction" value={profile.biggestDistraction} />
            <Divider />
            <SettingRowStatic label="Habit to Remove" value={profile.habitToRemove} />
            <Divider />
            <SettingRowStatic label="Habit to Build" value={profile.habitToBuild} />
            <Divider />

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Seriousness Score</Text>
              <View style={styles.seriousnessRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => updateProfile({ seriousnessScore: n })}
                    style={[
                      styles.scoreChip,
                      profile.seriousnessScore === n && styles.scoreChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.scoreChipText,
                        profile.seriousnessScore === n && styles.scoreChipTextActive,
                      ]}
                    >
                      {n}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Card>
        </View>

        {/* Subscription */}
        {!profile.isPro && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subscription</Text>
            <Card gold>
              <View style={styles.proRow}>
                <View>
                  <Text style={styles.proTitle}>LifeOS Pro</Text>
                  <Text style={styles.proDesc}>
                    Unlimited rules · Advanced insights · Priority planning
                  </Text>
                </View>
                <Button
                  label="Upgrade"
                  onPress={handleUpgrade}
                  size="sm"
                />
              </View>
            </Card>
          </View>
        )}

        {/* Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Privacy</Text>
          <Card elevated>
            <View style={styles.dataRow}>
              <Ionicons name="phone-portrait-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.dataLabel}>All data is stored locally on this device.</Text>
            </View>
            <Divider />
            <TouchableOpacity style={styles.exportRow} onPress={handleExportData} activeOpacity={0.7}>
              <Ionicons name="share-outline" size={18} color={Colors.gold} />
              <Text style={styles.exportLabel}>Export Data as JSON</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          </Card>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Card elevated>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Version</Text>
              <Text style={styles.aboutValue}>1.0.0</Text>
            </View>
            <Divider />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Build</Text>
              <Text style={styles.aboutValue}>MVP · 2026</Text>
            </View>
          </Card>
        </View>

        {/* Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <Card elevated>
            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => router.push('/legal/terms' as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.legalLabel}>Terms of Service</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
            <Divider />
            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => router.push('/legal/privacy' as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.legalLabel}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          </Card>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          {isAuthenticated && (
            <Button
              label="Sign Out"
              onPress={handleSignOut}
              variant="secondary"
              fullWidth
            />
          )}
          <Button
            label="Reset All Data"
            onPress={handleResetData}
            variant="danger"
            fullWidth
          />
          <Text style={styles.dangerHint}>
            This will delete all your data and restart onboarding.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRowStatic({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue} numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.sm,
  },
  screenLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  screenTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1.5,
    borderColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileFocus: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  profileBadge: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  seriousnessTag: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  seriousnessNum: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
  },
  seriousnessLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: FontWeight.semibold,
    paddingLeft: 2,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  settingValue: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    textAlign: 'right',
    flex: 1,
  },
  editBtn: {
    padding: 4,
  },
  editField: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  saveBtn: {
    alignSelf: 'flex-end',
  },
  seriousnessRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'flex-end',
    flex: 1,
  },
  scoreChip: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: Colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreChipActive: {
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  scoreChipText: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  scoreChipTextActive: {
    color: Colors.gold,
    fontWeight: FontWeight.bold,
  },
  proRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  proTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.gold,
  },
  proDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  dataLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  exportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  exportLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.gold,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  aboutLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  aboutValue: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  dangerHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  legalLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});
