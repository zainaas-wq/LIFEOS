/**
 * Profile tab — Sprint 2 Block D
 *
 * Identity Engine / Profile screen for LifeOS 2.0.
 * Sections: Identity · Fixed Schedule · Life Tracks · Language · Coach AI ·
 *           Data & Privacy · About · Danger Zone
 *
 * Migration notes:
 * - settings.tsx is untouched; /(tabs)/settings still renders the legacy screen
 * - All critical settings logic (API key, export, sign out, reset) is preserved here
 * - Removed from product surface: seriousnessScore, mainFocus editor,
 *   biggestDistraction/habitToRemove/habitToBuild, subscription section
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDirection } from '../../src/hooks/useDirection';
import { useAppStore } from '../../src/store/useAppStore';
import { signOut } from '../../src/services/authService';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Divider } from '../../src/components/ui/Divider';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import { restorePurchases, openManageSubscriptions } from '../../src/services/purchaseService';
import { useMonthlyUsage } from '../../src/services/usageService';
import type { UseMonthlyUsageResult } from '../../src/services/usageService';
import { UpgradeModal } from '../../src/components/upgrade/UpgradeModal';
import { computeSubscriptionState, getTrialDaysLeft } from '../../src/lib/trialUtils';
import type { LifeRole, EnergyStyle, WorkStyle, UserType, ScheduleType } from '../../src/types';

// ─── Static data (no labels — labels built inside component) ──────────────────

const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'ar', label: 'AR', name: 'العربية' },
  { code: 'he', label: 'HE', name: 'עברית' },
] as const;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function labelFor<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T | undefined,
  fallback: string,
): string {
  return options.find((o) => o.value === value)?.label ?? fallback;
}

// ─── Identity row (inline picker) ────────────────────────────────────────────

function IdentityRow<T extends string>({
  label,
  displayValue,
  currentValue,
  expanded,
  onToggle,
  options,
  onSelect,
}: {
  label: string;
  displayValue: string;
  currentValue: T | undefined;
  expanded: boolean;
  onToggle: () => void;
  options: Array<{ value: T; label: string }>;
  onSelect: (v: T) => void;
}) {
  const dir = useDirection();
  return (
    <>
      <TouchableOpacity style={[styles.identityRow, { flexDirection: dir.rowDir }]} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.identityLabel}>{label}</Text>
        <View style={[styles.identityValueRow, { flexDirection: dir.rowDir }]}>
          <Text style={styles.identityValue}>{displayValue}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={Colors.textMuted}
          />
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.identityOptions}>
          {options.map((opt) => {
            const active = currentValue === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.identityOption, active && styles.identityOptionActive, { flexDirection: dir.rowDir }]}
                onPress={() => { onSelect(opt.value); onToggle(); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.identityOptionText, active && styles.identityOptionTextActive]}>
                  {opt.label}
                </Text>
                {active && <Ionicons name="checkmark" size={14} color={Colors.gold} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </>
  );
}

// ─── Section header helper ────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

// ─── AI Usage Card ────────────────────────────────────────────────────────────

const USAGE_DANGER_COLOR = '#F87171';

function AIUsageCard({ usage }: { usage: UseMonthlyUsageResult }) {
  const { t } = useTranslation();
  const dir = useDirection();

  if (usage.isLoading) {
    return (
      <View style={usageStyles.wrap}>
        <View style={[usageStyles.headerRow, { flexDirection: dir.rowDir }]}>
          <View style={usageStyles.iconCircle}>
            <Ionicons name="sparkles" size={13} color={Colors.gold} />
          </View>
          <Text style={usageStyles.tierName}>{t('profile.coach_ai')}</Text>
        </View>
        <View style={[usageStyles.barTrack, usageStyles.barTrackLoading]} />
      </View>
    );
  }

  if (usage.error) {
    return (
      <View style={usageStyles.wrap}>
        <View style={[usageStyles.headerRow, { flexDirection: dir.rowDir }]}>
          <View style={usageStyles.iconCircle}>
            <Ionicons name="sparkles" size={13} color={Colors.gold} />
          </View>
          <Text style={usageStyles.tierName}>{t('profile.coach_ai')}</Text>
          <Text style={usageStyles.availablePill}>{t('profile.usage_available')}</Text>
        </View>
      </View>
    );
  }

  const isDanger  = usage.percentUsed >= 90;
  const isWarning = !isDanger && usage.percentUsed >= 70;
  const accentColor = isDanger ? USAGE_DANGER_COLOR : Colors.gold;

  return (
    <View style={usageStyles.wrap}>
      <View style={[usageStyles.headerRow, { flexDirection: dir.rowDir }]}>
        <View style={usageStyles.iconCircle}>
          <Ionicons name="sparkles" size={13} color={Colors.gold} />
        </View>
        <Text style={usageStyles.tierName}>{usage.tierName}</Text>
      </View>
      <Text style={[usageStyles.creditsLine, (isWarning || isDanger) ? { color: accentColor } : undefined]}>
        {t('profile.usage_credits', { used: usage.creditsUsed, quota: usage.creditsQuota })}
      </Text>
      <View style={usageStyles.barTrack}>
        <View style={[usageStyles.barFill, { width: `${usage.percentUsed}%`, backgroundColor: accentColor }]} />
      </View>
      <Text style={usageStyles.resetDate}>{t('profile.usage_resets', { date: usage.resetDate })}</Text>
    </View>
  );
}

const usageStyles = StyleSheet.create({
  wrap:       { gap: Spacing.sm },
  headerRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  iconCircle: {
    width: 22, height: 22, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  tierName: {
    flex: 1,
    fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary,
  },
  availablePill: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.medium },
  creditsLine:   { fontSize: FontSize.sm, color: Colors.textSecondary },
  barTrack: {
    height: 4, backgroundColor: Colors.border,
    borderRadius: Radius.full, overflow: 'hidden',
  },
  barTrackLoading: { opacity: 0.4 },
  barFill:   { height: 4, borderRadius: Radius.full },
  resetDate: { fontSize: FontSize.xs, color: Colors.textMuted },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { t } = useTranslation();
  const dir = useDirection();

  const profile             = useAppStore((s) => s.profile);
  const session             = useAppStore((s) => s.session);
  const isGuestMode         = useAppStore((s) => s.isGuestMode);
  const updateProfile       = useAppStore((s) => s.updateProfile);
  const resetAllData        = useAppStore((s) => s.resetAllData);
  const setLanguage         = useAppStore((s) => s.setLanguage);
  const store               = useAppStore((s) => s);
  const dayStreak           = useAppStore((s) => s.dayStreak);
  const totalCompletedTasks = useAppStore((s) => s.totalCompletedTasks);
  const trialStartDate      = useAppStore((s) => s.trialStartDate);
  const isPro               = useAppStore((s) => s.profile?.isPro ?? false);

  const isAuthenticated = !!session && !isGuestMode;
  const usage = useMonthlyUsage();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // ── Subscription management state ────────────────────────────────────────
  type RestorePhase = 'idle' | 'loading' | 'success' | 'none' | 'error';
  const [restorePhase, setRestorePhase] = useState<RestorePhase>('idle');
  const [restoreMsg,   setRestoreMsg]   = useState('');

  const handleRestore = async () => {
    setRestorePhase('loading');
    setRestoreMsg('');
    const result = await restorePurchases();
    if (result.restored) {
      await usage.refresh().catch(() => {});
      setRestorePhase('success');
      setRestoreMsg(t('profile.restore_success'));
      setTimeout(() => { setRestorePhase('idle'); setRestoreMsg(''); }, 3000);
      return;
    }
    if (result.reason === 'no_active_subscription') {
      setRestorePhase('none');
      setRestoreMsg(t('profile.restore_none'));
      setTimeout(() => { setRestorePhase('idle'); setRestoreMsg(''); }, 3000);
      return;
    }
    setRestorePhase('error');
    setRestoreMsg(result.message ?? t('profile.restore_failed'));
    setTimeout(() => { setRestorePhase('idle'); setRestoreMsg(''); }, 4000);
  };

  const handleManageSubscription = () => {
    openManageSubscriptions();
  };

  // ── Option arrays built here so t() is in scope ───────────────────────────
  const ROLE_OPTIONS: Array<{ value: LifeRole; label: string }> = [
    { value: 'student',      label: t('profile.role_student') },
    { value: 'employee',     label: t('profile.role_employee') },
    { value: 'freelancer',   label: t('profile.role_freelancer') },
    { value: 'shift-worker', label: t('profile.role_shift_worker') },
    { value: 'creator',      label: t('profile.role_creator') },
    { value: 'other',        label: t('profile.role_other') },
  ];

  const ENERGY_OPTIONS: Array<{ value: EnergyStyle; label: string }> = [
    { value: 'morning',   label: t('profile.energy_morning') },
    { value: 'afternoon', label: t('profile.energy_afternoon') },
    { value: 'evening',   label: t('profile.energy_evening') },
    { value: 'night',     label: t('profile.energy_night') },
    { value: 'flexible',  label: t('profile.energy_flexible') },
  ];

  const WORK_OPTIONS: Array<{ value: WorkStyle; label: string }> = [
    { value: 'deep',         label: t('profile.work_deep') },
    { value: 'balanced',     label: t('profile.work_balanced') },
    { value: 'short-bursts', label: t('profile.work_short_bursts') },
  ];

  // Subscription state
  const subState   = computeSubscriptionState(trialStartDate, isPro);
  const daysLeft   = getTrialDaysLeft(trialStartDate);

  // Identity picker state
  const [editingField, setEditingField] = useState<'role' | 'energy' | 'work' | null>(null);

  const toggleField = (field: 'role' | 'energy' | 'work') => {
    setEditingField((prev) => (prev === field ? null : field));
  };

  // Fixed schedule state
  const [scheduleStart, setScheduleStart] = useState(profile?.fixedScheduleStart ?? '');
  const [scheduleEnd,   setScheduleEnd]   = useState(profile?.fixedScheduleEnd   ?? '');
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSaveSchedule = () => {
    const start = scheduleStart.trim();
    const end   = scheduleEnd.trim();

    if (start && !TIME_RE.test(start)) {
      Alert.alert(t('profile.schedule_invalid_time_title'), t('profile.schedule_invalid_time_msg'));
      return;
    }
    if (end && !TIME_RE.test(end)) {
      Alert.alert(t('profile.schedule_invalid_time_title'), t('profile.schedule_invalid_time_msg'));
      return;
    }

    updateProfile({
      fixedScheduleStart: start || undefined,
      fixedScheduleEnd:   end   || undefined,
    });
    setScheduleSaved(true);
    setTimeout(() => setScheduleSaved(false), 2000);
  };

  const handleExportData = async () => {
    try {
      const payload = {
        profile: store.profile,
        goals: store.goals,
        rules: store.rules,
        scheduleEvents: store.scheduleEvents,
        skillPlans: store.skillPlans,
        focusSessions: store.focusSessions,
        tasks: store.tasks,
        exportedAt: new Date().toISOString(),
      };
      await Share.share({ message: JSON.stringify(payload, null, 2), title: t('profile.export_share_title') });
    } catch {
      Alert.alert(t('profile.export_failed_title'), t('profile.export_failed_msg'));
    }
  };

  const handleSignOut = () => {
    Alert.alert(t('profile.sign_out'), t('profile.sign_out_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.sign_out'), style: 'destructive', onPress: () => signOut().catch(console.warn) },
    ]);
  };

  const handleResetData = () => {
    Alert.alert(
      t('profile.reset_data'),
      t('profile.reset_confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.reset_button'),
          style: 'destructive',
          onPress: () => { resetAllData(); router.replace('/onboarding'); },
        },
      ]
    );
  };

  if (!profile) return null;

  // ── Derived display values ─────────────────────────────────────────────────

  const notSet = t('profile.not_set');

  const initials = profile.name
    ? profile.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : (profile.mainFocus?.charAt(0)?.toUpperCase() ?? 'L');

  const roleLabel    = labelFor(ROLE_OPTIONS,   profile.lifeRole,    notSet);
  const energyLabel  = labelFor(ENERGY_OPTIONS, profile.energyStyle, notSet);
  const workLabel    = labelFor(WORK_OPTIONS,   profile.workStyle,   notSet);
  const tracks       = profile.selectedTrackTypes ?? [];
  const currentLang  = profile.language ?? 'en';
  const hasSchedule  = !!(profile.fixedScheduleStart || profile.fixedScheduleEnd);

  // System config derived labels
  const userTypeLabel = ((): string => {
    const map: Record<string, string> = {
      worker:         t('profile.system_user_type_worker'),
      student:        t('profile.system_user_type_student'),
      worker_student: t('profile.system_user_type_worker_student'),
      flexible:       t('profile.system_user_type_flexible'),
    };
    return profile.userType ? (map[profile.userType] ?? profile.userType) : notSet;
  })();

  const scheduleTypeLabel = ((): string => {
    const map: Record<string, string> = {
      fixed:         t('profile.system_schedule_type_fixed'),
      weekly_known:  t('profile.system_schedule_type_weekly_known'),
      daily_input:   t('profile.system_schedule_type_daily_input'),
    };
    return profile.scheduleType ? (map[profile.scheduleType] ?? profile.scheduleType) : notSet;
  })();

  const DOW_NAMES: Record<number, string> = {
    0: t('profile.day_0'), 1: t('profile.day_1'), 2: t('profile.day_2'),
    3: t('profile.day_3'), 4: t('profile.day_4'), 5: t('profile.day_5'),
    6: t('profile.day_6'),
  };
  const offDaysLabel = (profile.offDays ?? []).length > 0
    ? (profile.offDays ?? []).map((d) => DOW_NAMES[d] ?? d).join(' · ')
    : t('profile.system_off_days_none');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Profile header card ────────────────────────────────────────── */}
        <View style={styles.profileHeaderCard}>
          <View style={[styles.profileHeaderTop, { flexDirection: dir.rowDir }]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.profileMeta}>
              <Text style={styles.profileName}>{profile.name || t('profile.name_fallback')}</Text>
              <Text style={styles.profileRole}>{roleLabel}</Text>
            </View>
          </View>
          {(dayStreak >= 1 || totalCompletedTasks > 0) && (
            <View style={[styles.headerStatStrip, { flexDirection: dir.rowDir }]}>
              {dayStreak >= 1 && (
                <View style={[styles.statChip, { flexDirection: dir.rowDir }]}>
                  <Text style={styles.statChipIcon}>🔥</Text>
                  <Text style={styles.statChipVal}>{dayStreak} day streak</Text>
                </View>
              )}
              {totalCompletedTasks > 0 && (
                <View style={[styles.statChip, { backgroundColor: Colors.successMuted, borderColor: 'rgba(74,222,128,0.2)', flexDirection: dir.rowDir }]}>
                  <Ionicons name="checkmark-circle-outline" size={11} color={Colors.success} />
                  <Text style={[styles.statChipVal, { color: Colors.success }]}>{totalCompletedTasks} tasks done</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Identity ───────────────────────────────────────────────────── */}
        <SectionLabel title={t('profile.identity_section')} />
        <Card elevated style={styles.identityCard}>
          <IdentityRow
            label={t('profile.life_role_label')}
            displayValue={roleLabel}
            currentValue={profile.lifeRole}
            expanded={editingField === 'role'}
            onToggle={() => toggleField('role')}
            options={ROLE_OPTIONS}
            onSelect={(v) => updateProfile({ lifeRole: v })}
          />
          <Divider />
          <IdentityRow
            label={t('profile.energy_style_label')}
            displayValue={energyLabel}
            currentValue={profile.energyStyle}
            expanded={editingField === 'energy'}
            onToggle={() => toggleField('energy')}
            options={ENERGY_OPTIONS}
            onSelect={(v) => updateProfile({ energyStyle: v })}
          />
          <Divider />
          <IdentityRow
            label={t('profile.work_style_label')}
            displayValue={workLabel}
            currentValue={profile.workStyle}
            expanded={editingField === 'work'}
            onToggle={() => toggleField('work')}
            options={WORK_OPTIONS}
            onSelect={(v) => updateProfile({ workStyle: v })}
          />
        </Card>

        {/* ── System Configuration ───────────────────────────────────────── */}
        <SectionLabel title={t('profile.system_config_section')} />
        <Card elevated style={sysStyles.card}>
          {/* Subscription / trial state */}
          {subState === 'pro' && (
            <View style={[sysStyles.row, { flexDirection: dir.rowDir }]}>
              <View style={[sysStyles.iconWrap, { backgroundColor: Colors.goldMuted }]}>
                <Ionicons name="star" size={13} color={Colors.gold} />
              </View>
              <Text style={sysStyles.rowLabel}>{t('profile.subscription_section')}</Text>
              <Text style={[sysStyles.rowValue, { color: Colors.gold }]}>{t('profile.pro_label')}</Text>
            </View>
          )}
          {subState === 'trial_active' && (
            <View style={[sysStyles.row, { flexDirection: dir.rowDir }]}>
              <View style={[sysStyles.iconWrap, { backgroundColor: Colors.goldMuted }]}>
                <Ionicons name="hourglass-outline" size={13} color={Colors.gold} />
              </View>
              <Text style={sysStyles.rowLabel}>{t('profile.subscription_section')}</Text>
              <Text style={[sysStyles.rowValue, { color: Colors.gold }]}>
                {(t('profile.trial_active_label') as string).replace('{{days}}', String(daysLeft))}
              </Text>
            </View>
          )}
          {subState === 'trial_expired' && (
            <View style={[sysStyles.row, { flexDirection: dir.rowDir }]}>
              <View style={[sysStyles.iconWrap, { backgroundColor: 'rgba(248,113,113,0.15)' }]}>
                <Ionicons name="alert-circle-outline" size={13} color="#F87171" />
              </View>
              <Text style={sysStyles.rowLabel}>{t('profile.subscription_section')}</Text>
              <Text style={[sysStyles.rowValue, { color: '#F87171' }]}>{t('profile.trial_expired_label')}</Text>
            </View>
          )}

          {/* User type */}
          <View style={[sysStyles.row, { flexDirection: dir.rowDir }]}>
            <View style={sysStyles.iconWrap}>
              <Ionicons name="person-outline" size={13} color={Colors.textSecondary} />
            </View>
            <Text style={sysStyles.rowLabel}>{t('profile.system_user_type_label')}</Text>
            <Text style={sysStyles.rowValue}>{userTypeLabel}</Text>
          </View>

          {/* Schedule type */}
          <View style={[sysStyles.row, { flexDirection: dir.rowDir }]}>
            <View style={sysStyles.iconWrap}>
              <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
            </View>
            <Text style={sysStyles.rowLabel}>{t('profile.system_schedule_type_label')}</Text>
            <Text style={sysStyles.rowValue}>{scheduleTypeLabel}</Text>
          </View>

          {/* Off days */}
          <View style={[sysStyles.row, { flexDirection: dir.rowDir }]}>
            <View style={sysStyles.iconWrap}>
              <Ionicons name="moon-outline" size={13} color={Colors.textSecondary} />
            </View>
            <Text style={sysStyles.rowLabel}>{t('profile.system_off_days_label')}</Text>
            <Text style={sysStyles.rowValue}>{offDaysLabel}</Text>
          </View>
        </Card>

        {/* ── Fixed Schedule ─────────────────────────────────────────────── */}
        <SectionLabel title={t('profile.fixed_schedule_section')} />
        <Card elevated>
          <Text style={styles.scheduleDesc}>
            {t('profile.fixed_schedule_desc')}
          </Text>

          {hasSchedule && !scheduleSaved && (
            <View style={[styles.scheduleCurrentRow, { flexDirection: dir.rowDir }]}>
              <Ionicons name="time-outline" size={14} color={Colors.gold} />
              <Text style={styles.scheduleCurrent}>
                {t('profile.schedule_active', {
                  start: profile.fixedScheduleStart ?? '—',
                  end:   profile.fixedScheduleEnd   ?? '—',
                })}
              </Text>
            </View>
          )}

          <View style={styles.scheduleInputRow}>
            <View style={styles.scheduleField}>
              <Text style={styles.scheduleFieldLabel}>{t('profile.schedule_from')}</Text>
              <TextInput
                style={styles.scheduleInput}
                value={scheduleStart}
                onChangeText={setScheduleStart}
                placeholder="09:00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="default"
                maxLength={5}
                autoCorrect={false}
              />
            </View>
            <Text style={styles.scheduleSep}>–</Text>
            <View style={styles.scheduleField}>
              <Text style={styles.scheduleFieldLabel}>{t('profile.schedule_to')}</Text>
              <TextInput
                style={styles.scheduleInput}
                value={scheduleEnd}
                onChangeText={setScheduleEnd}
                placeholder="22:00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="default"
                maxLength={5}
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              onPress={handleSaveSchedule}
              style={[styles.scheduleSaveBtn, scheduleSaved && styles.scheduleSaveBtnDone]}
              activeOpacity={0.8}
            >
              <Text style={[styles.scheduleSaveBtnText, scheduleSaved && styles.scheduleSaveBtnTextDone]}>
                {scheduleSaved ? t('profile.schedule_saved') : t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.scheduleHint}>{t('profile.schedule_hint')}</Text>
        </Card>

        {/* ── Life Tracks ────────────────────────────────────────────────── */}
        <SectionLabel title={t('profile.life_tracks_section')} />
        <Card elevated>
          {tracks.length > 0 ? (
            <>
              <View style={styles.chipRow}>
                {tracks.map((trackKey) => (
                  <View key={trackKey} style={styles.trackChip}>
                    <Text style={styles.trackChipText}>
                      {t(`lifeTracks.${trackKey}` as any) ?? trackKey}
                    </Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/plan' as any)}
                style={styles.tracksLink}
                activeOpacity={0.7}
              >
                <Text style={styles.tracksLinkText}>{t('profile.tracks_edit_link')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.tracksEmpty}>
              <Text style={styles.tracksEmptyText}>{t('profile.tracks_empty')}</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/plan' as any)} activeOpacity={0.7}>
                <Text style={styles.tracksLinkText}>{t('profile.tracks_setup_link')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* ── Language ───────────────────────────────────────────────────── */}
        <SectionLabel title={t('profile.language_section')} />
        <Card elevated>
          <View style={styles.langRow}>
            {LANGUAGES.map((lang) => {
              const active = currentLang === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langBtn, active && styles.langBtnActive]}
                  onPress={() => setLanguage(lang.code)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.langCode, active && styles.langCodeActive]}>
                    {lang.label}
                  </Text>
                  <Text style={[styles.langName, active && styles.langNameActive]}>
                    {lang.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.langNote}>{t('profile.language_restart_note')}</Text>
        </Card>

        {/* ── Coach ──────────────────────────────────────────────────────── */}
        <SectionLabel title={t('profile.coach_section')} />
        <Card elevated>
          {isAuthenticated ? (
            <>
              {/* Pro badge — only when tier is confirmed pro */}
              {!usage.isLoading && !usage.error && usage.tierId === 'pro' && (
                <>
                  <View style={[styles.proBadgeRow, { flexDirection: dir.rowDir }]}>
                    <View style={[styles.proBadgeChip, { flexDirection: dir.rowDir }]}>
                      <Ionicons name="star" size={11} color={Colors.gold} />
                      <Text style={styles.proBadgeChipText}>PRO</Text>
                    </View>
                    <Text style={styles.proActiveText}>{t('profile.sub_active')}</Text>
                  </View>
                  <Divider />
                </>
              )}

              <AIUsageCard usage={usage} />

              {/* Free user upgrade CTA */}
              {!usage.isLoading && !usage.error && usage.tierId === 'free' && (
                <>
                  <Divider />
                  <TouchableOpacity
                    onPress={() => setShowUpgradeModal(true)}
                    style={[styles.upgradeCta, { flexDirection: dir.rowDir }]}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="sparkles" size={13} color={Colors.gold} />
                    <Text style={styles.upgradeCtaText}>{t('profile.unlock_pro')}</Text>
                    <Ionicons name={dir.forwardIcon} size={13} color={Colors.textMuted} />
                  </TouchableOpacity>
                </>
              )}

              {/* Manage subscription — only for pro users */}
              {!usage.isLoading && !usage.error && usage.tierId === 'pro' && (
                <>
                  <Divider />
                  <TouchableOpacity
                    onPress={handleManageSubscription}
                    style={[styles.manageRow, { flexDirection: dir.rowDir }]}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="settings-outline" size={15} color={Colors.textSecondary} />
                    <Text style={styles.manageLabel}>{t('profile.manage_subscription')}</Text>
                    <Ionicons name={dir.forwardIcon} size={13} color={Colors.textMuted} />
                  </TouchableOpacity>
                </>
              )}

              {/* Restore Purchases — all authenticated users */}
              <Divider />
              <TouchableOpacity
                onPress={handleRestore}
                style={styles.restoreRow}
                activeOpacity={0.75}
                disabled={restorePhase === 'loading'}
              >
                {restorePhase === 'loading' ? (
                  <ActivityIndicator size="small" color={Colors.textMuted} />
                ) : (
                  <Text style={styles.restoreLabel}>
                    {t('profile.restore_purchases')}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Inline restore feedback */}
              {restoreMsg !== '' && (
                <Text style={[styles.restoreMsgText, restorePhase === 'success' && styles.restoreMsgSuccess]}>
                  {restoreMsg}
                </Text>
              )}
            </>
          ) : (
            <View style={[styles.coachStatusRow, { flexDirection: dir.rowDir }]}>
              <View style={[styles.coachStatusDot, { backgroundColor: Colors.textMuted }]} />
              <View style={styles.coachStatusBody}>
                <Text style={styles.coachStatusLabel}>{t('profile.coach_status_offline')}</Text>
                <Text style={styles.coachStatusDetail}>{t('profile.coach_status_detail_offline')}</Text>
              </View>
              <Ionicons name="sparkles" size={16} color={Colors.textMuted} />
            </View>
          )}
        </Card>

        {/* ── Quick access ────────────────────────────────────────────────── */}
        <SectionLabel title="Quick Access" />
        <Card elevated>
          <TouchableOpacity
            style={[styles.navRow, { flexDirection: dir.rowDir }]}
            onPress={() => router.push('/(tabs)/schedule' as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={18} color={Colors.gold} />
            <Text style={styles.navRowLabel}>{t('profile.fixed_schedule_section')}</Text>
            <Ionicons name={dir.forwardIcon} size={14} color={Colors.textMuted} />
          </TouchableOpacity>
          <Divider />
          <TouchableOpacity
            style={[styles.navRow, { flexDirection: dir.rowDir }]}
            onPress={() => router.push('/(tabs)/focus' as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="timer-outline" size={18} color={Colors.purpleLight} />
            <Text style={styles.navRowLabel}>Focus Sessions</Text>
            <Ionicons name={dir.forwardIcon} size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </Card>

        {/* ── Data & Privacy ─────────────────────────────────────────────── */}
        <SectionLabel title={t('profile.data_privacy_section')} />
        <Card elevated>
          <View style={[styles.dataRow, { flexDirection: dir.rowDir }]}>
            <Ionicons name="phone-portrait-outline" size={17} color={Colors.textSecondary} />
            <Text style={styles.dataLabel}>{t('profile.data_local')}</Text>
          </View>
          <Divider />
          <TouchableOpacity style={[styles.exportRow, { flexDirection: dir.rowDir }]} onPress={handleExportData} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={17} color={Colors.gold} />
            <Text style={styles.exportLabel}>{t('profile.export_json')}</Text>
            <Ionicons name={dir.forwardIcon} size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </Card>

        {/* ── About ──────────────────────────────────────────────────────── */}
        <SectionLabel title={t('profile.about_section')} />
        <Card elevated>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>{t('profile.about_version_label')}</Text>
            <Text style={styles.aboutValue}>2.0.0</Text>
          </View>
          <Divider />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>{t('profile.about_build_label')}</Text>
            <Text style={styles.aboutValue}>Sprint 2 · 2026</Text>
          </View>
        </Card>

        {/* ── Danger Zone ────────────────────────────────────────────────── */}
        <View style={styles.dangerZone}>
          {isAuthenticated && (
            <Button label={t('profile.sign_out')} onPress={handleSignOut} variant="secondary" fullWidth />
          )}
          <Button label={t('profile.reset_data')} onPress={handleResetData} variant="danger" fullWidth />
          <Text style={styles.dangerHint}>{t('profile.reset_hint')}</Text>
        </View>

      </ScrollView>

      <UpgradeModal
        visible={showUpgradeModal}
        onDismiss={() => setShowUpgradeModal(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },

  // Header card
  profileHeaderCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.goldDim,
  },
  profileHeaderTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: {
    width: 56, height: 56, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 2, borderColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:   { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.gold },
  profileMeta:  { flex: 1, gap: 4 },
  profileName:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  profileRole:  { fontSize: FontSize.sm, color: Colors.textSecondary },
  headerStatStrip: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.goldMuted, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.goldDim,
  },
  statChipIcon: { fontSize: 11 },
  statChipVal:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gold },

  // Section label
  sectionLabel: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
    fontWeight: FontWeight.semibold, paddingStart: 2,
  },

  // Identity
  identityCard:     { gap: 0 },
  identityRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  identityLabel:    { fontSize: FontSize.sm, color: Colors.textSecondary },
  identityValueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  identityValue:    { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  identityOptions:  { paddingBottom: Spacing.xs, gap: 2 },
  identityOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.xs + 2, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm, marginHorizontal: -Spacing.xs,
  },
  identityOptionActive:    { backgroundColor: Colors.goldMuted },
  identityOptionText:      { fontSize: FontSize.sm, color: Colors.textSecondary },
  identityOptionTextActive:{ color: Colors.gold, fontWeight: FontWeight.medium },

  // Fixed schedule
  scheduleDesc:       { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.sm },
  scheduleCurrentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  scheduleCurrent:    { fontSize: FontSize.sm, color: Colors.gold },
  scheduleInputRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  scheduleField:      { flex: 1, gap: 4 },
  scheduleFieldLabel: { fontSize: FontSize.xs, color: Colors.textMuted, letterSpacing: 0.3 },
  scheduleInput: {
    height: 40, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, fontSize: FontSize.sm,
    color: Colors.textPrimary, textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  scheduleSep:     { fontSize: FontSize.md, color: Colors.textMuted, paddingBottom: Spacing.xs },
  scheduleSaveBtn: {
    height: 40, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.gold, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  scheduleSaveBtnDone:      { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border },
  scheduleSaveBtnText:      { fontSize: FontSize.sm, color: Colors.textInverse, fontWeight: FontWeight.semibold },
  scheduleSaveBtnTextDone:  { color: Colors.success },
  scheduleHint:    { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },

  // Life Tracks
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  trackChip: {
    paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs,
    borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  trackChipText:   { fontSize: FontSize.sm, color: Colors.textSecondary },
  tracksLink:      { alignSelf: 'flex-start' },
  tracksLinkText:  { fontSize: FontSize.sm, color: Colors.gold },
  tracksEmpty:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  tracksEmptyText: { fontSize: FontSize.sm, color: Colors.textMuted, flex: 1 },

  // Language
  langRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xs },
  langBtn: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated, gap: 2,
  },
  langBtnActive:  { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  langCode:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted },
  langCodeActive: { color: Colors.gold },
  langName:       { fontSize: FontSize.xs, color: Colors.textMuted },
  langNameActive: { color: Colors.gold },
  langNote:       { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 17 },

  // Coach — Pro badge
  proBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  proBadgeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1, borderColor: Colors.gold,
  },
  proBadgeChipText: {
    fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.gold, letterSpacing: 0.5,
  },
  proActiveText: {
    fontSize: FontSize.sm, color: Colors.textSecondary,
  },

  // Coach — Manage subscription row
  manageRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
  },
  manageLabel: {
    flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary,
  },

  // Coach — Restore Purchases row
  restoreRow: {
    paddingVertical: Spacing.xs + 2, alignItems: 'flex-start',
  },
  restoreLabel: {
    fontSize: FontSize.sm, color: Colors.textMuted,
  },
  restoreLabelBusy: {
    opacity: 0.4,
  },
  restoreMsgText: {
    fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2,
  },
  restoreMsgSuccess: {
    color: Colors.success,
  },

  // Coach upgrade CTA
  upgradeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs + 2,
  },
  upgradeCtaText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.gold,
  },

  // Coach status
  coachStatusRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  coachStatusDot:   { width: 8, height: 8, borderRadius: 4 },
  coachStatusBody:  { flex: 1, gap: 2 },
  coachStatusLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  coachStatusDetail:{ fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },

  // Nav rows (quick links)
  navRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  navRowLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },

  // Data & Privacy
  dataRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  dataLabel:  { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  exportRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  exportLabel:{ flex: 1, fontSize: FontSize.sm, color: Colors.gold },

  // About
  aboutRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  aboutLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  aboutValue: { fontSize: FontSize.sm, color: Colors.textMuted },

  // Danger Zone
  dangerZone: { gap: Spacing.sm, marginTop: Spacing.xs },
  dangerHint: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
});

// ─── System config card styles ────────────────────────────────────────────────

const sysStyles = StyleSheet.create({
  card:     { gap: 2, paddingVertical: Spacing.xs },
  row:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs + 2 },
  iconWrap: { width: 22, height: 22, borderRadius: Radius.sm, backgroundColor: Colors.surfaceHigh, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary },
  rowValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium, maxWidth: 160, textAlign: 'right' },
});
