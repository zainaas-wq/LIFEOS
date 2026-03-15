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
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../src/constants/theme';
import {
  getProOffering,
  purchasePro,
  restorePurchases,
  type ProOffering,
} from '../src/services/purchaseService';
import { useMonthlyUsage } from '../src/services/usageService';
import { track } from '../src/services/analyticsService';

// ── State machine ─────────────────────────────────────────────────────────────

type Phase =
  | 'loading_offering'    // fetching price from RC on mount
  | 'ready'               // idle paywall — user can act
  | 'purchasing'          // purchasePro() / restorePurchases() in flight
  | 'activating'          // backend confirmed; refreshing local usage cache
  | 'success'             // cache refreshed — show success screen
  | 'activation_pending'  // purchase received; backend not yet confirmed
  | 'error';              // unrecoverable — show message + Try Again

// ── Feature data ──────────────────────────────────────────────────────────────

const FREE_FEATURES = [
  '100 AI credits / month',
  'AI coach chat',
  'AI daily planning',
  'AI recovery mode',
] as const;

// Pro extras displayed on top of Free baseline
const PRO_EXTRAS = [
  'Everything in Free',
  '600 AI credits / month',
  'Weekly AI planning',
  'Monthly AI review',
] as const;

// ── Shared button base (referenced in StyleSheet below) ───────────────────────

