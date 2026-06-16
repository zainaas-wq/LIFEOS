import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { track } from '../../src/services/analyticsService';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import type { LifeRole } from '../../src/types';

// ─── Goal options ─────────────────────────────────────────────────────────────

const GOAL_OPTIONS: Array<{ value: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = [
  { value: 'study',           label: 'Study',           icon: 'book-outline',       color: '#6C8EBF' },
  { value: 'work',            label: 'Work',            icon: 'briefcase-outline',  color: Colors.gold },
  { value: 'personal_growth', label: 'Personal Growth', icon: 'trending-up-outline',color: '#A78BFA' },
  { value: 'health',          label: 'Health',          icon: 'fitness-outline',    color: '#4ADE80' },
  { value: 'business',        label: 'Business',        icon: 'storefront-outline', color: '#FB923C' },
  { value: 'finance',         label: 'Finance',         icon: 'cash-outline',       color: '#34D399' },
];

const ROLE_OPTIONS: Array<{ value: LifeRole; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'student',      label: 'Student',      icon: 'school-outline'    },
  { value: 'employee',     label: 'Employee',     icon: 'business-outline'  },
  { value: 'freelancer',   label: 'Freelancer',   icon: 'laptop-outline'    },
  { value: 'creator',      label: 'Creator',      icon: 'color-palette-outline' },
  { value: 'shift-worker', label: 'Shift Worker', icon: 'time-outline'      },
  { value: 'other',        label: 'Other',        icon: 'person-outline'    },
];

const CONNECT_OPTIONS: Array<{ id: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = [
  { id: 'google_drive',    label: 'Google Drive',    icon: 'cloud-outline',     color: '#4A90D9' },
  { id: 'google_calendar', label: 'Google Calendar', icon: 'calendar-outline',  color: '#0F9D58' },
  { id: 'gmail',           label: 'Gmail',           icon: 'mail-outline',      color: '#DB4437' },
  { id: 'notion',          label: 'Notion',          icon: 'document-text-outline', color: Colors.textPrimary },
  { id: 'github',          label: 'GitHub',          icon: 'logo-github',       color: Colors.textPrimary },
  { id: 'apple_health',    label: 'Apple Health',    icon: 'heart-outline',     color: '#F87171' },
];

const TOTAL_STEPS = 4;

// ─── Dot progress indicator ───────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={dotS.row}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[dotS.dot, i + 1 === current && dotS.dotActive, i + 1 < current && dotS.dotDone]} />
      ))}
    </View>
  );
}

