/**
 * coach.tsx — LifeOS Intelligence screen.
 *
 * The AI is not a chat box. It is the operating system's intelligence layer.
 * This screen reflects that: behavioral context is surfaced first,
 * then the most relevant actions, then open conversation.
 *
 * Architecture:
 *   - Landing state  (chatHistory empty): context + curated actions + input
 *   - Chat state     (messages exist):    chat bubbles + input
 *   - Input bar is always present in both modes
 *   - Voice and image are premium features surfaced as first-class affordances
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useDirection } from '../../src/hooks/useDirection';
import { useAppStore, useAIContext } from '../../src/store/useAppStore';
import { LocalAIClient } from '../../src/ai/LocalAIClient';
import { BackendAIClient } from '../../src/ai/BackendAIClient';
import type { AIClient } from '../../src/ai/AIClient';
import type { ChatMessage, PlanItem, Plan } from '../../src/types';
import { generateId, getTodayDate, formatDate } from '../../src/lib/utils';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../src/constants/theme';
import { useEntitlements } from '../../src/services/entitlementService';
import type { PlanFeature } from '../../src/services/entitlementService';
import type { UseMonthlyUsageResult } from '../../src/services/usageService';
import { useAIBalance } from '../../src/services/aiCreditsService';
import { track } from '../../src/services/analyticsService';
import type { AnalyticsEventName } from '../../src/services/analyticsService';
import { UpgradeModal } from '../../src/components/upgrade/UpgradeModal';
import { CreditsCard } from '../../src/components/ui/CreditsCard';
import { CreditCostChip } from '../../src/components/ui/CreditCostChip';
import { CreditWarningBanner } from '../../src/components/ui/CreditWarningBanner';
import { VoiceRecordingModal } from '../../src/components/VoiceRecordingModal';
import type { VoiceResult } from '../../src/components/VoiceRecordingModal';
import { buildVoicePayload } from '../../src/ai/voiceHelpers';
import { getLowCreditState, shouldShowUpgradeNudge } from '../../src/ai/creditUX';
import { canAfford, CREDIT_COSTS } from '../../src/ai/creditRules';
import {
  deriveAIRequestMode,
  selectContextDepth,
  historyDepthForMode,
  shouldUseExternalAI,
  getResponseStyleHint,
  getModeLabelDisplay,
} from '../../src/ai/orchestrationEngine';
import type { AIRequestMode } from '../../src/ai/orchestrationEngine';

// ─── Quick action prompts (English — sent to AI) ──────────────────────────────

const QUICK_ACTION_PROMPTS = [
  'Help me fix my day. I missed some tasks and need to recover intelligently.',
  'I feel stuck and overwhelmed. Help me break things down so I can start.',
  'My schedule is too packed. Help me rebalance and drop what is not essential.',
  'What is the single most important thing I should do right now based on my goals?',
];

// ─── Context strip ────────────────────────────────────────────────────────────

const CREDITS_DANGER = '#F87171';

function ContextStrip({
  goalCount,
  usage,
  onCreditsExhausted,
}: {
  goalCount: number;
  usage: UseMonthlyUsageResult | null;
  onCreditsExhausted?: () => void;
}) {
  const { t } = useTranslation();
  const dir = useDirection();
  const hour = new Date().getHours();
  const energyLabel =
    hour >= 6  && hour < 12 ? t('coach.energy_high') :
    hour >= 12 && hour < 17 ? t('coach.energy_mid')  : t('coach.energy_low');
  const energyColor =
    hour >= 6  && hour < 12 ? '#6C8EBF' :
    hour >= 12 && hour < 17 ? Colors.gold : '#4ADE80';

  const showCredits = !!(usage && !usage.isLoading && !usage.error);
  const creditsLeft    = usage ? Math.max(0, usage.creditsQuota - usage.creditsUsed) : 0;
  const isExhausted    = showCredits && creditsLeft === 0;
  const creditsDanger  = !!(usage && !isExhausted && usage.percentUsed >= 90);
  const creditsWarning = !!(usage && usage.percentUsed >= 70 && usage.percentUsed < 90);
  const creditsAccent  = creditsDanger ? CREDITS_DANGER : creditsWarning ? Colors.gold : null;

  return (
    <View style={[ctx.strip, { flexDirection: dir.rowDir }]}>
      <View style={ctx.chip}>
        <Text style={ctx.chipText}>{formatDate(getTodayDate())}</Text>
      </View>
      <View style={[ctx.chip, { borderColor: energyColor + '55' }]}>
        <Text style={[ctx.chipText, { color: energyColor }]}>{energyLabel}</Text>
      </View>
      <View style={ctx.chip}>
        <Text style={ctx.chipText}>
          {goalCount === 0 ? t('coach.no_goals') : t('coach.goal_count', { count: goalCount })}
        </Text>
      </View>
      {showCredits && (
        isExhausted && !!onCreditsExhausted ? (
          <TouchableOpacity
            onPress={onCreditsExhausted}
            style={[ctx.chip, ctx.chipExhausted]}
            activeOpacity={0.75}
          >
            <Ionicons name="sparkles" size={10} color={Colors.gold} />
            <Text style={[ctx.chipText, ctx.chipGold]}>{t('coach.credits_zero')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[ctx.chip, creditsAccent ? { borderColor: creditsAccent + '55' } : undefined]}>
            <Text style={[ctx.chipText, creditsAccent ? { color: creditsAccent } : undefined]}>
              {t('coach.credits_count', { count: creditsLeft })}
            </Text>
          </View>
        )
      )}
    </View>
  );
}

const ctx = StyleSheet.create({
  strip: {
    flexDirection: 'row', flexWrap: 'nowrap',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  chip: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  chipExhausted: { flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: Colors.goldDim },
  chipText: { fontSize: FontSize.xs, color: Colors.textMuted, letterSpacing: 0.3 },
  chipGold: { color: Colors.gold },
});

// ─── Inline plan card ─────────────────────────────────────────────────────────

const ITEM_COLOR: Record<string, string> = {
  goal:  Colors.gold,
  skill: '#6C8EBF',
  break: Colors.textMuted,
  event: '#F472B6',
  free:  Colors.textMuted,
};

function InlinePlanItem({ item }: { item: PlanItem }) {
  const c = ITEM_COLOR[item.type] ?? Colors.gold;
  return (
    <View style={[plan.row, { borderStartColor: c }]}>
      <View style={plan.times}>
        <Text style={plan.time}>{item.startTime}</Text>
        <Text style={plan.sep}>–</Text>
        <Text style={plan.time}>{item.endTime}</Text>
      </View>
      <View style={plan.info}>
        <Text style={plan.title} numberOfLines={1}>{item.title}</Text>
        <Text style={[plan.type, { color: c }]}>{item.type}</Text>
      </View>
    </View>
  );
}

function InlinePlan({ plan: p }: { plan: Plan }) {
  const { t } = useTranslation();
  const generateControlPlanAction = useAppStore((s) => s.generateControlPlanAction);
  const work = p.items.filter((i) => i.type !== 'break');
  if (!work.length) return null;
  return (
    <View style={plan.container}>
      <Text style={plan.header}>
        {p.type === 'daily' ? t('coach.plan_daily') : t('coach.plan_weekly')}
        {' · '}{t('coach.plan_sessions_label', { count: work.length })}
      </Text>
      {work.slice(0, 8).map((i) => <InlinePlanItem key={i.id} item={i} />)}
      {work.length > 8 && (
        <Text style={plan.more}>{t('coach.plan_more_items', { count: work.length - 8 })}</Text>
      )}
      <TouchableOpacity
        style={plan.applyBtn}
        activeOpacity={0.85}
        onPress={() => {
          generateControlPlanAction(getTodayDate());
          router.push('/(tabs)/home' as any);
        }}
      >
        <Text style={plan.applyBtnText}>{t('home.coach_apply_plan')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const plan = StyleSheet.create({
  container: { marginTop: Spacing.sm, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, overflow: 'hidden' },
  header:    { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, padding: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  row:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderStartWidth: 3, borderBottomWidth: 1, borderBottomColor: Colors.border },
  times:     { width: 80, flexDirection: 'row', gap: 2, alignItems: 'center' },
  time:      { fontSize: FontSize.xs, color: Colors.textSecondary },
  sep:       { fontSize: FontSize.xs, color: Colors.textMuted },
  info:      { flex: 1 },
  title:     { fontSize: FontSize.sm, color: Colors.textPrimary },
  type:      { fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  more:      { fontSize: FontSize.xs, color: Colors.textMuted, padding: Spacing.sm, textAlign: 'center' },
  applyBtn:     { margin: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim, alignItems: 'center' },
  applyBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gold, letterSpacing: 0.3 },
});

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const hasCost = !isUser && msg.creditCost != null && msg.creditCost > 0;
  const costLabel = hasCost
    ? msg.creditCost === 1
      ? '-1 credit'
      : `-${msg.creditCost} credits${msg.requestMode && msg.requestMode !== 'text' ? ` (${msg.requestMode})` : ''}`
    : null;
  return (
    <View style={[bubble.row, isUser && bubble.rowUser]}>
      {!isUser && (
        <View style={bubble.avatar}>
          <Ionicons name="sparkles" size={12} color={Colors.gold} />
        </View>
      )}
      <View style={[bubble.wrap, isUser ? bubble.wrapUser : bubble.wrapAI]}>
        <Text style={[bubble.text, isUser && bubble.textUser]}>{msg.content}</Text>
        {msg.plan && <InlinePlan plan={msg.plan} />}
        {costLabel && (
          <Text style={bubble.costLabel}>{costLabel}</Text>
        )}
      </View>
    </View>
  );
}

const bubble = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs, marginBottom: Spacing.sm },
  rowUser: { flexDirection: 'row-reverse' },
  avatar:  { width: 28, height: 28, borderRadius: Radius.full, backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim, alignItems: 'center', justifyContent: 'center' },
  wrap:    { maxWidth: '80%', borderRadius: Radius.lg, padding: Spacing.md },
  wrapAI:    { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border, borderBottomStartRadius: 4 },
  wrapUser:  { backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim, borderBottomEndRadius: 4 },
  text:      { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  textUser:  { color: Colors.gold },
  costLabel: { fontSize: FontSize.xs - 1, color: Colors.textMuted, marginTop: 4, textAlign: 'right' as const },
});

// ─── Landing — behavioral context card ───────────────────────────────────────

function ContextCard({
  driftScore,
  isRecovery,
  mustDoCount,
  recoveryMessage,
}: {
  driftScore: number;
  isRecovery: boolean;
  mustDoCount: number;
  recoveryMessage?: string;
}) {
  const { t } = useTranslation();
  const dir = useDirection();
  if (!isRecovery && driftScore === 0 && mustDoCount === 0) return null;
  return (
    <View style={[ctxCard.wrap, isRecovery && ctxCard.recovery]}>
      <View style={[ctxCard.header, { flexDirection: dir.rowDir }]}>
        <Ionicons
          name={isRecovery ? 'alert-circle' : 'pulse-outline'}
          size={13}
          color={isRecovery ? Colors.error : Colors.gold}
        />
        <Text style={[ctxCard.heading, isRecovery && ctxCard.headingRecovery]}>
          {isRecovery ? t('coach.context_recovery') : t('coach.context_today')}
        </Text>
      </View>
      {recoveryMessage && isRecovery && (
        <Text style={ctxCard.msg}>{recoveryMessage}</Text>
      )}
      <View style={[ctxCard.pills, { flexDirection: dir.rowDir }]}>
        {driftScore > 0 && (
          <View style={ctxCard.pill}>
            <Text style={ctxCard.pillVal}>{driftScore}</Text>
            <Text style={ctxCard.pillLabel}>{t('coach.context_drift')}</Text>
          </View>
        )}
        {mustDoCount > 0 && (
          <View style={ctxCard.pill}>
            <Text style={ctxCard.pillVal}>{mustDoCount}</Text>
            <Text style={ctxCard.pillLabel}>{t('coach.context_must_do')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const ctxCard = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', padding: Spacing.md, gap: Spacing.sm,
  },
  recovery: { borderColor: Colors.error, backgroundColor: 'rgba(248,113,113,0.06)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  heading: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gold, letterSpacing: 1.5 },
  headingRecovery: { color: Colors.error },
  msg: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
  pills: { flexDirection: 'row', gap: Spacing.sm },
  pill: { backgroundColor: Colors.surface, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  pillVal: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  pillLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUserMsg(content: string): ChatMessage {
  return { id: generateId(), role: 'user', content, createdAt: new Date().toISOString() };
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CoachScreen() {
  const { t } = useTranslation();
  const dir = useDirection();

  const chatHistory    = useAppStore((s) => s.chatHistory);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const clearHistory   = useAppStore((s) => s.clearChatHistory);
  const setCurrentPlan = useAppStore((s) => s.setCurrentPlan);
  const session        = useAppStore((s) => s.session);
  const isGuestMode    = useAppStore((s) => s.isGuestMode);
  const goals          = useAppStore((s) => s.goals);
  const dailyDecision  = useAppStore((s) => s.dailyDecision);
  const dayMode        = useAppStore((s) => s.dayMode);
  const aiContext      = useAIContext();

  const entitlements   = useEntitlements();
  const { refresh: refreshUsage } = entitlements;
  const aiCredits      = useAIBalance();
  const refreshBalance = useAppStore((s) => s.refreshAIBalance);

  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [upgradeFeat, setUpgradeFeat] = useState<string | null>(null);
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [sessionRequestCount, setSessionRequestCount] = useState(0);
  const [lastAIMode, setLastAIMode] = useState<AIRequestMode>('focused_answer');
  const scrollRef = useRef<ScrollView>(null);

  // ── Orchestration helper ──────────────────────────────────────────────────
  const getOrchestration = useCallback((msg: string) => {
    const balance = aiCredits.balance?.currentBalance ?? null;
    const signals = {
      userMessage:      msg,
      driftScore:       aiContext.driftScore ?? 0,
      isInRecoveryMode: aiContext.isInRecoveryMode ?? false,
      missedTasksCount: aiContext.missedTasksCount ?? 0,
      reviewCount:      aiContext.reviewSignals?.reviewCount ?? 0,
      creditBalance:    balance,
      dayMode:          dayMode ?? 'ON_TRACK',
      hasActivePlan:    !!aiContext.currentPlan,
      topRiskCount:     aiContext.predictionSignals?.topRisks?.length ?? 0,
    };
    const mode       = deriveAIRequestMode(signals);
    const depth      = selectContextDepth(mode, balance);
    const histDepth  = historyDepthForMode(depth);
    const useExternal = shouldUseExternalAI(balance, mode, !!(session && !isGuestMode));
    const styleHint  = getResponseStyleHint(mode);
    return { mode, depth, histDepth, useExternal, styleHint };
  }, [aiCredits.balance, aiContext, dayMode, session, isGuestMode]);

  // Derived credit state
  const currentBalance    = aiCredits.balance?.currentBalance ?? null;
  const balanceKnown      = currentBalance !== null;
  const lowState          = balanceKnown ? getLowCreditState(currentBalance!) : 'ok';
  const showWarning       = balanceKnown && lowState !== 'ok' && !warningDismissed && session && !isGuestMode;
  const showNudge         = balanceKnown && shouldShowUpgradeNudge(currentBalance!, sessionRequestCount);

  // Mode: landing when no history, chat otherwise
  const isChat = chatHistory.length > 0;

  const welcomeMsg: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: t('coach.welcome'),
    createdAt: new Date().toISOString(),
  };

  const messages: ChatMessage[] = [welcomeMsg, ...chatHistory];

  // Quick actions with feature gating
  type QA = { label: string; prompt: string; feature: PlanFeature; event: AnalyticsEventName; icon: string };
  const quickActions: QA[] = [
    { label: t('coach.quick_fix_day'), prompt: QUICK_ACTION_PROMPTS[0], feature: 'ai_recover_day', event: 'recover_day_used', icon: 'refresh-outline' },
    { label: t('coach.quick_stuck'), prompt: QUICK_ACTION_PROMPTS[1], feature: 'ai_chat', event: 'ai_chat_used', icon: 'hand-left-outline' },
  ];

  const getClient = useCallback((useExternal: boolean): AIClient => {
    if (useExternal && session && !isGuestMode) {
      return new BackendAIClient(
        process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
        session.access_token,
      );
    }
    return new LocalAIClient();
  }, [session, isGuestMode]);

  const send = useCallback(
    async (text: string, eventName: AnalyticsEventName = 'ai_chat_used') => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      // ── Orchestration decision ────────────────────────────────────────────
      const orch = getOrchestration(trimmed);
      setLastAIMode(orch.mode);

      track(eventName, { ai_mode: orch.mode } as any);

      const userMsg = makeUserMsg(trimmed);
      addChatMessage(userMsg);
      setInput('');
      setLoading(true);
      setSessionRequestCount((c) => c + 1);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

      // Attach orchestration metadata to context before call
      const orchestratedContext = {
        ...aiContext,
        aiMode:            orch.mode,
        responseStyleHint: orch.styleHint,
        contextDepth:      orch.depth,
      };

      // Use depth-limited history slice
      const histSlice = orch.histDepth === 0 ? [] : chatHistory.slice(-orch.histDepth);

      try {
        const client = getClient(orch.useExternal);
        const reply = await client.chat(trimmed, histSlice, orchestratedContext);
        addChatMessage({ ...reply, creditCost: CREDIT_COSTS.text, requestMode: 'text' });
        if (reply.plan) setCurrentPlan(reply.plan);
      } catch (err: any) {
        addChatMessage({
          id: generateId(), role: 'assistant',
          content: `Error: ${err?.message ?? 'Something went wrong. Please try again.'}`,
          createdAt: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
        refreshUsage();
        refreshBalance();
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [loading, chatHistory, aiContext, getClient, getOrchestration, addChatMessage, setCurrentPlan, refreshUsage, refreshBalance],
  );

  const handleAction = (qa: QA) => {
    if (!entitlements.can(qa.feature)) {
      setUpgradeFeat(qa.label);
      return;
    }
    send(qa.prompt, qa.event);
  };

  const handleVoice = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!entitlements.isPro) {
      setUpgradeFeat('Voice Input');
      return;
    }
    if (!session || isGuestMode) {
      Alert.alert('Sign in required', 'Voice AI requires an active session.');
      return;
    }
    track('voice_record_started');
    setVoiceVisible(true);
  }, [entitlements.isPro, session, isGuestMode]);

  const handleVoiceSubmit = useCallback(async (result: VoiceResult) => {
    setVoiceVisible(false);
    track('voice_record_submitted');
    track('ai_voice_used');
    track('ai_request_started', { mode: 'voice' } as any);

    // Build wire-safe history (slim to role + content)
    const wireHistory = chatHistory.map((m) => ({ role: m.role, content: m.content }));
    const payload     = buildVoicePayload(result.base64, result.uri, wireHistory, {
      todayDate: getTodayDate(),
      tracks: [],
      schedule: [],
      frictions: [],
      focusSummary: { weeklyMinsByGoal: {}, totalWeeklyMins: 0 },
    });

    const userMsg: ChatMessage = makeUserMsg('[Voice message — processing…]');
    addChatMessage(userMsg);
    setLoading(true);
    setSessionRequestCount((c) => c + 1);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const endpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/ai-chat`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || data?.error) {
        if (data?.code === 'insufficient_credits') {
          track('ai_insufficient_credits');
          addChatMessage({
            id: generateId(), role: 'assistant',
            content: '_Your AI credits are exhausted. They refill automatically on a 30-day cycle._',
            createdAt: new Date().toISOString(),
          });
        } else {
          track('ai_request_failed', { mode: 'voice' } as any);
          addChatMessage({
            id: generateId(), role: 'assistant',
            content: `_Voice processing failed: ${data?.error ?? 'Unknown error'}_`,
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        track('ai_request_succeeded', { mode: 'voice' } as any);
        addChatMessage({
          id: generateId(), role: 'assistant',
          content: data.content,
          createdAt: data.createdAt ?? new Date().toISOString(),
          creditCost: CREDIT_COSTS.voice,
          requestMode: 'voice',
        });
      }
    } catch (err: any) {
      track('ai_request_failed', { mode: 'voice' } as any);
      addChatMessage({
        id: generateId(), role: 'assistant',
        content: `_Voice error: ${err?.message ?? 'Something went wrong'}_`,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
      refreshUsage();
      refreshBalance();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chatHistory, session, addChatMessage, refreshUsage, refreshBalance]);

  const handleVoiceCancel = useCallback(() => {
    track('voice_record_cancelled');
    setVoiceVisible(false);
  }, []);

  const handleImageImport = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!entitlements.isPro) {
      setUpgradeFeat('Image Analysis');
      return;
    }
    if (!session || isGuestMode) {
      Alert.alert('Sign in required', 'Image analysis requires an active session.');
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to analyze images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.5,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;

      const base64 = result.assets[0].base64;
      track('ai_image_used');
      track('ai_request_started', { mode: 'image' } as any);

      const userMsg: ChatMessage = makeUserMsg('[Image uploaded — analyzing…]');
      addChatMessage(userMsg);
      setLoading(true);
      setSessionRequestCount((c) => c + 1);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

      const endpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/ai-chat`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          request_mode: 'image',
          image_data:   base64,
          message:      'Analyze this image and help me with my schedule or planning.',
          context:      { todayDate: getTodayDate(), tracks: [], schedule: [], frictions: [], focusSummary: { weeklyMinsByGoal: {}, totalWeeklyMins: 0 } },
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || data?.error) {
        if (data?.code === 'insufficient_credits') {
          track('ai_insufficient_credits');
          addChatMessage({ id: generateId(), role: 'assistant', content: '_Your AI credits are exhausted. They refill automatically on a 30-day cycle._', createdAt: new Date().toISOString() });
        } else {
          track('ai_request_failed', { mode: 'image' } as any);
          addChatMessage({ id: generateId(), role: 'assistant', content: `_Image analysis failed: ${data?.error ?? 'Unknown error'}_`, createdAt: new Date().toISOString() });
        }
      } else {
        track('ai_request_succeeded', { mode: 'image' } as any);
        addChatMessage({ id: generateId(), role: 'assistant', content: data.content, createdAt: data.createdAt ?? new Date().toISOString(), creditCost: CREDIT_COSTS.image, requestMode: 'image' });
      }
    } catch (err: any) {
      track('ai_request_failed', { mode: 'image' } as any);
      addChatMessage({ id: generateId(), role: 'assistant', content: `_Image analysis error: ${err?.message ?? 'Something went wrong'}_`, createdAt: new Date().toISOString() });
    } finally {
      setLoading(false);
      refreshUsage();
      refreshBalance();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [entitlements.isPro, session, isGuestMode, addChatMessage, refreshUsage, refreshBalance]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={[s.header, { flexDirection: dir.rowDir }]}>
          <View style={s.headerLeft}>
            <View style={s.headerIcon}>
              <Ionicons name="sparkles" size={15} color={Colors.gold} />
            </View>
            <View>
              <Text style={s.headerTitle}>{t('coach.header_title')}</Text>
              <Text style={s.headerSub}>
                {session && !isGuestMode ? t('coach.header_sub_online') : t('coach.header_sub_offline')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => { clearHistory(); }}
            style={s.clearBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Context strip ────────────────────────────────────────────────── */}
        <ContextStrip
          goalCount={goals.length}
          usage={session && !isGuestMode ? entitlements : null}
          onCreditsExhausted={() => { track('quota_exhausted'); setUpgradeFeat(''); }}
        />

        {/* ── Low-credit warning banner ────────────────────────────────────── */}
        {showWarning && (
          <CreditWarningBanner
            balance={currentBalance!}
            onUpgrade={() => { track('upgrade_cta_opened'); setUpgradeFeat('AI Credits'); setWarningDismissed(true); }}
            onDismiss={() => setWarningDismissed(true)}
          />
        )}

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        {!isChat ? (
          /* ── LANDING MODE ──────────────────────────────────────────────── */
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.landingContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Behavioral context from today's decision engine */}
            {dailyDecision && (
              <ContextCard
                driftScore={dailyDecision.driftScore}
                isRecovery={dailyDecision.isInRecoveryMode}
                mustDoCount={dailyDecision.mustDoItems.length}
                recoveryMessage={dailyDecision.recoveryMessage}
              />
            )}

            {/* Action Buttons */}
            <View style={s.actionCards}>
              {quickActions.map((qa) => {
                const locked = !entitlements.can(qa.feature);
                return (
                  <TouchableOpacity
                    key={qa.label}
                    style={[s.actionCard, locked && s.actionCardLocked]}
                    onPress={() => handleAction(qa)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.actionIcon, locked && s.actionIconLocked]}>
                      <Ionicons
                        name={qa.icon as any}
                        size={14}
                        color={locked ? Colors.textMuted : Colors.gold}
                      />
                    </View>
                    <Text style={[s.actionLabel, locked && s.actionLabelLocked]}>
                      {qa.label}
                    </Text>
                    {locked && (
                      <Ionicons name="lock-closed" size={11} color={Colors.textMuted} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Secondary actions (collapsed row) */}
            <View style={s.chipsRow}>
              {[].map((qa: any) => {
                const locked = !entitlements.can(qa.feature);
                return (
                  <TouchableOpacity
                    key={qa.label}
                    onPress={() => handleAction(qa)}
                    style={[s.chip, locked && s.chipLocked]}
                    activeOpacity={0.7}
                  >
                    {locked && <Ionicons name="lock-closed" size={10} color={Colors.textMuted} />}
                    <Text style={[s.chipText, locked && s.chipTextLocked]}>{qa.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            
            <View style={[s.multimodalRow, { flexDirection: dir.rowDir }]}>
              <TouchableOpacity
                style={[s.affordanceBtn, !entitlements.isPro && s.affordanceBtnLocked]}
                onPress={handleVoice}
                activeOpacity={0.7}
              >
                <View style={[s.affordanceBtnIcon, { backgroundColor: Colors.goldMuted, borderColor: Colors.goldDim }]}>
                  <Ionicons name="mic-outline" size={20} color={Colors.gold} />
                </View>
                <Text style={s.affordanceBtnLabel}>{t('coach.tap_to_speak')}</Text>
                <Text style={s.affordanceBtnSub}>2 credits{!entitlements.isPro ? ' · Pro' : ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.affordanceBtn, !entitlements.isPro && s.affordanceBtnLocked]}
                onPress={handleImageImport}
                activeOpacity={0.7}
              >
                <View style={[s.affordanceBtnIcon, { backgroundColor: Colors.purpleMuted, borderColor: 'rgba(157,78,221,0.25)' }]}>
                  <Ionicons name="image-outline" size={20} color={Colors.purpleLight} />
                </View>
                <Text style={s.affordanceBtnLabel}>Image Analysis</Text>
                <Text style={s.affordanceBtnSub}>Photo · 3 credits{!entitlements.isPro ? ' · Pro' : ''}</Text>
              </TouchableOpacity>
            </View>

            {/* Credits card — shown when authenticated */}
            {session && !isGuestMode && (
              <CreditsCard
                balance={aiCredits.balance}
                isLoading={aiCredits.isLoading}
                onUpgrade={() => { track('upgrade_cta_opened'); setUpgradeFeat('AI Credits'); }}
              />
            )}
          </ScrollView>
        ) : (
          /* ── CHAT MODE ─────────────────────────────────────────────────── */
          <>
            <ScrollView
              ref={scrollRef}
              style={s.scroll}
              contentContainerStyle={s.chatContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {messages.map((msg) => <ChatBubble key={msg.id} msg={msg} />)}
              {loading && (
                <View style={s.typingRow}>
                  <View style={s.typingBubble}>
                    <ActivityIndicator size="small" color={Colors.gold} />
                    <Text style={s.typingText}>{t('coach.thinking')}</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Quick action chips in chat mode */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.chips}
              contentContainerStyle={s.chipsContent}
            >
              {quickActions.map((qa) => {
                const locked = !entitlements.can(qa.feature);
                return (
                  <TouchableOpacity
                    key={qa.label}
                    onPress={() => handleAction(qa)}
                    style={[s.chip, locked && s.chipLocked]}
                    activeOpacity={locked ? 0.5 : 0.7}
                    disabled={!locked && loading}
                  >
                    {locked && <Ionicons name="lock-closed" size={10} color={Colors.textMuted} />}
                    <Text style={[s.chipText, locked && s.chipTextLocked]}>{qa.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* ── Input bar — always visible ────────────────────────────────── */}
        <View style={s.inputBarOuter}>
          {/* Cost preview chip + mode label + nudge row */}
          {session && !isGuestMode && (
            <View style={[s.inputMetaRow, { flexDirection: dir.rowDir }]}>
              <CreditCostChip
                mode="text"
                canAfford={!balanceKnown || canAfford(currentBalance!, 'text')}
              />
              {/* Subtle AI mode indicator */}
              {isChat && (
                <View style={s.modeChip}>
                  <Text style={s.modeChipText}>{getModeLabelDisplay(lastAIMode)}</Text>
                </View>
              )}
              {showNudge && (
                <TouchableOpacity
                  style={s.nudgeBtn}
                  onPress={() => { track('upgrade_cta_opened'); setUpgradeFeat('AI Credits'); }}
                  activeOpacity={0.8}
                >
                  <Text style={s.nudgeBtnText}>Upgrade for more →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={[s.inputBar, { flexDirection: dir.rowDir }]}>
            {/* Voice affordance in input bar */}
            <TouchableOpacity onPress={handleVoice} style={s.micBtn} activeOpacity={0.7}>
              <Ionicons name="mic-outline" size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder={t('coach.placeholder')}
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />

            <TouchableOpacity
              onPress={() => send(input)}
              style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
              disabled={!input.trim() || loading}
              activeOpacity={0.8}
            >
              <Ionicons
                name="arrow-up"
                size={16}
                color={!input.trim() || loading ? Colors.textMuted : Colors.textInverse}
              />
            </TouchableOpacity>
          </View>
        </View>

      </KeyboardAvoidingView>

      <UpgradeModal
        visible={upgradeFeat !== null}
        featureName={upgradeFeat ?? undefined}
        onDismiss={() => setUpgradeFeat(null)}
      />

      <VoiceRecordingModal
        visible={voiceVisible}
        onSubmit={handleVoiceSubmit}
        onCancel={handleVoiceCancel}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.background },
  flex:  { flex: 1 },
  scroll:{ flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIcon: {
    width: 36, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: -0.3 },
  headerSub:   { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  clearBtn:    { width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },

  // Landing content
  landingContent: { padding: Spacing.lg, gap: Spacing.xl, paddingBottom: Spacing.xxl + 24 },

  multimodalRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  affordanceBtn:      { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', padding: Spacing.md, alignItems: 'center', gap: Spacing.xs },
  affordanceBtnIcon:  { width: 48, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 4 },
  affordanceBtnLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center' },
  affordanceBtnSub:   { fontSize: FontSize.xs, color: Colors.textMuted },
  affordanceBtnLocked: { opacity: 0.55 },


  // Input affordances (voice + image)
  inputRow: { flexDirection: 'row', gap: Spacing.sm },
  inputAffordance: {
    flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.goldDim, padding: Spacing.md,
    alignItems: 'center', gap: Spacing.xs,
  },
  affordanceIcon: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  affordanceTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  affordanceSub:   { fontSize: FontSize.xs, color: Colors.textMuted },
  comingSoonBadge: {
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs, paddingVertical: 2,
    marginTop: Spacing.xs,
  },
  comingSoonText: { fontSize: 9, color: Colors.textMuted, letterSpacing: 0.5, fontWeight: FontWeight.semibold },

  // Section label
  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, letterSpacing: 1.5 },

  // Action cards (primary)
  actionCards: { gap: Spacing.md },
  actionCard: { 
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', padding: Spacing.lg,
  },
  actionCardLocked: { opacity: 0.5 },
  actionIcon: { 
    width: 44, height: 44, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  actionIconLocked: { backgroundColor: Colors.surface, borderColor: Colors.border },
  actionLabel: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  actionLabelLocked: { color: Colors.textMuted },

  // Chat content
  chatContent: { padding: Spacing.md, paddingBottom: Spacing.sm },

  // Typing indicator
  typingRow:    { flexDirection: 'row', marginBottom: Spacing.sm },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.sm, paddingHorizontal: Spacing.md },
  typingText:   { fontSize: FontSize.sm, color: Colors.textMuted },

  // Quick action chips (secondary / chat mode)
  chips:        { maxHeight: 44, borderTopWidth: 1, borderTopColor: Colors.border },
  chipsContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.xs, flexDirection: 'row' },
  chipsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.goldDim,
    backgroundColor: Colors.goldMuted,
  },
  chipLocked:     { opacity: 0.4, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipText:       { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.medium },
  chipTextLocked: { color: Colors.textMuted },

  // Input bar wrapper (includes cost chip row)
  inputBarOuter: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  inputMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.xs + 2,
  },
  modeChip: {
    paddingHorizontal: Spacing.xs + 2, paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  modeChipText: {
    fontSize: FontSize.xs - 1, color: Colors.textMuted, letterSpacing: 0.3,
  },
  nudgeBtn: {
    marginStart: 'auto' as any,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    backgroundColor: Colors.goldMuted, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.goldDim,
  },
  nudgeBtnText: {
    fontSize: FontSize.xs - 1, fontWeight: FontWeight.semibold, color: Colors.gold,
  },
  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  micBtn: {
    width: 36, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  input: {
    flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: Spacing.md, paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs,
    color: Colors.textPrimary, fontSize: FontSize.sm,
    maxHeight: 120,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center',
    ...Shadow.gold,
  },
  sendBtnDisabled: { backgroundColor: Colors.surfaceElevated, shadowOpacity: 0, elevation: 0 },
});
