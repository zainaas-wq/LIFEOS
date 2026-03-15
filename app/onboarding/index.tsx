import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { track } from '../../src/services/analyticsService';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import type { LifeRole, EnergyStyle, WorkStyle } from '../../src/types';

// ─── Options data ─────────────────────────────────────────────────────────────

const LIFE_ROLES: Array<{ value: LifeRole; label: string; description: string }> = [
  { value: 'student',      label: 'Student',      description: 'Full-time learner or academic' },
  { value: 'employee',     label: 'Employee',      description: 'Working professional' },
  { value: 'freelancer',   label: 'Freelancer',    description: 'Self-employed or independent' },
  { value: 'shift-worker', label: 'Shift Worker',  description: 'Variable or rotating schedule' },
  { value: 'creator',      label: 'Creator',       description: 'Artist, builder, or maker' },
  { value: 'other',        label: 'Other',         description: 'My situation is different' },
];

const ENERGY_STYLES: Array<{
  value: EnergyStyle; label: string; description: string; tag: string;
}> = [
  { value: 'morning',   label: 'Morning person', description: 'Best deep work before noon.',         tag: '06:00 – 12:00' },
  { value: 'afternoon', label: 'Afternoon',       description: 'Peak momentum in the middle of the day.', tag: '12:00 – 17:00' },
  { value: 'evening',   label: 'Evening',         description: 'Flow state starts after 6 PM.',      tag: '17:00 – 21:00' },
  { value: 'night',     label: 'Night owl',       description: 'Most alive when the world sleeps.',  tag: '21:00+' },
  { value: 'flexible',  label: 'Flexible',        description: 'No consistent pattern — day by day.', tag: 'Varies' },
];

const WORK_STYLES: Array<{
  value: WorkStyle; label: string; description: string; sessions: string;
}> = [
  { value: 'deep',         label: 'Deep focus',   description: 'Long uninterrupted sessions.',       sessions: '60 – 90 min' },
  { value: 'balanced',     label: 'Balanced',     description: 'Focused work with regular breaks.',  sessions: '45 min' },
  { value: 'short-bursts', label: 'Short bursts', description: 'Quick high-intensity sessions.',     sessions: '20 – 25 min' },
];

const LIFE_TRACKS: Array<{ value: string; label: string }> = [
  { value: 'coding',        label: 'Coding' },
  { value: 'fitness',       label: 'Fitness' },
  { value: 'music',         label: 'Music' },
  { value: 'language',      label: 'Language' },
  { value: 'reading',       label: 'Reading' },
  { value: 'writing',       label: 'Writing' },
  { value: 'career',        label: 'Career' },
  { value: 'business',      label: 'Business' },
  { value: 'health',        label: 'Health' },
  { value: 'creative',      label: 'Creativity' },
  { value: 'relationships', label: 'Relationships' },
  { value: 'mindfulness',   label: 'Mindfulness' },
];

const FRICTIONS: Array<{ value: string; label: string }> = [
  { value: 'phone',           label: 'Phone & notifications' },
  { value: 'social_media',    label: 'Social media' },
  { value: 'procrastination', label: 'Procrastination' },
  { value: 'noise',           label: 'Noise & environment' },
  { value: 'fatigue',         label: 'Fatigue & low energy' },
  { value: 'lack_of_clarity', label: 'Lack of clarity' },
  { value: 'people',          label: 'People & interruptions' },
  { value: 'overthinking',    label: 'Overthinking' },
];

const DIRECTION_CHIPS = [
  'More focused',
  'Healthier',
  'Smarter',
  'Financially stronger',
  'More creative',
  'More balanced',
];

// ─── State shape ──────────────────────────────────────────────────────────────

interface OnboardingState {
  lifeRole: LifeRole | null;
  energyStyle: EnergyStyle | null;
  workStyle: WorkStyle | null;
  selectedTrackTypes: string[];
  mainFrictions: string[];
  transformationDirection: string;
  directionChips: string[];
}

const INITIAL_STATE: OnboardingState = {
  lifeRole: null,
  energyStyle: null,
  workStyle: null,
  selectedTrackTypes: [],
  mainFrictions: [],
  transformationDirection: '',
  directionChips: [],
};

// ─── Step metadata ────────────────────────────────────────────────────────────