const btnBase = {
  borderRadius: Radius.md,
  flexDirection:  'row'    as const,
  alignItems:     'center' as const,
  justifyContent: 'center' as const,
  paddingVertical: Spacing.md,
  gap: Spacing.xs,
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function UpgradeScreen() {
  const router = useRouter();
  const { refresh: refreshUsage } = useMonthlyUsage();

  const [phase, setPhase]             = useState<Phase>('loading_offering');
  const [offering, setOffering]       = useState<ProOffering | null>(null);
  const [busyLabel, setBusyLabel]     = useState('Processing…');
  const [pendingMsg, setPendingMsg]   = useState('');
  const [errorMsg, setErrorMsg]       = useState('');
  const [restoreNote, setRestoreNote] = useState('');

  // Load offering price on mount — non-blocking, error is silent
  useEffect(() => {
    track('paywall_viewed');
    getProOffering()
      .then((o) => { setOffering(o); setPhase('ready'); })
      .catch(()  => {              setPhase('ready'); });
  }, []);

  const isBusy = phase === 'purchasing' || phase === 'activating';

  // ── Purchase flow ────────────────────────────────────────────────────────

  const handleBuy = async () => {
    track('purchase_started', { product_id: offering?.productId ?? '' });
    setRestoreNote('');
    setBusyLabel('Processing…');
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
        setBusyLabel('Activating…');
        setPhase('activating');
        await refreshUsage().catch(() => {});
        setPhase('success');
    }
  };

  // ── Restore flow ─────────────────────────────────────────────────────────

  const handleRestore = async () => {
    setRestoreNote('');
    setBusyLabel('Restoring…');
    setPhase('purchasing');

    const result = await restorePurchases();

    if (result.restored) {
      track('purchase_restored');
      setBusyLabel('Activating…');
      setPhase('activating');
      await refreshUsage().catch(() => {});
      setPhase('success');
      return;
    }

    if (result.reason === 'no_active_subscription') {
      setRestoreNote('No active subscription found for this account.');
      setPhase('ready');
      return;
    }

    setErrorMsg(result.message ?? 'Restore failed. Please try again.');
    setPhase('error');
  };

  // ── Try again (from error) ────────────────────────────────────────────────

  const handleTryAgain = () => {
    setErrorMsg('');
    setPhase('ready');
  };

  // ── Success screen ────────────────────────────────────────────────────────

  if (phase === 'success') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={32} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>You're now Pro</Text>
          <Text style={styles.successBody}>
            Your subscription is active. All Pro features are available now.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.successBtn}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={15} color={Colors.textInverse} />
            <Text style={styles.ctaBtnText}>Back to LifeOS</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Paywall screen ────────────────────────────────────────────────────────

  const priceLabel = offering?.priceString ?? null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Back */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backBtn}
        disabled={isBusy}
        activeOpacity={0.7}
      >
        <Ionicons
          name="chevron-back"
          size={22}
          color={isBusy ? Colors.textMuted : Colors.textSecondary}
        />
        <Text style={[styles.backText, isBusy && styles.dim]}>Back</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.iconBadge}>
            <Ionicons name="sparkles" size={26} color={Colors.gold} />
          </View>
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
          <Text style={styles.title}>Upgrade to Pro</Text>
          <Text style={styles.subtitle}>
            More AI power for people who move with intention.
          </Text>
        </View>

        {/* Price row */}
        {phase === 'loading_offering' && (
          <View style={styles.priceRow}>
            <ActivityIndicator size="small" color={Colors.textMuted} />
          </View>
        )}
        {phase !== 'loading_offering' && !!priceLabel && (
          <View style={styles.priceRow}>
            <Text style={styles.priceText}>{priceLabel}</Text>
            <Text style={styles.priceNote}> per month · cancel anytime</Text>
          </View>
        )}

        {/* Feature comparison: two stacked cards */}
        <View style={styles.compareWrap}>
          {/* Free */}
          <View style={styles.compareCard}>
            <Text style={styles.cardTier}>Free</Text>
            {FREE_FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons name="checkmark" size={13} color={Colors.textMuted} />
                <Text style={styles.featureFree}>{f}</Text>
              </View>
            ))}
          </View>

          {/* Pro */}
          <View style={[styles.compareCard, styles.compareCardPro]}>
            <View style={styles.cardProHeader}>
              <Text style={styles.cardTierPro}>Pro</Text>
              <View style={styles.cardBadge}>
                <Text style={styles.cardBadgeText}>RECOMMENDED</Text>
              </View>
            </View>
            {PRO_EXTRAS.map((f, i) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons
                  name={i === 0 ? 'checkmark' : 'sparkles'}
                  size={i === 0 ? 13 : 11}
                  color={Colors.gold}
                />
                <Text style={[styles.featurePro, i > 0 && styles.featureProExtra]}>
                  {f}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* activation_pending notice */}
        {phase === 'activation_pending' && (
          <View style={styles.noticeCard}>
            <Ionicons name="time-outline" size={16} color={Colors.warning} />
            <Text style={styles.noticeText}>{pendingMsg}</Text>
          </View>
        )}

        {/* error notice */}
        {phase === 'error' && (
          <View style={[styles.noticeCard, styles.noticeError]}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
            <Text style={[styles.noticeText, styles.noticeTextError]}>{errorMsg}</Text>
          </View>
        )}

        {/* restore note (no active subscription) */}
        {!!restoreNote && (
          <View style={styles.noticeCard}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.noticeText}>{restoreNote}</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {/* Primary CTA — switches to Restore when activation_pending */}
        {phase === 'activation_pending' ? (
          <TouchableOpacity
            onPress={handleRestore}
            style={styles.ctaBtn}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={15} color={Colors.textInverse} />
            <Text style={styles.ctaBtnText}>Restore Purchases</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={phase === 'error' ? handleTryAgain : handleBuy}
            style={[styles.ctaBtn, isBusy && styles.ctaBtnBusy]}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            {isBusy ? (
              <>
                <ActivityIndicator size="small" color={Colors.textInverse} />
                <Text style={styles.ctaBtnText}>{busyLabel}</Text>
              </>
            ) : phase === 'error' ? (
              <Text style={styles.ctaBtnText}>Try Again</Text>
            ) : (
              <>
                <Ionicons name="sparkles" size={15} color={Colors.textInverse} />
                <Text style={styles.ctaBtnText}>
                  {priceLabel ? `Get Pro — ${priceLabel}` : 'Get Pro'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Restore Purchases link — secondary, hidden when already restoring/activating */}
        {!isBusy && phase !== 'activation_pending' && (
          <TouchableOpacity
            onPress={handleRestore}
            style={styles.restoreBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.restoreBtnText}>Restore Purchases</Text>
          </TouchableOpacity>
        )}

        {/* Legal */}
        {(phase === 'ready' || phase === 'loading_offering') && (
          <Text style={styles.legal}>
            Auto-renews monthly unless cancelled before renewal date.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Navigation
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  dim: {
    color: Colors.textMuted,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBadge: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  proBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
    letterSpacing: 1,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Price
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    minHeight: 28,
  },
  priceText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
  },
  priceNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // Feature comparison
  compareWrap: {
    gap: Spacing.sm,
  },
  compareCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  compareCardPro: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.goldDim,
    ...Shadow.gold,
  },
  cardTier: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  cardProHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  cardTierPro: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.gold,
  },
  cardBadge: {
    backgroundColor: Colors.goldMuted,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardBadgeText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
    letterSpacing: 0.5,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  featureFree: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  featurePro: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  featureProExtra: {
    color: Colors.gold,
    fontWeight: FontWeight.medium,
  },

  // Notices (pending / error / restore note)
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
  noticeTextError: {
    color: Colors.error,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  ctaBtn: {
    ...btnBase,
    backgroundColor: Colors.gold,
    ...Shadow.gold,
  },
  ctaBtnBusy: {
    opacity: 0.7,
  },
  ctaBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  restoreBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  legal: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Success screen
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: Colors.successMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  successBody: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  successBtn: {
    ...btnBase,
    backgroundColor: Colors.gold,
    width: '100%',
    ...Shadow.gold,
  },
});
