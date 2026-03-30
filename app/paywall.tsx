/**
 * paywall.tsx — Trial-expired hard gate.
 *
 * Shown when the 3-day trial has expired and the user is not Pro.
 * There is NO "Maybe later" escape — the only path is to subscribe.
 *
 * Design principles:
 *   - Empathetic tone: "Your trial has ended"
 *   - Surfaces what the user built during trial (goals, identity)
 *   - Single clear CTA: Start LifeOS Pro
 *   - No bypass path — no dismiss, no free tier
 */

import React, { useEffect, useRef, useMemo } from 'react';
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
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../src/store/useAppStore';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../src/constants/theme';

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const { t } = useTranslation();
  const profile = useAppStore((s) => s.profile);
  const goals   = useAppStore((s) => s.goals);

  // Entrance animation
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true, delay: 80 }),
    ]).start();
  }, []);

  const VALUE_PROPS = useMemo(() => [
    { icon: 'calendar-outline' as const, title: t('paywall.value_1_title'), body: t('paywall.value_1_body') },
    { icon: 'pulse-outline'    as const, title: t('paywall.value_2_title'), body: t('paywall.value_2_body') },
    { icon: 'refresh-outline'  as const, title: t('paywall.value_3_title'), body: t('paywall.value_3_body') },
    { icon: 'flag-outline'     as const, title: t('paywall.value_4_title'), body: t('paywall.value_4_body') },
  ], [t]);

  const name        = profile?.name ? `, ${profile.name}` : '';
  const roleLabel   = profile?.lifeRole    ? t(`paywall.role_${profile.lifeRole.replace('-', '_')}`) : null;
  const energyLabel = profile?.energyStyle ? t(`paywall.energy_${profile.energyStyle}`)               : null;
  const trackCount  = profile?.selectedTrackTypes?.length ?? 0;
  const goalCount   = goals.length;

  const handleStartPro = () => router.push('/upgrade' as any);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Brand mark ────────────────────────────────────────────────────── */}
          <View style={styles.brand}>
            <View style={styles.logoMark}>
              <Ionicons name="layers-outline" size={20} color={Colors.gold} />
            </View>
            <Text style={styles.logoText}>LifeOS</Text>
          </View>

          {/* ── Hero ──────────────────────────────────────────────────────────── */}
          <View style={styles.hero}>
            <View style={styles.heroLabelRow}>
              <View style={styles.heroDot} />
              <Text style={styles.heroLabelText}>{t('paywall.system_label')}</Text>
            </View>
            <Text style={styles.heroTitle}>{t('paywall.hero_title_expired')}</Text>
            <Text style={styles.heroSub}>{t('paywall.hero_sub_expired', { name })}</Text>
          </View>

          {/* ── Identity card — personalized ──────────────────────────────────── */}
          <View style={styles.identityCard}>
            <View style={styles.identityCardHeader}>
              <Ionicons name="person-circle-outline" size={15} color={Colors.gold} />
              <Text style={styles.identityHeading}>{t('paywall.identity_heading')}</Text>
            </View>
            <View style={styles.identityDivider} />
            <View style={styles.identityRows}>
              {roleLabel && (
                <View style={styles.identityRow}>
                  <View style={styles.identityIconWrap}>
                    <Ionicons name="briefcase-outline" size={11} color={Colors.gold} />
                  </View>
                  <Text style={styles.identityText}>{roleLabel}</Text>
                </View>
              )}
              {energyLabel && (
                <View style={styles.identityRow}>
                  <View style={styles.identityIconWrap}>
                    <Ionicons name="flash-outline" size={11} color={Colors.gold} />
                  </View>
                  <Text style={styles.identityText}>{energyLabel}</Text>
                </View>
              )}
              {trackCount > 0 && (
                <View style={styles.identityRow}>
                  <View style={styles.identityIconWrap}>
                    <Ionicons name="layers-outline" size={11} color={Colors.gold} />
                  </View>
                  <Text style={styles.identityText}>
                    {t('paywall.tracks', { count: trackCount })}
                  </Text>
                </View>
              )}
              {goalCount > 0 && (
                <View style={styles.identityRow}>
                  <View style={styles.identityIconWrap}>
                    <Ionicons name="flag-outline" size={11} color={Colors.gold} />
                  </View>
                  <Text style={styles.identityText}>
                    {t('paywall.goals', { count: goalCount })}
                  </Text>
                </View>
              )}
              {trackCount === 0 && goalCount === 0 && (
                <View style={styles.identityRow}>
                  <View style={styles.identityIconWrap}>
                    <Ionicons name="checkmark-circle-outline" size={11} color={Colors.gold} />
                  </View>
                  <Text style={styles.identityText}>{t('paywall.profile_complete')}</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Section divider ───────────────────────────────────────────────── */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.sectionLabel}>{t('paywall.section_label')}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ── Value propositions — card style with accent ────────────────────── */}
          <View style={styles.valueList}>
            {VALUE_PROPS.map((vp, i) => (
              <View key={i} style={styles.valueProp}>
                <View style={styles.valuePropAccent} />
                <View style={styles.valuePropInner}>
                  <View style={styles.valuePropIcon}>
                    <Ionicons name={vp.icon} size={14} color={Colors.gold} />
                  </View>
                  <View style={styles.valuePropText}>
                    <Text style={styles.valuePropTitle}>{vp.title}</Text>
                    <Text style={styles.valuePropBody}>{vp.body}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* ── Trial CTA ─────────────────────────────────────────────────────── */}
          <View style={styles.ctaSection}>
            <TouchableOpacity
              style={styles.trialBtn}
              onPress={handleStartPro}
              activeOpacity={0.85}
            >
              <Ionicons name="sparkles" size={16} color={Colors.textInverse} />
              <Text style={styles.trialBtnText}>{t('paywall.pro_btn')}</Text>
            </TouchableOpacity>

            <Text style={styles.trialNote}>{t('paywall.cancel_note')}</Text>
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
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
  },

  // Brand
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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
    letterSpacing: 0.8,
  },

  // Hero
  hero: { gap: Spacing.sm, paddingTop: Spacing.xs },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gold,
  },
  heroLabelText: {
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
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  // Identity card
  identityCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    overflow: 'hidden',
    ...Shadow.gold,
  },
  identityCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  identityHeading: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
    letterSpacing: 1.5,
  },
  identityDivider: {
    height: 1,
    backgroundColor: Colors.goldDim,
    opacity: 0.3,
    marginHorizontal: Spacing.md,
  },
  identityRows: {
    gap: Spacing.xs + 2,
    padding: Spacing.md,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  identityIconWrap: {
    width: 22,
    height: 22,
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

  // Section divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    letterSpacing: 1.5,
  },

  // Value props
  valueList: { gap: Spacing.sm },
  valueProp: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  valuePropAccent: {
    width: 3,
    backgroundColor: Colors.gold,
    flexShrink: 0,
  },
  valuePropInner: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    alignItems: 'flex-start',
  },
  valuePropIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  valuePropText: { flex: 1, gap: 3 },
  valuePropTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  valuePropBody: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
  },

  // CTA section
  ctaSection: {
    gap: Spacing.sm,
    alignItems: 'center',
    paddingTop: Spacing.xs,
  },
  trialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingVertical: 18,
    width: '100%',
    ...Shadow.gold,
  },
  trialBtnText: {
    fontSize: FontSize.lg,
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
