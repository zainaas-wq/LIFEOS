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

  const roles = (profile as any)?.roles && (profile as any).roles.length > 0 
    ? (profile as any).roles.join(' + ') : 'student + worker';
  const headline = `Built for your life as a [${roles}].`;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.proBadge}>
            <Ionicons name="sparkles" size={14} color={Colors.gold} />
            <Text style={styles.proBadgeText}>PREMIUM INTELLIGENCE</Text>
          </View>
          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.subtitle}>
            A complete behavioral operating system that completely adapts to your chaotic life.
          </Text>
        </View>

        <View style={styles.valueCards}>
          <View style={styles.valueCard}>
             <Ionicons name="infinite-outline" size={24} color={Colors.purpleLight} style={styles.vIcon} />
             <View style={styles.vBody}>
                <Text style={styles.vTitle}>Stay consistent even when life is chaotic</Text>
                <Text style={styles.vSub}>The system adapts automatically when your day breaks down.</Text>
             </View>
          </View>
          <View style={styles.valueCard}>
             <Ionicons name="refresh-outline" size={24} color={Colors.warning} style={styles.vIcon} />
             <View style={styles.vBody}>
                <Text style={styles.vTitle}>Recover instantly when you fall behind</Text>
                <Text style={styles.vSub}>Smart recovery algorithms get you back on track without guilt.</Text>
             </View>
          </View>
          <View style={styles.valueCard}>
             <Ionicons name="compass-outline" size={24} color={Colors.gold} style={styles.vIcon} />
             <View style={styles.vBody}>
                <Text style={styles.vTitle}>Know exactly what to do every day</Text>
                <Text style={styles.vSub}>Eliminate decision fatigue with AI-driven priority planning.</Text>
             </View>
          </View>
          <View style={styles.valueCard}>
             <Ionicons name="layers-outline" size={24} color={Colors.success} style={styles.vIcon} />
             <View style={styles.vBody}>
                <Text style={styles.vTitle}>Balance all roles without burnout</Text>
                <Text style={styles.vSub}>Protect your energy while making progress across every goal.</Text>
             </View>
          </View>
        </View>

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

      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={phase === 'error' ? handleTryAgain : handleBuy}
          style={[styles.ctaBtn, isBusy && styles.ctaBtnBusy]}
          disabled={isBusy}
          activeOpacity={0.85}
        >
          {isBusy ? (
             <ActivityIndicator size="small" color={Colors.textInverse} />
          ) : phase === 'error' ? (
             <Text style={styles.ctaBtnText}>Try Again</Text>
          ) : (
             <Text style={styles.ctaBtnText}>Start 7-Day Free Trial</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => router.back()} style={styles.maybeBtn} activeOpacity={0.7} disabled={isBusy}>
           <Text style={styles.maybeBtnText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xxl, gap: Spacing.xl },

  hero: { alignItems: 'flex-start', gap: Spacing.sm },
  proBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: 'rgba(201, 168, 76, 0.1)',
    borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.goldDim,
  },
  proBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.gold, letterSpacing: 2 },
  title: { fontSize: FontSize.xxxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 40 },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 24, marginTop: Spacing.xs },

  valueCards: { gap: Spacing.md, marginTop: Spacing.md },
  valueCard: { 
    flexDirection: 'row', gap: Spacing.md, 
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl, 
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md 
  },
  vIcon: { marginTop: 4 },
  vBody: { flex: 1, gap: 4 },
  vTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, lineHeight: 22 },
  vSub:   { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },

  bottomBar: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxl + Spacing.md, paddingTop: Spacing.md, gap: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background },
  ctaBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.lg, ...Shadow.gold,
  },
  ctaBtnBusy: { opacity: 0.7 },
  ctaBtnText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textInverse, letterSpacing: 0.5 },
  maybeBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  maybeBtnText: { fontSize: FontSize.sm, color: Colors.textMuted },

  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  noticeError: { borderColor: Colors.errorMuted, backgroundColor: Colors.errorMuted },
  noticeText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  noticeTextError: { color: Colors.error },

  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, gap: Spacing.md },
  successIconWrap: { width: 72, height: 72, borderRadius: Radius.full, backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim, alignItems: 'center', justifyContent: 'center', ...Shadow.gold },
  successTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  successBody: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  successBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.gold, borderRadius: Radius.md, paddingVertical: Spacing.md, width: '100%', ...Shadow.gold },
});
