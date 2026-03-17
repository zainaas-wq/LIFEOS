/**
 * upgrade.tsx — Premium subscription screen.
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

// ── What LifeOS does — benefit cards ──────────────────────────────────────────

const BENEFITS = [
  {
    icon: 'calendar-outline'   as const,
    title: 'Daily AI planning',
    body: 'Builds a complete schedule around your goals, fixed schedule, and energy — every morning.',
  },
  {
    icon: 'pulse-outline'      as const,
    title: 'Drift detection & recovery',
    body: 'Tracks your behavioral consistency, detects drift before it compounds, and guides you back.',
  },
  {
    icon: 'refresh-outline'    as const,
    title: 'Adaptive rescheduling',
    body: 'When your day breaks down, the system rebuilds it intelligently around what remains.',
  },
  {
    icon: 'flag-outline'       as const,
    title: 'Weekly goal intelligence',
    body: 'Monitors pace toward each goal, flags what\'s at risk, and adjusts targets week by week.',
  },
  {
    icon: 'sparkles-outline'   as const,
    title: 'AI coaching',
    body: 'Ask anything about your day, your goals, or your progress — the AI has full context on your life.',
  },
] as const;

// ── Screen ────────────────────────────────────────────────────────────────────

export default function UpgradeScreen() {
  const router = useRouter();
  const { refresh: refreshUsage } = useMonthlyUsage();
  const profile = useAppStore((s) => s.profile);

  const [phase, setPhase]             = useState<Phase>('loading_offering');
  const [offering, setOffering]       = useState<ProOffering | null>(null);
  const [busyLabel, setBusyLabel]     = useState('Processing…');
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
            <Ionicons name="checkmark" size={32} color={Colors.gold} />
          </View>
          <Text style={styles.successTitle}>LifeOS Pro is active.</Text>
          <Text style={styles.successBody}>
            Your AI planning, daily intelligence, and full coaching access are all on.
            {profile?.name ? `\n\nWelcome, ${profile.name}.` : ''}
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/home' as any)}
            style={styles.successBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Enter LifeOS</Text>
            <Ionicons name="arrow-forward" size={15} color={Colors.textInverse} />
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
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.proBadge}>
            <Ionicons name="sparkles" size={11} color={Colors.gold} />
            <Text style={styles.proBadgeText}>LIFEOS PRO</Text>
          </View>

          <Text style={styles.title}>Your AI life{'\n'}operating system.</Text>

          {/* Price — confident, not apologetic */}
          {phase === 'loading_offering' ? (
            <ActivityIndicator size="small" color={Colors.textMuted} style={{ marginTop: Spacing.sm }} />
          ) : priceLabel ? (
            <View style={styles.priceRow}>
              <Text style={styles.priceAmount}>{priceLabel}</Text>
              <Text style={styles.pricePeriod}>/month</Text>
            </View>
          ) : null}

          {(phase === 'ready' || phase === 'loading_offering') && (
            <Text style={styles.trialLabel}>Start with 7 days free</Text>
          )}
        </View>

        {/* ── Benefits ──────────────────────────────────────────────────── */}
        <Text style={styles.benefitsHeading}>WHAT IT DOES FOR YOU</Text>

        <View style={styles.benefitsList}>
          {BENEFITS.map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name={b.icon} size={15} color={Colors.gold} />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitBody}>{b.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Status notices ────────────────────────────────────────────── */}
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

      {/* ── Bottom CTA bar ────────────────────────────────────────────── */}
      <View style={styles.bottomBar}>
        {phase === 'activation_pending' ? (
          <TouchableOpacity onPress={handleRestore} style={styles.ctaBtn} activeOpacity={0.85}>
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
                  {priceLabel ? 'Start 7-Day Free Trial' : 'Get Pro'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {!isBusy && phase !== 'activation_pending' && (
          <TouchableOpacity onPress={handleRestore} style={styles.restoreBtn} activeOpacity={0.7}>
            <Text style={styles.restoreBtnText}>Restore Purchases</Text>
          </TouchableOpacity>
        )}

        {(phase === 'ready' || phase === 'loading_offering') && (
          <Text style={styles.legal}>
            {priceLabel
              ? `7-day free trial, then ${priceLabel}/month. Auto-renews unless cancelled.`
              : 'Auto-renews monthly unless cancelled before renewal date.'}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  backText: { fontSize: FontSize.md, color: Colors.textSecondary },
  dim:      { color: Colors.textMuted },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.lg },

  // Hero
  hero: { alignItems: 'flex-start', paddingTop: Spacing.md, gap: Spacing.sm },
  proBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.goldMuted,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.goldDim,
  },
  proBadgeText: {
    fontSize: FontSize.xs, fontWeight: FontWeight.bold,
    color: Colors.gold, letterSpacing: 1,
  },
  title: {
    fontSize: FontSize.xxxl, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, lineHeight: 42,
  },
  priceRow:    { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  priceAmount: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.gold },
  pricePeriod: { fontSize: FontSize.md, color: Colors.textMuted },
  trialLabel:  { fontSize: FontSize.sm, color: Colors.textSecondary },

  // Benefits
  benefitsHeading: {
    fontSize: FontSize.xs, fontWeight: FontWeight.semibold,
    color: Colors.textMuted, letterSpacing: 1.5,
  },
  benefitsList: { gap: Spacing.md },
  benefitRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  benefitIcon: {
    width: 34, height: 34, borderRadius: Radius.md,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
  },
  benefitText:  { flex: 1, gap: 3 },
  benefitTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  benefitBody:  { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  // Notices
  noticeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  noticeError:     { borderColor: Colors.errorMuted, backgroundColor: Colors.errorMuted },
  noticeText:      { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  noticeTextError: { color: Colors.error },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, paddingTop: Spacing.sm,
    gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.gold, borderRadius: Radius.md,
    paddingVertical: Spacing.md, ...Shadow.gold,
  },
  ctaBtnBusy: { opacity: 0.7 },
  ctaBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },
  restoreBtn: { alignItems: 'center', paddingVertical: Spacing.xs },
  restoreBtnText: { fontSize: FontSize.sm, color: Colors.textMuted },
  legal: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16 },

  // Success
  successWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.lg, gap: Spacing.md,
  },
  successIconWrap: {
    width: 72, height: 72, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
    ...Shadow.gold,
  },
  successTitle: {
    fontSize: FontSize.xxl, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, textAlign: 'center',
  },
  successBody: {
    fontSize: FontSize.md, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 24,
  },
  successBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.gold, borderRadius: Radius.md,
    paddingVertical: Spacing.md, width: '100%', ...Shadow.gold,
  },
});
