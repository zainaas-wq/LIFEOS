/**
 * paywall.tsx — Post-onboarding premium reveal screen.
 *
 * Shown ONCE after onboarding completes, before the user enters the app.
 * This is the pay-first moment — the highest-conversion point in the funnel.
 *
 * Design principles:
 *   - Personalized with the user's own identity data
 *   - Positions LifeOS as a system, not a tool
 *   - Single clear CTA: Start 7-Day Free Trial
 *   - "Maybe later" escape does NOT free-trial the user — it gates features
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../src/store/useAppStore';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../src/constants/theme';
import type { LifeRole, EnergyStyle } from '../src/types';

// ─── Role / energy display helpers ────────────────────────────────────────────

const ROLE_LABELS: Record<LifeRole, string> = {
  student:      'Student',
  employee:     'Professional',
  freelancer:   'Freelancer',
  'shift-worker': 'Shift Worker',
  creator:      'Creator',
  other:        'Independent',
};

const ENERGY_LABELS: Record<EnergyStyle, string> = {
  morning:   'Morning peak',
  afternoon: 'Afternoon peak',
  evening:   'Evening peak',
  night:     'Night owl',
  flexible:  'Flexible hours',
};

// ─── Value propositions — benefit-first, not feature-first ────────────────────

const VALUE_PROPS = [
  {
    icon: 'calendar-outline' as const,
    title: 'Plans your day intelligently',
    body: 'Builds a real daily schedule around your goals, energy, and fixed commitments — automatically.',
  },
  {
    icon: 'pulse-outline' as const,
    title: 'Detects and corrects drift',
    body: 'Knows when you\'re falling behind before it becomes a problem, and shows you exactly how to recover.',
  },
  {
    icon: 'refresh-outline' as const,
    title: 'Adapts when life interrupts',
    body: 'When your day breaks down, LifeOS rebuilds it intelligently — not by deleting what you missed.',
  },
  {
    icon: 'flag-outline' as const,
    title: 'Keeps your goals moving every week',
    body: 'Tracks weekly progress per goal, flags what\'s at risk, and ensures your priorities don\'t slip.',
  },
] as const;

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const profile      = useAppStore((s) => s.profile);
  const setPaywallSeen = useAppStore((s) => s.setPaywallSeen);
  const goals        = useAppStore((s) => s.goals);

  // Entrance animation
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true, delay: 100 }),
    ]).start();
  }, []);

  const name       = profile?.name ? `, ${profile.name}` : '';
  const roleLabel  = profile?.lifeRole  ? ROLE_LABELS[profile.lifeRole]  : null;
  const energyLabel = profile?.energyStyle ? ENERGY_LABELS[profile.energyStyle] : null;
  const trackCount = profile?.selectedTrackTypes?.length ?? 0;
  const goalCount  = goals.length;

  const handleStartTrial = () => {
    router.push('/upgrade' as any);
  };

  const handleMaybeLater = () => {
    setPaywallSeen();
    router.replace('/(tabs)/home' as any);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Brand mark ──────────────────────────────────────────────────── */}
          <View style={styles.brand}>
            <View style={styles.logoMark}>
              <Ionicons name="layers-outline" size={22} color={Colors.gold} />
            </View>
            <Text style={styles.logoText}>LifeOS</Text>
          </View>

          {/* ── Hero ────────────────────────────────────────────────────────── */}
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>YOUR OPERATING SYSTEM</Text>
            <Text style={styles.heroTitle}>
              Everything is{'\n'}ready for you{name}.
            </Text>
            <Text style={styles.heroSub}>
              Your identity is set. Your goals are mapped.{'\n'}
              Now let the intelligence run.
            </Text>
          </View>

          {/* ── Identity strip — personalized ───────────────────────────────── */}
          <View style={styles.identityCard}>
            <Text style={styles.identityHeading}>BUILT AROUND YOUR LIFE</Text>
            <View style={styles.identityRows}>
              {roleLabel && (
                <View style={styles.identityRow}>
                  <View style={styles.identityIconWrap}>
                    <Ionicons name="person-outline" size={13} color={Colors.gold} />
                  </View>
                  <Text style={styles.identityText}>{roleLabel}</Text>
                </View>
              )}
              {energyLabel && (
                <View style={styles.identityRow}>
                  <View style={styles.identityIconWrap}>
                    <Ionicons name="flash-outline" size={13} color={Colors.gold} />
                  </View>
                  <Text style={styles.identityText}>{energyLabel}</Text>
                </View>
              )}
              {trackCount > 0 && (
                <View style={styles.identityRow}>
                  <View style={styles.identityIconWrap}>
                    <Ionicons name="layers-outline" size={13} color={Colors.gold} />
                  </View>
                  <Text style={styles.identityText}>
                    {trackCount} life track{trackCount !== 1 ? 's' : ''} selected
                  </Text>
                </View>
              )}
              {goalCount > 0 && (
                <View style={styles.identityRow}>
                  <View style={styles.identityIconWrap}>
                    <Ionicons name="flag-outline" size={13} color={Colors.gold} />
                  </View>
                  <Text style={styles.identityText}>
                    {goalCount} active goal{goalCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              {trackCount === 0 && goalCount === 0 && (
                <View style={styles.identityRow}>
                  <View style={styles.identityIconWrap}>
                    <Ionicons name="checkmark-circle-outline" size={13} color={Colors.gold} />
                  </View>
                  <Text style={styles.identityText}>Profile complete — ready to plan</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Divider label ───────────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>WHAT IT DOES FOR YOU — EVERY DAY</Text>

          {/* ── Value propositions ──────────────────────────────────────────── */}
          <View style={styles.valueList}>
            {VALUE_PROPS.map((vp, i) => (
              <View key={i} style={styles.valueProp}>
                <View style={styles.valuePropIcon}>
                  <Ionicons name={vp.icon} size={16} color={Colors.gold} />
                </View>
                <View style={styles.valuePropText}>
                  <Text style={styles.valuePropTitle}>{vp.title}</Text>
                  <Text style={styles.valuePropBody}>{vp.body}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── Trial CTA ───────────────────────────────────────────────────── */}
          <View style={styles.ctaSection}>
            <TouchableOpacity
              style={styles.trialBtn}
              onPress={handleStartTrial}
              activeOpacity={0.85}
            >
              <Ionicons name="sparkles" size={16} color={Colors.textInverse} />
              <Text style={styles.trialBtnText}>Start 7-Day Free Trial</Text>
            </TouchableOpacity>

            <Text style={styles.trialNote}>
              Then billed monthly. Cancel anytime before trial ends.
            </Text>

            <TouchableOpacity
              onPress={handleMaybeLater}
              style={styles.laterBtn}
              activeOpacity={0.6}
            >
              <Text style={styles.laterText}>Maybe later</Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.xl },

  // Brand
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },

  // Hero
  hero: { gap: Spacing.sm, paddingTop: Spacing.md },
  heroLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.gold,
    letterSpacing: 2,
  },
  heroTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 42,
  },
  heroSub: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  // Identity card
  identityCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.gold,
  },
  identityHeading: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.gold,
    letterSpacing: 1.5,
  },
  identityRows: { gap: Spacing.xs + 2 },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  identityIconWrap: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    backgroundColor: Colors.goldMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },

  // Section label
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    letterSpacing: 1.5,
  },

  // Value props
  valueList: { gap: Spacing.md },
  valueProp: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  valuePropIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  valuePropText: { flex: 1, gap: 4 },
  valuePropTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  valuePropBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  // CTA section
  ctaSection: {
    gap: Spacing.sm,
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  trialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    width: '100%',
    ...Shadow.gold,
  },
  trialBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
    letterSpacing: 0.3,
  },
  trialNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  laterBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  laterText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
});