const dotS = StyleSheet.create({
  row:      { flexDirection: 'row', gap: 6 },
  dot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.surfaceHigh },
  dotActive:{ width: 24, backgroundColor: Colors.gold },
  dotDone:  { backgroundColor: Colors.goldDim },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [step,            setStep]            = useState(0);
  const [selectedGoals,   setSelectedGoals]   = useState<string[]>([]);
  const [selectedRole,    setSelectedRole]    = useState<LifeRole | null>(null);
  const [name,            setName]            = useState('');
  const [university,      setUniversity]      = useState('');
  const [major,           setMajor]           = useState('');
  const [year,            setYear]            = useState('');
  const [studyHours,      setStudyHours]      = useState('');
  const [connectedApps,   setConnectedApps]   = useState<string[]>([]);
  const [error,           setError]           = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const transitionTo = (nextStep: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setStep(nextStep), 120);
  };

  const toggleGoal = (val: string) => {
    setSelectedGoals((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]);
    setError('');
  };

  const toggleApp = (id: string) => {
    setConnectedApps((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]);
  };

  const handleNext = () => {
    if (step === 1 && selectedGoals.length === 0) {
      setError('Pick at least one goal to continue.');
      return;
    }
    setError('');
    if (step < TOTAL_STEPS - 1) {
      transitionTo(step + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    completeOnboarding({
      name:                    name.trim() || undefined,
      mainFocus:               selectedGoals[0] ?? 'study',
      biggestDistraction:      '',
      habitToRemove:           '',
      habitToBuild:            '',
      seriousnessScore:        7,
      lifeRole:                selectedRole ?? undefined,
      selectedTrackTypes:      selectedGoals,
      transformationDirection: major || undefined,
    });
    track('onboarding_completed', {
      goals: selectedGoals,
      role:  selectedRole,
      step:  TOTAL_STEPS,
    });
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <Animated.View style={[s.animated, { opacity: fadeAnim }]}>

        {/* ── Step 0: Welcome ──────────────────────────────────────────────── */}
        {step === 0 && (
          <View style={s.centered}>
            <View style={s.logoWrap}>
              <Ionicons name="flash" size={52} color={Colors.gold} />
            </View>
            <Text style={s.logoTitle}>LifeOS</Text>
            <Text style={s.logoSub}>Your intelligent life operating system.</Text>
            <Text style={s.logoDesc}>
              Built around your goals, schedule, and energy — not the other way around.
            </Text>
            <TouchableOpacity style={s.primaryBtn} onPress={() => transitionTo(1)} activeOpacity={0.85}>
              <Text style={s.primaryBtnText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.textInverse} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 1: Goals ────────────────────────────────────────────────── */}
        {step === 1 && (
          <View style={s.stepContainer}>
            <View style={s.stepHeader}>
              <StepDots current={1} total={TOTAL_STEPS} />
              <Text style={s.stepTitle}>What do you want to achieve?</Text>
              <Text style={s.stepSub}>Select all that apply. We will build your system around these.</Text>
            </View>
            <ScrollView contentContainerStyle={s.optionGrid} showsVerticalScrollIndicator={false}>
              {GOAL_OPTIONS.map((opt) => {
                const active = selectedGoals.includes(opt.value);
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.goalCard, active && { borderColor: opt.color, backgroundColor: opt.color + '18' }]}
                    onPress={() => toggleGoal(opt.value)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={opt.icon} size={24} color={active ? opt.color : Colors.textMuted} />
                    <Text style={[s.goalLabel, active && { color: opt.color, fontWeight: FontWeight.semibold }]}>
                      {opt.label}
                    </Text>
                    {active && (
                      <View style={[s.checkBadge, { backgroundColor: opt.color }]}>
                        <Ionicons name="checkmark" size={10} color={Colors.textInverse} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {error ? <Text style={s.errorText}>{error}</Text> : null}
            <View style={s.footer}>
              <TouchableOpacity style={s.primaryBtn} onPress={handleNext} activeOpacity={0.85}>
                <Text style={s.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.textInverse} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Step 2: About you ────────────────────────────────────────────── */}
        {step === 2 && (
          <ScrollView contentContainerStyle={s.stepContainer} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={s.stepHeader}>
              <StepDots current={2} total={TOTAL_STEPS} />
              <Text style={s.stepTitle}>Tell us about you</Text>
              <Text style={s.stepSub}>Help LifeOS personalize your experience.</Text>
            </View>

            {/* Role chips */}
            <View>
              <Text style={s.fieldLabel}>Your role</Text>
              <View style={s.roleGrid}>
                {ROLE_OPTIONS.map((opt) => {
                  const active = selectedRole === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[s.roleChip, active && s.roleChipActive]}
                      onPress={() => setSelectedRole(opt.value)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={opt.icon} size={14} color={active ? Colors.gold : Colors.textMuted} />
                      <Text style={[s.roleChipText, active && s.roleChipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={s.fieldLabel}>Your name</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Alex"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View>
              <Text style={s.fieldLabel}>University / Workplace (optional)</Text>
              <TextInput
                style={s.input}
                value={university}
                onChangeText={setUniversity}
                placeholder="e.g. MIT, Google, Self-employed"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View>
              <Text style={s.fieldLabel}>Field / Major (optional)</Text>
              <TextInput
                style={s.input}
                value={major}
                onChangeText={setMajor}
                placeholder="e.g. Computer Science, Design"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View>
              <Text style={s.fieldLabel}>Year / Level (optional)</Text>
              <TextInput
                style={s.input}
                value={year}
                onChangeText={setYear}
                placeholder="e.g. Year 2, Junior, 5 years exp."
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View>
              <Text style={s.fieldLabel}>Daily study/work hours goal (optional)</Text>
              <TextInput
                style={s.input}
                value={studyHours}
                onChangeText={setStudyHours}
                placeholder="e.g. 4"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={s.footer}>
              <TouchableOpacity style={s.ghostBtn} onPress={() => transitionTo(3)} activeOpacity={0.7}>
                <Text style={s.ghostBtnText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.primaryBtn, { flex: 1 }]} onPress={handleNext} activeOpacity={0.85}>
                <Text style={s.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.textInverse} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── Step 3: Connect accounts ─────────────────────────────────────── */}
        {step === 3 && (
          <View style={s.stepContainer}>
            <View style={s.stepHeader}>
              <StepDots current={3} total={TOTAL_STEPS} />
              <Text style={s.stepTitle}>Connect your accounts</Text>
              <Text style={s.stepSub}>Optional — you can set this up any time in Settings.</Text>
            </View>
            <ScrollView contentContainerStyle={{ gap: Spacing.sm }} showsVerticalScrollIndicator={false}>
              {CONNECT_OPTIONS.map((opt) => {
                const connected = connectedApps.includes(opt.id);
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[s.connectRow, connected && s.connectRowActive]}
                    onPress={() => toggleApp(opt.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.connectIcon, { backgroundColor: opt.color + '18' }]}>
                      <Ionicons name={opt.icon} size={20} color={opt.color} />
                    </View>
                    <Text style={s.connectLabel}>{opt.label}</Text>
                    <View style={[s.connectCheck, connected && s.connectCheckActive]}>
                      {connected && <Ionicons name="checkmark" size={14} color={Colors.textInverse} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={s.footer}>
              <TouchableOpacity style={s.ghostBtn} onPress={handleFinish} activeOpacity={0.7}>
                <Text style={s.ghostBtnText}>Skip for now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.primaryBtn, { flex: 1 }]} onPress={handleFinish} activeOpacity={0.85}>
                <Text style={s.primaryBtnText}>Get Started</Text>
                <Ionicons name="flash" size={16} color={Colors.textInverse} />
              </TouchableOpacity>
            </View>
          </View>
        )}

      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: Colors.background },
  animated:  { flex: 1 },

  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, gap: Spacing.lg,
  },
  logoWrap:  { width: 96, height: 96, borderRadius: 24, backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  logoTitle: { fontSize: 40, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -1 },
  logoSub:   { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textSecondary, textAlign: 'center' },
  logoDesc:  { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, maxWidth: 300 },

  stepContainer: { flex: 1, padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  stepHeader:    { gap: Spacing.xs },
  stepTitle:     { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -0.5 },
  stepSub:       { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingBottom: Spacing.md },
  goalCard: {
    width: '47%', paddingVertical: Spacing.lg, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', gap: Spacing.sm,
  },
  goalLabel:  { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  checkBadge: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  fieldLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md, color: Colors.textPrimary,
  },

  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  roleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
  },
  roleChipActive:    { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  roleChipText:      { fontSize: FontSize.sm, color: Colors.textSecondary },
  roleChipTextActive:{ color: Colors.gold, fontWeight: FontWeight.semibold },

  connectRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
  },
  connectRowActive: { borderColor: Colors.gold + '66' },
  connectIcon: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  connectLabel: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  connectCheck: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  connectCheckActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },

  footer:      { flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.sm },
  primaryBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gold, borderRadius: Radius.md, paddingVertical: 14, paddingHorizontal: Spacing.xl },
  primaryBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },
  ghostBtn:    { paddingHorizontal: Spacing.lg, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText:{ fontSize: FontSize.sm, color: Colors.textSecondary },
  errorText:   { fontSize: FontSize.sm, color: '#F87171', textAlign: 'center' },
});
