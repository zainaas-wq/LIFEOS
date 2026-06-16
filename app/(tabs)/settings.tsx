import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
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
import { BetaWalkthrough } from '../../src/components/BetaWalkthrough';
import { PrivacyModal } from '../../src/components/PrivacyModal';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';

export default function SettingsScreen() {
  const profile               = useAppStore((s) => s.profile);
  const session               = useAppStore((s) => s.session);
  const isGuestMode           = useAppStore((s) => s.isGuestMode);
  const updateProfile         = useAppStore((s) => s.updateProfile);
  const resetAllData          = useAppStore((s) => s.resetAllData);
  const analyticsOptOut       = useAppStore((s) => s.analyticsOptOut);
  const setAnalyticsOptOut    = useAppStore((s) => s.setAnalyticsOptOut);
  const walkthroughComplete   = useAppStore((s) => s.walkthroughComplete);
  const hasSeenWelcome        = useAppStore((s) => s.hasSeenWelcome);
  const goals                 = useAppStore((s) => s.goals);
  const projects              = useAppStore((s) => s.projects);
  const localMemories         = useAppStore((s) => s.localMemories);
  const courses               = useAppStore((s) => s.courses);
  const rules                 = useAppStore((s) => s.rules);
  const projectIntelligence   = useAppStore((s) => s.projectIntelligence);
  const academicRisks         = useAppStore((s) => s.academicRisks);
  const goalIntelligence      = useAppStore((s) => s.goalIntelligence);
  const topicWeakness         = useAppStore((s) => s.topicWeakness);
  const betaStats             = useAppStore((s) => s.betaStats);

  const isAuthenticated = !!session && !isGuestMode;

  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showReadiness, setShowReadiness]     = useState(false);
  const [showPrivacy, setShowPrivacy]         = useState(false);

  // ── Beta Readiness Score ───────────────────────────────────────────────────
  const readiness = useMemo(() => {
    const productScore = Math.min(100,
      (goals.length > 0   ? 25 : 0) +
      (projects.length > 0 ? 25 : 0) +
      (localMemories.filter(m => m.source !== 'goal').length > 0 ? 25 : 0) +
      (courses.length > 0 ? 15 : 0) +
      (rules.length > 0   ? 10 : 0)
    );
    const uxScore = Math.min(100,
      (hasSeenWelcome       ? 35 : 0) +
      (walkthroughComplete  ? 35 : 0) +
      30 // base: error + loading states implemented
    );
    const intelligenceScore = Math.min(100,
      (Object.keys(projectIntelligence).length > 0   ? 25 : 0) +
      (academicRisks.length > 0                      ? 25 : 0) +
      (Object.keys(goalIntelligence).length > 0      ? 25 : 0) +
      (Object.keys(topicWeakness).length > 0         ? 25 : 0)
    );
    const technicalScore = 100; // error states + analytics + loading states + notifications: all implemented
    const overall = Math.round((productScore + uxScore + intelligenceScore + technicalScore) / 4);
    const goNoGo: 'GO' | 'CONDITIONAL' | 'NO-GO' =
      overall >= 75 ? 'GO' : overall >= 50 ? 'CONDITIONAL' : 'NO-GO';
    return { productScore, uxScore, intelligenceScore, technicalScore, overall, goNoGo };
  }, [goals, projects, localMemories, courses, rules, hasSeenWelcome,
      walkthroughComplete, projectIntelligence, academicRisks, goalIntelligence, topicWeakness]);

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

        {/* Privacy & Trust */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Trust</Text>
          <Card elevated>
            {/* Quick trust signals */}
            <View style={styles.trustSignalRow}>
              <View style={styles.trustSignal}>
                <Ionicons name="phone-portrait-outline" size={16} color="#6C8EBF" />
                <Text style={styles.trustSignalText}>Stored locally</Text>
              </View>
              <View style={styles.trustSignal}>
                <Ionicons name="lock-closed-outline" size={16} color="#4ADE80" />
                <Text style={styles.trustSignalText}>No ads ever</Text>
              </View>
              <View style={styles.trustSignal}>
                <Ionicons name="eye-off-outline" size={16} color="#F472B6" />
                <Text style={styles.trustSignalText}>Your data only</Text>
              </View>
            </View>

            <Divider />

            <TouchableOpacity
              style={styles.exportRow}
              onPress={() => setShowPrivacy(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="shield-checkmark-outline" size={18} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.exportLabel}>Privacy Details</Text>
                <Text style={styles.exportSub}>What data is stored, what AI can access</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </TouchableOpacity>

            <Divider />

            <View style={styles.trustRow}>
              <Ionicons name="bar-chart-outline" size={16} color={Colors.textSecondary} />
              <View style={[styles.trustText, { flex: 1 }]}>
                <Text style={styles.trustTitle}>Anonymous analytics</Text>
                <Text style={styles.trustDesc}>
                  Feature usage counts only — no content, no names.
                </Text>
              </View>
              <Switch
                value={!analyticsOptOut}
                onValueChange={(v) => setAnalyticsOptOut(!v)}
                trackColor={{ false: Colors.surfaceHigh, true: Colors.goldMuted }}
                thumbColor={!analyticsOptOut ? Colors.gold : Colors.textMuted}
              />
            </View>

            <Divider />

            <TouchableOpacity style={styles.exportRow} onPress={handleExportData} activeOpacity={0.7}>
              <Ionicons name="share-outline" size={18} color={Colors.gold} />
              <Text style={styles.exportLabel}>Export All Data as JSON</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          </Card>
        </View>

        {/* Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Help</Text>
          <Card elevated>
            <TouchableOpacity style={styles.exportRow} onPress={() => setShowWalkthrough(true)} activeOpacity={0.7}>
              <Ionicons name="map-outline" size={18} color={Colors.gold} />
              <View style={styles.helpTextWrap}>
                <Text style={styles.exportLabel}>Take the Guided Tour</Text>
                {walkthroughComplete && (
                  <Text style={styles.helpBadge}>Completed</Text>
                )}
              </View>
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
              <Text style={styles.aboutValue}>1.0.0 Beta</Text>
            </View>
            <Divider />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Build</Text>
              <Text style={styles.aboutValue}>Phase D · 2026</Text>
            </View>
          </Card>
        </View>

        {/* Modals */}
        <BetaWalkthrough visible={showWalkthrough} onClose={() => setShowWalkthrough(false)} />
        <PrivacyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} />

        {/* Beta Readiness Report */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beta Readiness</Text>
          <Card elevated>
            <TouchableOpacity
              style={styles.readinessHeader}
              onPress={() => setShowReadiness((v) => !v)}
              activeOpacity={0.8}
            >
              <View style={styles.readinessLeft}>
                <Text style={[
                  styles.readinessScore,
                  { color: readiness.goNoGo === 'GO' ? Colors.success : readiness.goNoGo === 'CONDITIONAL' ? Colors.warning : Colors.error },
                ]}>
                  {readiness.overall}
                </Text>
                <View>
                  <Text style={styles.readinessLabel}>Overall Score</Text>
                  <View style={[
                    styles.readinessBadge,
                    {
                      backgroundColor: readiness.goNoGo === 'GO' ? Colors.successMuted :
                                        readiness.goNoGo === 'CONDITIONAL' ? 'rgba(251,191,36,0.12)' :
                                        Colors.errorMuted,
                    },
                  ]}>
                    <Text style={[
                      styles.readinessBadgeText,
                      { color: readiness.goNoGo === 'GO' ? Colors.success : readiness.goNoGo === 'CONDITIONAL' ? Colors.warning : Colors.error },
                    ]}>
                      {readiness.goNoGo}
                    </Text>
                  </View>
                </View>
              </View>
              <Ionicons
                name={showReadiness ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textMuted}
              />
            </TouchableOpacity>

            {showReadiness && (
              <>
                <Divider />
                <View style={styles.readinessGrid}>
                  {[
                    { label: 'Product', score: readiness.productScore, hint: 'Goals, projects, memories, courses' },
                    { label: 'UX', score: readiness.uxScore, hint: 'Welcome flow, walkthrough, guidance' },
                    { label: 'Intelligence', score: readiness.intelligenceScore, hint: 'AI systems active & computing' },
                    { label: 'Technical', score: readiness.technicalScore, hint: 'Error states, analytics, loading' },
                  ].map(({ label, score, hint }) => (
                    <View key={label} style={styles.readinessItem}>
                      <View style={styles.readinessItemTop}>
                        <Text style={styles.readinessItemLabel}>{label}</Text>
                        <Text style={[
                          styles.readinessItemScore,
                          { color: score >= 75 ? Colors.success : score >= 50 ? Colors.warning : Colors.error },
                        ]}>
                          {score}
                        </Text>
                      </View>
                      <View style={styles.readinessBar}>
                        <View style={[
                          styles.readinessBarFill,
                          {
                            width: `${score}%`,
                            backgroundColor: score >= 75 ? Colors.success : score >= 50 ? Colors.warning : Colors.error,
                          },
                        ]} />
                      </View>
                      <Text style={styles.readinessHint}>{hint}</Text>
                    </View>
                  ))}
                </View>

                {/* Phase E — Engagement metrics */}
                <Divider />
                <View style={styles.phaseESection}>
                  <Text style={styles.phaseETitle}>Phase E — Engagement</Text>

                  {/* Recommendation Acceptance Rate */}
                  <View style={styles.phaseERow}>
                    <Ionicons name="thumbs-up-outline" size={14} color={Colors.gold} />
                    <Text style={styles.phaseELabel}>Rec. acceptance rate</Text>
                    <Text style={styles.phaseEValue}>
                      {betaStats.recommendationsShown > 0
                        ? `${Math.round((betaStats.recommendationsAccepted / betaStats.recommendationsShown) * 100)}%`
                        : '—'}
                      {betaStats.recommendationsShown > 0 &&
                        ` (${betaStats.recommendationsAccepted}/${betaStats.recommendationsShown})`}
                    </Text>
                  </View>

                  {/* Retention milestones */}
                  <View style={styles.phaseERow}>
                    <Ionicons name="calendar-outline" size={14} color="#6C8EBF" />
                    <Text style={styles.phaseELabel}>Retention days hit</Text>
                    <View style={styles.retentionChips}>
                      {([1, 3, 7, 14] as const).map((day) => (
                        <View
                          key={day}
                          style={[
                            styles.retentionChip,
                            betaStats.daysActiveTracked.includes(day) && styles.retentionChipHit,
                          ]}
                        >
                          <Text style={[
                            styles.retentionChipText,
                            betaStats.daysActiveTracked.includes(day) && styles.retentionChipTextHit,
                          ]}>
                            D{day}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Feedback */}
                  <View style={styles.phaseERow}>
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color="#4ADE80" />
                    <Text style={styles.phaseELabel}>Beta feedback</Text>
                    <Text style={[
                      styles.phaseEValue,
                      { color: betaStats.feedbackSubmitted ? Colors.success : Colors.textMuted },
                    ]}>
                      {betaStats.feedbackSubmitted ? 'Submitted' : 'Pending'}
                    </Text>
                  </View>
                </View>

                {/* Link to admin review */}
                <Divider />
                <TouchableOpacity
                  style={styles.exportRow}
                  onPress={() => router.push('/beta-feedback-review' as any)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="reader-outline" size={18} color={Colors.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exportLabel}>View Beta Feedback</Text>
                    <Text style={styles.exportSub}>Read what users said — filter by score, return intent</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              </>
            )}
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
  trustBlock: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  trustText: { gap: 3 },
  trustTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
  },
  trustDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 17,
    maxWidth: 260,
  },
  helpTextWrap: { flex: 1 },
  helpBadge: {
    fontSize: FontSize.xs,
    color: Colors.success,
    marginTop: 1,
  },
  trustSignalRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
  },
  trustSignal: {
    alignItems: 'center',
    gap: 4,
  },
  trustSignalText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  exportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  exportLabel: {
    fontSize: FontSize.sm,
    color: Colors.gold,
  },
  exportSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 1,
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

  // ── Beta Readiness ──────────────────────────────────────────────────────────
  readinessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readinessLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  readinessScore: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
  },
  readinessLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  readinessBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  readinessBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
  },
  readinessGrid: {
    gap: Spacing.md,
    paddingTop: Spacing.sm,
  },
  readinessItem: { gap: 4 },
  readinessItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  readinessItemLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  readinessItemScore: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  readinessBar: {
    height: 4,
    backgroundColor: Colors.surfaceHigh,
    borderRadius: 2,
  },
  readinessBarFill: {
    height: 4,
    borderRadius: 2,
  },
  readinessHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // ── Phase E metrics ──────────────────────────────────────────────────────────
  phaseESection: {
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  phaseETitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.xs,
  },
  phaseERow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  phaseELabel: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  phaseEValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
  },
  retentionChips: {
    flexDirection: 'row',
    gap: 4,
  },
  retentionChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceHigh,
  },
  retentionChipHit: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldMuted,
  },
  retentionChipText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  retentionChipTextHit: {
    color: Colors.gold,
    fontWeight: FontWeight.semibold,
  },
});
