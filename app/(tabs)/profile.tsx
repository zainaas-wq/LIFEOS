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
import { useAppStore } from '../../src/store/useAppStore';
import { signOut } from '../../src/services/authService';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Divider } from '../../src/components/ui/Divider';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import type { LifeRole, EnergyStyle, WorkStyle } from '../../src/types';

// ─── Label maps ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS: Array<{ value: LifeRole; label: string }> = [
  { value: 'student',      label: 'Student' },
  { value: 'employee',     label: 'Employee' },
  { value: 'freelancer',   label: 'Freelancer' },
  { value: 'shift-worker', label: 'Shift Worker' },
  { value: 'creator',      label: 'Creator' },
  { value: 'other',        label: 'Other' },
];

const ENERGY_OPTIONS: Array<{ value: EnergyStyle; label: string }> = [
  { value: 'morning',   label: 'Morning Person' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening',   label: 'Evening' },
  { value: 'night',     label: 'Night Owl' },
  { value: 'flexible',  label: 'Flexible' },
];

const WORK_OPTIONS: Array<{ value: WorkStyle; label: string }> = [
  { value: 'deep',         label: 'Deep Work (60–90 min)' },
  { value: 'balanced',     label: 'Balanced (45 min)' },
  { value: 'short-bursts', label: 'Short Bursts (20–25 min)' },
];

const TRACK_LABELS: Record<string, string> = {
  coding: 'Coding', fitness: 'Fitness', music: 'Music',
  language: 'Language', reading: 'Reading', writing: 'Writing',
  career: 'Career', business: 'Business', health: 'Health',
  creative: 'Creativity', relationships: 'Relationships', mindfulness: 'Mindfulness',
};

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
  return (
    <>
      <TouchableOpacity style={styles.identityRow} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.identityLabel}>{label}</Text>
        <View style={styles.identityValueRow}>
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
                style={[styles.identityOption, active && styles.identityOptionActive]}
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const profile       = useAppStore((s) => s.profile);
  const session       = useAppStore((s) => s.session);
  const isGuestMode   = useAppStore((s) => s.isGuestMode);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const resetAllData  = useAppStore((s) => s.resetAllData);
  const setLanguage   = useAppStore((s) => s.setLanguage);
  const aiApiKey      = useAppStore((s) => s.aiApiKey);
  const setAiApiKey   = useAppStore((s) => s.setAiApiKey);
  const store         = useAppStore((s) => s);

  const isAuthenticated = !!session && !isGuestMode;

  // Identity picker state
  const [editingField, setEditingField] = useState<'role' | 'energy' | 'work' | null>(null);

  const toggleField = (field: 'role' | 'energy' | 'work') => {
    setEditingField((prev) => (prev === field ? null : field));
  };

  // Fixed schedule state
  const [scheduleStart, setScheduleStart] = useState(profile?.fixedScheduleStart ?? '');
  const [scheduleEnd,   setScheduleEnd]   = useState(profile?.fixedScheduleEnd   ?? '');
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // API key state
  const [apiKeyDraft, setApiKeyDraft] = useState(aiApiKey);
  const [showKey,     setShowKey]     = useState(false);
  const [keySaved,    setKeySaved]    = useState(false);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSaveSchedule = () => {
    const start = scheduleStart.trim();
    const end   = scheduleEnd.trim();

    if (start && !TIME_RE.test(start)) {
      Alert.alert('Invalid time', 'Use HH:MM format — e.g. 09:00');
      return;
    }
    if (end && !TIME_RE.test(end)) {
      Alert.alert('Invalid time', 'Use HH:MM format — e.g. 22:00');
      return;
    }

    updateProfile({
      fixedScheduleStart: start || undefined,
      fixedScheduleEnd:   end   || undefined,
    });
    setScheduleSaved(true);
    setTimeout(() => setScheduleSaved(false), 2000);
  };

  const handleSaveApiKey = () => {
    setAiApiKey(apiKeyDraft.trim());
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const handleClearApiKey = () => {
    Alert.alert('Clear API Key', 'Remove your Anthropic API key from this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => { setAiApiKey(''); setApiKeyDraft(''); },
      },
    ]);
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
      await Share.share({ message: JSON.stringify(payload, null, 2), title: 'LifeOS Data Export' });
    } catch {
      Alert.alert('Export Failed', 'Could not export data.');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut().catch(console.warn) },
    ]);
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
          onPress: () => { resetAllData(); router.replace('/onboarding'); },
        },
      ]
    );
  };

  if (!profile) return null;

  // ── Derived display values ─────────────────────────────────────────────────

  const initials = profile.name
    ? profile.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : (profile.mainFocus?.charAt(0)?.toUpperCase() ?? 'L');

  const roleLabel    = labelFor(ROLE_OPTIONS,   profile.lifeRole,    'Not set');
  const energyLabel  = labelFor(ENERGY_OPTIONS, profile.energyStyle, 'Not set');
  const workLabel    = labelFor(WORK_OPTIONS,   profile.workStyle,   'Not set');
  const tracks       = profile.selectedTrackTypes ?? [];
  const currentLang  = profile.language ?? 'en';
  const hasSchedule  = !!(profile.fixedScheduleStart || profile.fixedScheduleEnd);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Profile header ─────────────────────────────────────────────── */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={styles.profileName}>{profile.name || 'Your Profile'}</Text>
            <Text style={styles.profileRole}>{roleLabel}</Text>
          </View>
        </View>

        {/* ── Identity ───────────────────────────────────────────────────── */}
        <SectionLabel title="Identity" />
        <Card elevated style={styles.identityCard}>
          <IdentityRow
            label="Life Role"
            displayValue={roleLabel}
            currentValue={profile.lifeRole}
            expanded={editingField === 'role'}
            onToggle={() => toggleField('role')}
            options={ROLE_OPTIONS}
            onSelect={(v) => updateProfile({ lifeRole: v })}
          />
          <Divider />
          <IdentityRow
            label="Energy Style"
            displayValue={energyLabel}
            currentValue={profile.energyStyle}
            expanded={editingField === 'energy'}
            onToggle={() => toggleField('energy')}
            options={ENERGY_OPTIONS}
            onSelect={(v) => updateProfile({ energyStyle: v })}
          />
          <Divider />
          <IdentityRow
            label="Work Style"
            displayValue={workLabel}
            currentValue={profile.workStyle}
            expanded={editingField === 'work'}
            onToggle={() => toggleField('work')}
            options={WORK_OPTIONS}
            onSelect={(v) => updateProfile({ workStyle: v })}
          />
        </Card>

        {/* ── Fixed Schedule ─────────────────────────────────────────────── */}
        <SectionLabel title="Fixed Schedule" />
        <Card elevated>
          <Text style={styles.scheduleDesc}>
            Your core hours. The Coach plans around this window.
          </Text>

          {hasSchedule && !scheduleSaved && (
            <View style={styles.scheduleCurrentRow}>
              <Ionicons name="time-outline" size={14} color={Colors.gold} />
              <Text style={styles.scheduleCurrent}>
                Active: {profile.fixedScheduleStart ?? '—'} – {profile.fixedScheduleEnd ?? '—'}
              </Text>
            </View>
          )}

          <View style={styles.scheduleInputRow}>
            <View style={styles.scheduleField}>
              <Text style={styles.scheduleFieldLabel}>From</Text>
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
              <Text style={styles.scheduleFieldLabel}>To</Text>
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
                {scheduleSaved ? 'Saved ✓' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.scheduleHint}>Format: HH:MM  ·  Leave blank to clear</Text>
        </Card>

        {/* ── Life Tracks ────────────────────────────────────────────────── */}
        <SectionLabel title="Life Tracks" />
        <Card elevated>
          {tracks.length > 0 ? (
            <>
              <View style={styles.chipRow}>
                {tracks.map((t) => (
                  <View key={t} style={styles.trackChip}>
                    <Text style={styles.trackChipText}>{TRACK_LABELS[t] ?? t}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/plan' as any)}
                style={styles.tracksLink}
                activeOpacity={0.7}
              >
                <Text style={styles.tracksLinkText}>Edit in Plan →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.tracksEmpty}>
              <Text style={styles.tracksEmptyText}>No tracks selected.</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/plan' as any)} activeOpacity={0.7}>
                <Text style={styles.tracksLinkText}>Set up in Plan →</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* ── Language ───────────────────────────────────────────────────── */}
        <SectionLabel title="Language" />
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
          <Text style={styles.langNote}>Arabic and Hebrew require an app restart to apply RTL layout.</Text>
        </Card>

        {/* ── Coach AI (API key) ─────────────────────────────────────────── */}
        <SectionLabel title="Coach AI" />
        <Card elevated>
          <View style={styles.aiInfoRow}>
            <Ionicons name="sparkles" size={15} color={Colors.gold} />
            <Text style={styles.aiInfoText}>
              Add your Anthropic API key to enable full AI coaching. Stored locally, only sent to the Anthropic API.
            </Text>
          </View>
          <Divider />
          <View style={styles.apiKeyRow}>
            <TextInput
              style={styles.apiKeyInput}
              value={apiKeyDraft}
              onChangeText={setApiKeyDraft}
              placeholder="sk-ant-api03-…"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowKey(!showKey)} style={styles.eyeBtn}>
              <Ionicons
                name={showKey ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.apiKeyActions}>
            {!!aiApiKey && (
              <TouchableOpacity onPress={handleClearApiKey} style={styles.clearKeyBtn}>
                <Text style={styles.clearKeyText}>Clear Key</Text>
              </TouchableOpacity>
            )}
            <Button
              label={keySaved ? 'Saved ✓' : 'Save Key'}
              onPress={handleSaveApiKey}
              size="sm"
              variant={keySaved ? 'ghost' : 'primary'}
              style={styles.saveKeyBtn}
            />
          </View>
          {!!aiApiKey && (
            <View style={styles.keyActiveRow}>
              <View style={styles.keyActiveDot} />
              <Text style={styles.keyActiveText}>API key configured — full AI coaching active</Text>
            </View>
          )}
        </Card>

        {/* ── Data & Privacy ─────────────────────────────────────────────── */}
        <SectionLabel title="Data & Privacy" />
        <Card elevated>
          <View style={styles.dataRow}>
            <Ionicons name="phone-portrait-outline" size={17} color={Colors.textSecondary} />
            <Text style={styles.dataLabel}>All data stored locally on this device.</Text>
          </View>
          <Divider />
          <TouchableOpacity style={styles.exportRow} onPress={handleExportData} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={17} color={Colors.gold} />
            <Text style={styles.exportLabel}>Export Data as JSON</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </Card>

        {/* ── About ──────────────────────────────────────────────────────── */}
        <SectionLabel title="About" />
        <Card elevated>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>2.0.0</Text>
          </View>
          <Divider />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Build</Text>
            <Text style={styles.aboutValue}>Sprint 2 · 2026</Text>
          </View>
        </Card>

        {/* ── Danger Zone ────────────────────────────────────────────────── */}
        <View style={styles.dangerZone}>
          {isAuthenticated && (
            <Button label="Sign Out" onPress={handleSignOut} variant="secondary" fullWidth />
          )}
          <Button label="Reset All Data" onPress={handleResetData} variant="danger" fullWidth />
          <Text style={styles.dangerHint}>
            Resets all goals, plans, rules, and preferences. Cannot be undone.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },

  // Header
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xs },
  avatar: {
    width: 52, height: 52, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1.5, borderColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gold },
  profileMeta:  { flex: 1, gap: 3 },
  profileName:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  profileRole:  { fontSize: FontSize.sm, color: Colors.textSecondary },

  // Section label
  sectionLabel: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
    fontWeight: FontWeight.semibold, paddingLeft: 2,
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

  // Coach AI
  aiInfoRow:  { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', paddingVertical: Spacing.xs },
  aiInfoText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18 },
  apiKeyRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm },
  apiKeyInput: {
    flex: 1, height: 40, backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, fontSize: FontSize.sm,
    color: Colors.textPrimary, fontFamily: 'monospace',
  },
  eyeBtn:        { padding: Spacing.xs },
  apiKeyActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: Spacing.sm, paddingTop: Spacing.xs },
  clearKeyBtn:   { paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  clearKeyText:  { fontSize: FontSize.sm, color: Colors.error },
  saveKeyBtn:    { minWidth: 90 },
  keyActiveRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing.xs },
  keyActiveDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  keyActiveText: { fontSize: FontSize.xs, color: Colors.success },

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
