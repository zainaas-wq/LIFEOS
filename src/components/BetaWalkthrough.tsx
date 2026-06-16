import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';
import { track } from '../services/analyticsService';

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: 'sparkles' as const,
    iconColor: Colors.gold,
    title: 'What is LifeOS?',
    description:
      'LifeOS is your AI-powered life operating system. It connects your goals, studies, projects, and habits — then uses AI to execute your life, not just list it.',
    route: null as string | null,
    actionLabel: null as string | null,
  },
  {
    icon: 'library-outline' as const,
    iconColor: '#818CF8',
    title: 'Save Your First Memory',
    description:
      "Memories are the foundation. Save insights, decisions, and knowledge — your AI Coach uses them for personalized recommendations. The more you save, the smarter LifeOS becomes.",
    route: '/(tabs)/memory' as string | null,
    actionLabel: 'Open Memories' as string | null,
  },
  {
    icon: 'chatbubbles-outline' as const,
    iconColor: '#34D399',
    title: 'Ask Your AI Coach',
    description:
      'The AI knows your goals, study risks, project status, and memories. Try: "What should I focus on?" or "Am I on track with my goals?" or "What are my weakest topics?"',
    route: '/(tabs)/ai' as string | null,
    actionLabel: 'Open AI Coach' as string | null,
  },
  {
    icon: 'flag-outline' as const,
    iconColor: '#FB923C',
    title: 'Create a Goal or Project',
    description:
      'Goals drive your weekly plan and generate AI recommendations. Projects track your builds with milestone-level health scores and stagnation detection.',
    route: '/(tabs)/goals' as string | null,
    actionLabel: 'Go to Goals' as string | null,
  },
  {
    icon: 'analytics-outline' as const,
    iconColor: '#60A5FA',
    title: 'Intelligence Activates Automatically',
    description:
      'Home shows your alignment score and goal risks. Study screen shows academic readiness. Projects show health scores and blockers. All computed automatically — no setup needed.',
    route: '/(tabs)/home' as string | null,
    actionLabel: 'See Dashboard' as string | null,
  },
  {
    icon: 'checkmark-circle' as const,
    iconColor: '#4ADE80',
    title: "You're Ready",
    description:
      "LifeOS is fully activated. Use it daily — the more you interact, the smarter your recommendations become. Your AI Coach is always one tap away.",
    route: null as string | null,
    actionLabel: null as string | null,
  },
] as const;

// ─── BetaWalkthrough component ────────────────────────────────────────────────

interface BetaWalkthroughProps {
  visible: boolean;
  onClose: () => void;
}

export function BetaWalkthrough({ visible, onClose }: BetaWalkthroughProps) {
  const [step, setStep] = useState(0);
  const setWalkthroughComplete = useAppStore((s) => s.setWalkthroughComplete);

  const current  = STEPS[step];
  const isLast   = step === STEPS.length - 1;
  const progress = (step + 1) / STEPS.length;

  const handleOpen = () => {
    if (!visible) return;
    track('walkthrough_started');
  };

  const handleNext = () => {
    if (isLast) {
      setWalkthroughComplete();
      track('walkthrough_completed');
      onClose();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    track('walkthrough_skipped', { at_step: step });
    setWalkthroughComplete();
    onClose();
  };

  const handleAction = () => {
    if (current.route) {
      router.push(current.route as any);
    }
    handleNext();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onShow={handleOpen}
    >
      <View style={s.overlay}>
        <View style={s.sheet}>

          {/* Progress bar ── */}
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
          </View>

          {/* Header row ── */}
          <View style={s.header}>
            <Text style={s.stepLabel}>Step {step + 1} of {STEPS.length}</Text>
            {!isLast && (
              <TouchableOpacity
                onPress={handleSkip}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={s.skipText}>Skip all</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Icon ── */}
          <View style={[s.iconWrap, { backgroundColor: current.iconColor + '1A' }]}>
            <Ionicons name={current.icon} size={32} color={current.iconColor} />
          </View>

          {/* Content ── */}
          <Text style={s.title}>{current.title}</Text>
          <Text style={s.description}>{current.description}</Text>

          {/* Action buttons ── */}
          <View style={s.actions}>
            {current.actionLabel && (
              <TouchableOpacity
                style={[s.actionBtn, { borderColor: current.iconColor + '55' }]}
                onPress={handleAction}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="arrow-forward-circle-outline"
                  size={15}
                  color={current.iconColor}
                />
                <Text style={[s.actionBtnText, { color: current.iconColor }]}>
                  {current.actionLabel}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                s.nextBtn,
                isLast && { backgroundColor: '#4ADE8020', borderColor: '#4ADE80' },
              ]}
              onPress={handleNext}
              activeOpacity={0.85}
            >
              <Text style={[s.nextBtnText, isLast && { color: '#4ADE80' }]}>
                {isLast ? 'Start Using LifeOS' : current.actionLabel ? 'Skip & Continue' : 'Next'}
              </Text>
              <Ionicons
                name={isLast ? 'checkmark' : 'arrow-forward'}
                size={14}
                color={isLast ? '#4ADE80' : Colors.textInverse}
              />
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },

  progressTrack: {
    height: 3,
    backgroundColor: Colors.border,
    borderRadius: 2,
  },
  progressFill: {
    height: 3,
    backgroundColor: Colors.gold,
    borderRadius: 2,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  skipText: { fontSize: FontSize.sm, color: Colors.textMuted },

  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  actions: { gap: Spacing.sm, marginTop: Spacing.xs },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  actionBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.gold,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  nextBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
});
