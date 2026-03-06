import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { useAppStore } from '../../src/store/useAppStore';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';

const { width } = Dimensions.get('window');

interface OnboardingData {
  mainFocus: string;
  biggestDistraction: string;
  habitToRemove: string;
  habitToBuild: string;
  seriousnessScore: number;
}

const STEPS = [
  {
    key: 'welcome',
    title: 'Your Operating\nSystem for Life',
    subtitle: 'Define your rules. Protect your time.\nExecute with precision.',
    type: 'welcome',
  },
  {
    key: 'mainFocus',
    title: 'What is your main\nfocus right now?',
    subtitle: 'One clear north star. Not two, not three.',
    field: 'mainFocus' as keyof OnboardingData,
    placeholder: 'e.g. Launch my startup, Get lean, Finish my thesis...',
    type: 'text',
  },
  {
    key: 'biggestDistraction',
    title: 'What distracts you\nthe most?',
    subtitle: 'Name the enemy. It loses power when named.',
    field: 'biggestDistraction' as keyof OnboardingData,
    placeholder: 'e.g. Social media, YouTube, excessive meetings...',
    type: 'text',
  },
  {
    key: 'habitToRemove',
    title: 'One habit you need\nto eliminate?',
    subtitle: 'The one that costs you the most.',
    field: 'habitToRemove' as keyof OnboardingData,
    placeholder: 'e.g. Doom scrolling, late-night snacking, procrastination...',
    type: 'text',
  },
  {
    key: 'habitToBuild',
    title: 'One habit you are\ncommitted to build?',
    subtitle: 'Small and consistent beats ambitious and irregular.',
    field: 'habitToBuild' as keyof OnboardingData,
    placeholder: 'e.g. Daily exercise, deep work blocks, journaling...',
    type: 'text',
  },
  {
    key: 'seriousness',
    title: 'How serious are\nyou about this?',
    subtitle: 'Honesty calibrates your system. No judgment.',
    field: 'seriousnessScore' as keyof OnboardingData,
    type: 'score',
  },
] as const;

export default function OnboardingScreen() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    mainFocus: '',
    biggestDistraction: '',
    habitToRemove: '',
    habitToBuild: '',
    seriousnessScore: 7,
  });
  const [errors, setErrors] = useState<Partial<OnboardingData>>({});
  const progressAnim = useRef(new Animated.Value(0)).current;

  const currentStep = STEPS[step];
  const totalSteps = STEPS.length;

  const animateProgress = (toStep: number) => {
    Animated.timing(progressAnim, {
      toValue: toStep / (totalSteps - 1),
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const validate = (): boolean => {
    if (currentStep.type === 'welcome' || currentStep.type === 'score') return true;
    const field = currentStep.field as keyof OnboardingData;
    if (!data[field] || String(data[field]).trim() === '') {
      setErrors((e) => ({ ...e, [field]: 'Please fill this in to continue.' }));
      return false;
    }
    setErrors({});
    return true;
  };

  const handleNext = () => {
    if (!validate()) return;
    if (step < totalSteps - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      animateProgress(nextStep);
    } else {
      completeOnboarding(data);
      router.replace('/(tabs)/home');
    }
  };

  const handleBack = () => {
    if (step > 0) {
      const prevStep = step - 1;
      setStep(prevStep);
      animateProgress(prevStep);
    }
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* Progress bar */}
        {step > 0 && (
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Brand */}
          <View style={styles.brand}>
            <Text style={styles.brandText}>LIFE<Text style={styles.brandAccent}>OS</Text></Text>
          </View>

          {/* Step content */}
          <View style={styles.stepContent}>
            <Text style={styles.title}>{currentStep.title}</Text>
            <Text style={styles.subtitle}>{currentStep.subtitle}</Text>

            {currentStep.type === 'text' && (
              <Input
                value={String(data[currentStep.field] ?? '')}
                onChangeText={(text) => {
                  setData((d) => ({ ...d, [currentStep.field]: text }));
                  setErrors({});
                }}
                placeholder={currentStep.placeholder}
                multiline
                numberOfLines={3}
                error={errors[currentStep.field as keyof typeof errors] as string}
                autoFocus
                containerStyle={styles.input}
              />
            )}

            {currentStep.type === 'score' && (
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreValue}>{data.seriousnessScore}</Text>
                <Text style={styles.scoreLabel}>/ 10</Text>
                <View style={styles.scorePills}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setData((d) => ({ ...d, seriousnessScore: n }))}
                      activeOpacity={0.7}
                      style={[
                        styles.scorePill,
                        data.seriousnessScore === n && styles.scorePillActive,
                        data.seriousnessScore >= n && styles.scorePillFilled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.scorePillText,
                          data.seriousnessScore >= n && styles.scorePillTextActive,
                        ]}
                      >
                        {n}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.scoreHint}>
                  {data.seriousnessScore <= 3
                    ? 'Casually exploring. That\'s okay — be honest with yourself.'
                    : data.seriousnessScore <= 6
                    ? 'You\'re motivated. Turn that into a system.'
                    : data.seriousnessScore <= 9
                    ? 'High commitment. LifeOS will help you execute.'
                    : 'Fully locked in. Let\'s build your system.'}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Navigation */}
        <View style={styles.nav}>
          {step > 0 ? (
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <Button
            label={step === totalSteps - 1 ? 'Build My System' : 'Continue'}
            onPress={handleNext}
            size="lg"
            style={styles.nextBtn}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl + Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  brand: {
    marginBottom: Spacing.xxl,
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
  stepContent: {
    flex: 1,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.display - 8,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: Spacing.sm,
  },
  input: {
    marginTop: Spacing.md,
  },
  scoreContainer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  scoreValue: {
    fontSize: 80,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
    lineHeight: 88,
  },
  scoreLabel: {
    fontSize: FontSize.xl,
    color: Colors.textSecondary,
    marginTop: -Spacing.md,
  },
  scorePills: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  scorePill: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePillActive: {
    borderColor: Colors.gold,
  },
  scorePillFilled: {
    backgroundColor: Colors.goldMuted,
  },
  scorePillText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  scorePillTextActive: {
    color: Colors.gold,
    fontWeight: FontWeight.bold,
  },
  scoreHint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    lineHeight: 20,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  backBtn: {
    padding: Spacing.sm,
  },
  backText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  nextBtn: {
    minWidth: 180,
  },
});
