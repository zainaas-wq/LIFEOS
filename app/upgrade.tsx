/**
 * upgrade.tsx — Premium subscription screen.
 * Phase F rebuild: visual shell elevation.
 *
 * Rebuilt to eliminate the free-plan framing entirely.
 * This screen communicates what LifeOS IS and what it costs — directly.
 * No feature table comparison. No "Free vs Pro" framing.
 * Value is front-and-center. Price is confident. CTA is single and clear.
 *
 * Purchase state machine is preserved exactly as before.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../src/constants/theme';
import {
  getProOffering,
  purchasePro,
  restorePurchases,
  type ProOffering,
} from '../src/services/purchaseService';
import { useMonthlyUsage } from '../src/services/usageService';
import { track } from '../src/services/analyticsService';
import { useAppStore } from '../src/store/useAppStore';

// ── State machine ─────────────────────────────────────────────────────────────

type Phase =
  | 'loading_offering'
  | 'ready'
  | 'purchasing'
  | 'activating'
  | 'success'
  | 'activation_pending'
  | 'error';

// ── Value card accent colors ───────────────────────────────────────────────────

const VALUE_ACCENTS = [
  Colors.purpleLight,
  Colors.warning,
  Colors.gold,
  Colors.success,
] as const;

const VALUE_ICONS = [
  'infinite-outline',
  'refresh-outline',
  'compass-outline',
  'layers-outline',
] as const;

// ── Screen ────────────────────────────────────────────────────────────────────

export default function UpgradeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { refresh: refreshUsage } = useMonthlyUsage();
  const profile = useAppStore((s) => s.profile);

  const [phase, setPhase]             = useState<Phase>('loading_offering');
  const [offering, setOffering]       = useState<ProOffering | null>(null);
  const [busyLabel, setBusyLabel]     = useState('');
  const [pendingMsg, setPendingMsg]   = useState('');
  const [errorMsg, setErrorMsg]       = useState('');
  const [restoreNote, setRestoreNote] = useState('');

  useEffect(() => {
    track('paywall_viewed');
    getProOffering()
      .then((o) => { setOffering(o); setPhase('ready'); })
      .catch(()  => {              setPhase('ready'); });
  }, []);

  const isBusy = phase === 'purchasing' || phase === 'activating';

  // ── Purchase flow ─────────────────────────────────────────────────────────

  const handleBuy = async () => {
    track('purchase_started', { product_id: offering?.productId ?? '' });
    setRestoreNote('');
    setBusyLabel(t('upgrade.processing'));
    setPhase('purchasing');

    const result = await purchasePro();

    switch (result.status) {
      case 'cancelled':
        setPhase('ready');
        return;
      case 'error':
        setErrorMsg(result.message);
        setPhase('error');
        return;
      case 'activation_pending':
        setPendingMsg(result.message);
        setPhase('activation_pending');
        return;
      case 'success':
        track('purchase_succeeded', { product_id: offering?.productId ?? '' });
        setBusyLabel(t('upgrade.activating'));
        setPhase('activating');
        await refreshUsage().catch(() => {});
        setPhase('success');
    }
  };

  // ── Restore flow ──────────────────────────────────────────────────────────

  const handleRestore = async () => {
    setRestoreNote('');
    setBusyLabel(t('upgrade.restoring'));
    setPhase('purchasing');

    const result = await restorePurchases();

    if (result.restored) {
      track('purchase_restored');
      setBusyLabel(t('upgrade.activating'));
      setPhase('activating');
      await refreshUsage().catch(() => {});
      setPhase('success');
      return;
    }

    if (result.reason === 'no_active_subscription') {
      setRestoreNote(t('upgrade.restore_none'));
      setPhase('ready');
      return;
    }

    setErrorMsg(result.message ?? t('upgrade.restore_failed'));
    setPhase('error');
  };

  const handleTryAgain = () => {
    setErrorMsg('');
    setPhase('ready');
  };

  // ── Success screen ────────────────────────────────────────────────────────

  if (phase === 'success') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successWrap}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark" size={36} color={Colors.gold} />
          </View>
          <Text style={styles.successTitle}>{t('upgrade.success_title')}</Text>
          <Text style={styles.successBody}>
            {t('upgrade.success_body')}
            {profile?.name ? `\n\n${t('upgrade.success_welcome', { name: profile.name })}` : ''}
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/home' as any)}
            style={styles.successBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>{t('upgrade.enter_app')}</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.textInverse} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main screen ───────────────────────────────────────────────────────────

  const roles = t('upgrade.default_roles');
  const headline = t('upgrade.hero_title', { roles });

  const valueTitles = [
    t('upgrade.value_1_title'),
    t('upgrade.value_2_title'),
    t('upgrade.value_3_title'),
    t('upgrade.value_4_title'),
  ];
  const valueSubs = [
    t('upgrade.value_1_sub'),
    t('upgrade.value_2_sub'),
    t('upgrade.value_3_sub'),
    t('upgrade.value_4_sub'),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.proBadge}>
            <Ionicons name="sparkles" size={13} color={Colors.gold} />
            <Text style={styles.proBadgeText}>{t('upgrade.badge')}</Text>
          </View>
          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.subtitle}>{t('upgrade.subtitle')}</Text>
        </View>

        {/* Value cards with accent bars */}
        <View style={styles.valueCards}>
          {valueTitles.map((title, i) => (
            <View key={i} style={styles.valueCard}>
              <View style={[styles.valueCardAccent, { backgroundColor: VALUE_ACCENTS[i] }]} />
              <View style={styles.valueCardInner}>
                <Ionicons
                  name={VALUE_ICONS[i]}
                  size={22}
                  color={VALUE_ACCENTS[i]}
                />
                <View style={styles.vBody}>
                  <Text style={styles.vTitle}>{title}</Text>
                  <Text style={styles.vSub}>{valueSubs[i]}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Restore link */}
        <TouchableOpacity
          onPress={handleRestore}
          style={styles.restoreLink}
          disabled={isBusy}
          activeOpacity={0.6}
        >
          <Text style={styles.restoreLinkText}>{t('upgrade.restore_link')}</Text>
        </TouchableOpacity>

        {/* Notices */}
        {phase === 'activation_pending' && (
          <View style={styles.noticeCard}>
            <Ionicons name="time-outline" size={16} color={Colors.warning} />
            <Text style={styles.noticeText}>{pendingMsg}</Text>
          </View>
        )}
        {phase === 'error' && (
          <View style={[styles.noticeCard, styles.noticeError]}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
            <Text style={[styles.noticeText, styles.noticeTextError]}>{errorMsg}</Text>
          </View>
        )}
        {!!restoreNote && (
          <View style={styles.noticeCard}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.noticeText}>{restoreNote}</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA bar */}
      <View style={styles.bottomBar}>
        {isBusy && (
          <Text style={styles.busyLabel}>{busyLabel}</Text>
        )}
        <TouchableOpacity
          onPress={phase === 'error' ? handleTryAgain : handleBuy}
          style={[styles.ctaBtn, isBusy && styles.ctaBtnBusy]}
          disabled={isBusy}
          activeOpacity={0.85}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color={Colors.textInverse} />
          ) : phase === 'error' ? (
            <Text style={styles.ctaBtnText}>{t('upgrade.try_again')}</Text>
          ) : (
            <Text style={styles.ctaBtnText}>{t('upgrade.start_trial')}</Text>
          )}
        </TouchableOpacity>

        {/* Price line — shown only when not busy and not in error state */}
        {!isBusy && phase !== 'error' && (
          <Text style={styles.priceNote}>
            {offering
              ? t('upgrade.price_after_trial', { price: offering.priceString })
              : t('upgrade.price_unavailable')}
          </Text>
        )}

        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.maybeBtn}
          activeOpacity={0.7}
          disabled={isBusy}
        >
          <Text style={styles.maybeBtnText}>{t('upgrade.maybe_later')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
  },

  // Hero
  hero: { gap: Spacing.sm },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.goldMuted,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    alignSelf: 'flex-start',
  },
  proBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
    letterSpacing: 2,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 24,
  },

  // Value cards
  valueCards: { gap: Spacing.sm },
  valueCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  valueCardAccent: {
    width: 3,
    flexShrink: 0,
  },
  valueCardInner: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    alignItems: 'flex-start',
  },
  vBody: { flex: 1, gap: 4 },
  vTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  vSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 20,
  },

  // Restore link
  restoreLink: { alignItems: 'center', paddingVertical: Spacing.xs },
  restoreLinkText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },

  // Notices
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  noticeError: {
    borderColor: Colors.errorMuted,
    backgroundColor: Colors.errorMuted,
  },
  noticeText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  noticeTextError: { color: Colors.error },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  busyLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  ctaBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingVertical: 18,
    ...Shadow.gold,
  },
  ctaBtnBusy: { opacity: 0.7 },
  ctaBtnText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
    letterSpacing: 0.3,
  },
  priceNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  maybeBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  maybeBtnText: { fontSize: FontSize.sm, color: Colors.textMuted },

  // Success
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  successIconWrap: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.gold,
  },
  successTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  successBody: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  successBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingVertical: 18,
    width: '100%',
    ...Shadow.gold,
    marginTop: Spacing.sm,
  },
});