// Step 0 = welcome (no progress bar). Steps 1–6 = substantive steps.
const TOTAL_CONTENT_STEPS = 6;

const STEP_META = [
  { title: '', subtitle: '' }, // 0: welcome
  { title: "What's your\nlife role?", subtitle: 'This shapes how your plan is built.' },
  { title: 'When are you\nmost alive?', subtitle: 'We schedule deep work for your peak hours.' },
  { title: 'How do you\nwork best?', subtitle: 'Be honest — your plan will reflect this.' },
  { title: 'What are you\nbuilding?', subtitle: 'Choose up to 5 life tracks.' },
  { title: 'What holds\nyou back?', subtitle: 'Choose up to 3. Naming it weakens it.' },
  { title: 'Where are\nyou going?', subtitle: 'In 12 months, I want to be...' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [step, setStep]   = useState(0);
  const [data, setData]   = useState<OnboardingState>(INITIAL_STATE);
  const [error, setError] = useState('');

  const progressAnim = useRef(new Animated.Value(0)).current;

  const animateProgress = (toStep: number) => {
    Animated.timing(progressAnim, {
      toValue: toStep / TOTAL_CONTENT_STEPS,
      duration: 280,
      useNativeDriver: false,
    }).start();
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 1: return data.lifeRole !== null;
      case 2: return data.energyStyle !== null;
      case 3: return data.workStyle !== null;
      case 4: return data.selectedTrackTypes.length > 0;
      default: return true;
    }
  };

  const handleNext = () => {
    if (!canProceed()) {
      setError('Please make a selection to continue.');
      return;
    }
    setError('');
    if (step < TOTAL_CONTENT_STEPS) {
      const next = step + 1;
      setStep(next);
      animateProgress(next);
    } else {
      handleFinish();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      const prev = step - 1;
      setStep(prev);
      animateProgress(prev);
      setError('');
    }
  };

  const handleFinish = () => {
    // Build legacy-compatible fields from new identity data
    const firstTrack = data.selectedTrackTypes[0] ?? '';
    const firstFriction = data.mainFrictions[0]?.replace(/_/g, ' ') ?? '';
    const directionText = [
      ...data.directionChips,
      data.transformationDirection.trim(),
    ]
      .filter(Boolean)
      .join(', ');

    completeOnboarding({
      // ── Legacy fields — required by existing engines, not shown to user ──
      mainFocus: firstTrack || 'Personal growth',
      biggestDistraction: firstFriction,
      habitToRemove: firstFriction,
      habitToBuild: firstTrack ? `Consistent ${firstTrack} practice` : 'Build a consistent practice',
      seriousnessScore: 7, // internal default; not exposed as product concept

      // ── New identity fields ──────────────────────────────────────────────
      lifeRole: data.lifeRole ?? undefined,
      energyStyle: data.energyStyle ?? undefined,
      workStyle: data.workStyle ?? undefined,
      selectedTrackTypes: data.selectedTrackTypes,
      mainFrictions: data.mainFrictions,
      transformationDirection: directionText,
      language: 'en',
    });

    track('onboarding_completed');
    router.replace('/(tabs)/home');
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // ── Toggle helpers ─────────────────────────────────────────────────────────

  const toggleTrack = (value: string) => {
    setData((d) => {
      const has = d.selectedTrackTypes.includes(value);
      if (has) return { ...d, selectedTrackTypes: d.selectedTrackTypes.filter((v) => v !== value) };
      if (d.selectedTrackTypes.length >= 5) return d; // cap at 5
      return { ...d, selectedTrackTypes: [...d.selectedTrackTypes, value] };
    });
  };

  const toggleFriction = (value: string) => {
    setData((d) => {
      const has = d.mainFrictions.includes(value);
      if (has) return { ...d, mainFrictions: d.mainFrictions.filter((v) => v !== value) };
      if (d.mainFrictions.length >= 3) return d; // cap at 3
      return { ...d, mainFrictions: [...d.mainFrictions, value] };
    });
  };

  const toggleDirectionChip = (value: string) => {
    setData((d) => {
      const has = d.directionChips.includes(value);
      return {
        ...d,
        directionChips: has
          ? d.directionChips.filter((v) => v !== value)
          : [...d.directionChips, value],
      };
    });
  };

  // ─── Step renders ──────────────────────────────────────────────────────────

  const renderStepContent = () => {
    switch (step) {

      // ── Step 0: Welcome ───────────────────────────────────────────────────
      case 0:
        return (
          <View style={styles.welcomeContent}>
            <View style={styles.brand}>
              <Text style={styles.brandText}>
                LIFE<Text style={styles.brandAccent}>OS</Text>
              </Text>
            </View>
            <Text style={styles.welcomeTitle}>Your AI{'\n'}Life Coach</Text>
            <Text style={styles.welcomeSubtitle}>
              Build an identity-aware system{'\n'}that actually executes your life.
            </Text>
            <TouchableOpacity style={styles.startBtn} onPress={handleNext} activeOpacity={0.85}>
              <Text style={styles.startBtnText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.textInverse} />
            </TouchableOpacity>
          </View>
        );

      // ── Step 1: Life Role ─────────────────────────────────────────────────
      case 1:
        return (
          <View style={styles.optionList}>
            {LIFE_ROLES.map((role) => {
              const active = data.lifeRole === role.value;
              return (
                <TouchableOpacity
                  key={role.value}
                  style={[styles.optionCard, active && styles.optionCardActive]}
                  onPress={() => { setData((d) => ({ ...d, lifeRole: role.value })); setError(''); }}
                  activeOpacity={0.75}
                >
                  <View style={styles.optionCardInner}>
                    <View style={styles.optionText}>
                      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                        {role.label}
                      </Text>
                      <Text style={styles.optionDesc}>{role.description}</Text>
                    </View>
                    {active && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.gold} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );

      // ── Step 2: Energy Style ──────────────────────────────────────────────
      case 2:
        return (
          <View style={styles.optionList}>
            {ENERGY_STYLES.map((e) => {
              const active = data.energyStyle === e.value;
              return (
                <TouchableOpacity
                  key={e.value}
                  style={[styles.optionCard, active && styles.optionCardActive]}
                  onPress={() => { setData((d) => ({ ...d, energyStyle: e.value })); setError(''); }}
                  activeOpacity={0.75}
                >
                  <View style={styles.optionCardInner}>
                    <View style={styles.optionText}>
                      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                        {e.label}
                      </Text>
                      <Text style={styles.optionDesc}>{e.description}</Text>
                    </View>
                    <Text style={[styles.optionTag, active && styles.optionTagActive]}>
                      {e.tag}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );

      // ── Step 3: Work Style ────────────────────────────────────────────────
      case 3:
        return (
          <View style={styles.optionList}>
            {WORK_STYLES.map((w) => {
              const active = data.workStyle === w.value;
              return (
                <TouchableOpacity
                  key={w.value}
                  style={[styles.optionCard, active && styles.optionCardActive]}
                  onPress={() => { setData((d) => ({ ...d, workStyle: w.value })); setError(''); }}
                  activeOpacity={0.75}
                >
                  <View style={styles.optionCardInner}>
                    <View style={styles.optionText}>
                      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                        {w.label}
                      </Text>
                      <Text style={styles.optionDesc}>{w.description}</Text>
                    </View>
                    <Text style={[styles.optionTag, active && styles.optionTagActive]}>
                      {w.sessions}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );

      // ── Step 4: Life Tracks ───────────────────────────────────────────────
      case 4:
        return (
          <View style={styles.chipSection}>
            <Text style={styles.chipHint}>
              {data.selectedTrackTypes.length} / 5 selected
            </Text>
            <View style={styles.chipGrid}>
              {LIFE_TRACKS.map((t) => {
                const active = data.selectedTrackTypes.includes(t.value);
                const capped = !active && data.selectedTrackTypes.length >= 5;
                return (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.chip, active && styles.chipActive, capped && styles.chipCapped]}
                    onPress={() => toggleTrack(t.value)}
                    activeOpacity={0.75}
                    disabled={capped}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive, capped && styles.chipTextCapped]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      // ── Step 5: Main Frictions ────────────────────────────────────────────
      case 5:
        return (
          <View style={styles.chipSection}>
            <Text style={styles.chipHint}>
              {data.mainFrictions.length} / 3 selected · optional
            </Text>
            <View style={styles.chipGrid}>
              {FRICTIONS.map((f) => {
                const active = data.mainFrictions.includes(f.value);
                const capped = !active && data.mainFrictions.length >= 3;
                return (
                  <TouchableOpacity
                    key={f.value}
                    style={[styles.chip, active && styles.chipActive, capped && styles.chipCapped]}
                    onPress={() => toggleFriction(f.value)}
                    activeOpacity={0.75}
                    disabled={capped}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive, capped && styles.chipTextCapped]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      // ── Step 6: Transformation Direction ─────────────────────────────────
      case 6:
        return (
          <View style={styles.directionSection}>
            <TextInput
              style={styles.directionInput}
              placeholder="Describe your direction... (optional)"
              placeholderTextColor={Colors.textMuted}
              value={data.transformationDirection}
              onChangeText={(t) => setData((d) => ({ ...d, transformationDirection: t }))}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text style={styles.chipHint}>Or pick what resonates</Text>
            <View style={styles.chipGrid}>
              {DIRECTION_CHIPS.map((chip) => {
                const active = data.directionChips.includes(chip);
                return (
                  <TouchableOpacity
                    key={chip}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleDirectionChip(chip)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {chip}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  // ─── Root render ───────────────────────────────────────────────────────────

  // Welcome step has its own full-screen layout
  if (step === 0) {
    return (
      <View style={styles.welcomeRoot}>
        {renderStepContent()}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        {/* Step counter */}
        <View style={styles.stepCounter}>
          <Text style={styles.stepCountText}>
            {step} <Text style={styles.stepCountDivider}>/ {TOTAL_CONTENT_STEPS}</Text>
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step title */}
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>{STEP_META[step].title}</Text>
            <Text style={styles.stepSubtitle}>{STEP_META[step].subtitle}</Text>
          </View>

          {/* Error message */}
          {!!error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          {/* Step content */}
          {renderStepContent()}
        </ScrollView>

        {/* Navigation */}
        <View style={styles.nav}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleNext}
            style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>
              {step === TOTAL_CONTENT_STEPS ? 'Start my LifeOS' : 'Continue'}
            </Text>
            {step < TOTAL_CONTENT_STEPS && (
              <Ionicons name="arrow-forward" size={16} color={Colors.textInverse} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // ── Welcome ──────────────────────────────────────────────────────────────
  welcomeRoot: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  welcomeContent: {
    gap: Spacing.xl,
  },
  brand: {
    marginBottom: Spacing.sm,
  },
  brandText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 4,
  },
  brandAccent: {
    color: Colors.gold,
  },
  welcomeTitle: {
    fontSize: FontSize.display - 2,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 48,
    letterSpacing: -1,
  },
  welcomeSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  startBtnText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },

  // ── Content step shell ───────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  progressTrack: {
    height: 2,
    backgroundColor: Colors.surfaceHigh,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.gold,
  },
  stepCounter: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    alignItems: 'flex-end',
  },
  stepCountText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
  },
  stepCountDivider: {
    color: Colors.textMuted,
    fontWeight: FontWeight.regular,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  stepHeader: {
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  stepTitle: {
    fontSize: FontSize.display - 8,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  stepSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.error,
    marginTop: -Spacing.sm,
  },

  // ── Option cards (single-select) ─────────────────────────────────────────
  optionList: {
    gap: Spacing.sm,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
  },
  optionCardActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldMuted,
  },
  optionCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  optionLabelActive: {
    color: Colors.gold,
  },
  optionDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  optionTag: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    textAlign: 'right',
  },
  optionTagActive: {
    color: Colors.goldDim,
  },

  // ── Chips (multi-select) ─────────────────────────────────────────────────
  chipSection: {
    gap: Spacing.md,
  },
  chipHint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldMuted,
  },
  chipCapped: {
    opacity: 0.35,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.gold,
  },
  chipTextCapped: {
    color: Colors.textMuted,
  },

  // ── Direction step ───────────────────────────────────────────────────────
  directionSection: {
    gap: Spacing.md,
  },
  directionInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    minHeight: 90,
    lineHeight: 22,
  },

  // ── Navigation ───────────────────────────────────────────────────────────
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
  },
  backText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.lg,
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
});
