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
import { useTranslation } from 'react-i18next';
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
import { track } from '../../src/services/analyticsService';
import type { AnalyticsEventName } from '../../src/services/analyticsService';
import { UpgradeModal } from '../../src/components/upgrade/UpgradeModal';

// ─── Quick action prompts (English — sent to AI) ──────────────────────────────

const QUICK_ACTION_PROMPTS = [
  'Build my daily plan for today',
  'Rebuild my weekly plan',
  'Review my week — what went well and what should I focus on next week',
  'I missed some tasks — help me recover today intelligently',
  'I keep getting distracted — give me an anti-distraction strategy',
  'Which of my goals am I behind on and what should I prioritize?',
  'Give me a monthly review of my progress and goals this month',
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
  const hour = new Date().getHours();
  const energyLabel =
    hour >= 6  && hour < 12 ? 'High energy' :
    hour >= 12 && hour < 17 ? 'Mid energy'  : 'Low energy';
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
    <View style={ctx.strip}>
      <View style={ctx.chip}>
        <Text style={ctx.chipText}>{formatDate(getTodayDate())}</Text>
      </View>
      <View style={[ctx.chip, { borderColor: energyColor + '55' }]}>
        <Text style={[ctx.chipText, { color: energyColor }]}>{energyLabel}</Text>
      </View>
      <View style={ctx.chip}>
        <Text style={ctx.chipText}>
          {goalCount === 0 ? 'No goals' : `${goalCount} goal${goalCount !== 1 ? 's' : ''}`}
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
            <Text style={[ctx.chipText, ctx.chipGold]}>0 credits</Text>
          </TouchableOpacity>
        ) : (
          <View style={[ctx.chip, creditsAccent ? { borderColor: creditsAccent + '55' } : undefined]}>
            <Text style={[ctx.chipText, creditsAccent ? { color: creditsAccent } : undefined]}>
              {creditsLeft} credits
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
  const work = p.items.filter((i) => i.type !== 'break');
  if (!work.length) return null;
  return (
    <View style={plan.container}>
      <Text style={plan.header}>
        {p.type === 'daily' ? 'Daily plan' : 'Weekly plan'}
        {' · '}{work.length} session{work.length !== 1 ? 's' : ''}
      </Text>
      {work.slice(0, 8).map((i) => <InlinePlanItem key={i.id} item={i} />)}
      {work.length > 8 && (
        <Text style={plan.more}>+{work.length - 8} more sessions</Text>
      )}
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
});

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
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
      </View>
    </View>
  );
}

const bubble = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs, marginBottom: Spacing.sm },
  rowUser: { flexDirection: 'row-reverse' },
  avatar:  { width: 28, height: 28, borderRadius: Radius.full, backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim, alignItems: 'center', justifyContent: 'center' },
  wrap:    { maxWidth: '80%', borderRadius: Radius.lg, padding: Spacing.md },
  wrapAI:  { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border, borderBottomStartRadius: 4 },
  wrapUser:{ backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim, borderBottomEndRadius: 4 },
  text:    { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  textUser:{ color: Colors.gold },
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
  if (!isRecovery && driftScore === 0 && mustDoCount === 0) return null;
  return (
    <View style={[ctxCard.wrap, isRecovery && ctxCard.recovery]}>
      <View style={ctxCard.header}>
        <Ionicons
          name={isRecovery ? 'alert-circle' : 'pulse-outline'}
          size={13}
          color={isRecovery ? Colors.error : Colors.gold}
        />
        <Text style={[ctxCard.heading, isRecovery && ctxCard.headingRecovery]}>
          {isRecovery ? 'RECOVERY MODE' : "TODAY'S CONTEXT"}
        </Text>
      </View>
      {recoveryMessage && isRecovery && (
        <Text style={ctxCard.msg}>{recoveryMessage}</Text>
      )}
      <View style={ctxCard.pills}>
        {driftScore > 0 && (
          <View style={ctxCard.pill}>
            <Text style={ctxCard.pillVal}>{driftScore}</Text>
            <Text style={ctxCard.pillLabel}>drift</Text>
          </View>
        )}
        {mustDoCount > 0 && (
          <View style={ctxCard.pill}>
            <Text style={ctxCard.pillVal}>{mustDoCount}</Text>
            <Text style={ctxCard.pillLabel}>must-do</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const ctxCard = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.goldDim, padding: Spacing.md, gap: Spacing.sm,
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

  const chatHistory    = useAppStore((s) => s.chatHistory);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const clearHistory   = useAppStore((s) => s.clearChatHistory);
  const setCurrentPlan = useAppStore((s) => s.setCurrentPlan);
  const session        = useAppStore((s) => s.session);
  const isGuestMode    = useAppStore((s) => s.isGuestMode);
  const goals          = useAppStore((s) => s.goals);
  const dailyDecision  = useAppStore((s) => s.dailyDecision);
  const aiContext      = useAIContext();

  const entitlements = useEntitlements();
  const { refresh: refreshUsage } = entitlements;

  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [upgradeFeat, setUpgradeFeat] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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
    { label: t('coach.quick_actions.build_day'),          prompt: QUICK_ACTION_PROMPTS[0], feature: 'ai_build_day',      event: 'build_day_used',     icon: 'calendar-outline'   },
    { label: t('coach.quick_actions.recover_today'),      prompt: QUICK_ACTION_PROMPTS[3], feature: 'ai_recover_day',    event: 'recover_day_used',   icon: 'refresh-outline'    },
    { label: t('coach.quick_actions.improve_progress'),   prompt: QUICK_ACTION_PROMPTS[5], feature: 'ai_chat',           event: 'ai_chat_used',       icon: 'trending-up-outline' },
    { label: t('coach.quick_actions.reduce_distraction'), prompt: QUICK_ACTION_PROMPTS[4], feature: 'ai_chat',           event: 'ai_chat_used',       icon: 'shield-outline'     },
    { label: t('coach.quick_actions.rebuild_week'),       prompt: QUICK_ACTION_PROMPTS[1], feature: 'ai_weekly_plan',    event: 'ai_chat_used',       icon: 'grid-outline'       },
    { label: t('coach.quick_actions.weekly_review'),      prompt: QUICK_ACTION_PROMPTS[2], feature: 'ai_weekly_plan',    event: 'weekly_review_used', icon: 'bar-chart-outline'  },
    { label: t('coach.quick_actions.monthly_review'),     prompt: QUICK_ACTION_PROMPTS[6], feature: 'ai_monthly_review', event: 'ai_chat_used',       icon: 'calendar'           },
  ];

  const getClient = useCallback((): AIClient => {
    if (session && !isGuestMode) {
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

      track(eventName);
      const userMsg = makeUserMsg(trimmed);
      addChatMessage(userMsg);
      setInput('');
      setLoading(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

      try {
        const client = getClient();
        const reply = await client.chat(trimmed, chatHistory, aiContext);
        addChatMessage(reply);
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
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [loading, chatHistory, aiContext, getClient, addChatMessage, setCurrentPlan, refreshUsage],
  );

  const handleAction = (qa: QA) => {
    if (!entitlements.can(qa.feature)) {
      setUpgradeFeat(qa.label);
      return;
    }
    send(qa.prompt, qa.event);
  };

  const handleVoice = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Voice Input',
      'Voice input lets you plan, reflect, and check in by speaking naturally. This feature is coming in the next update.',
      [{ text: 'Got it', style: 'default' }],
    );
  };

  const handleImageImport = () => {
    router.push('/(tabs)/schedule/import' as any);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.headerIcon}>
              <Ionicons name="sparkles" size={15} color={Colors.gold} />
            </View>
            <View>
              <Text style={s.headerTitle}>LifeOS Intelligence</Text>
              <Text style={s.headerSub}>
                {session && !isGuestMode ? 'AI-powered · context-aware' : 'Local mode'}
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

            {/* Voice + Image premium affordances */}
            <View style={s.inputRow}>
              <TouchableOpacity
                style={s.inputAffordance}
                onPress={handleVoice}
                activeOpacity={0.8}
              >
                <View style={s.affordanceIcon}>
                  <Ionicons name="mic-outline" size={18} color={Colors.gold} />
                </View>
                <Text style={s.affordanceTitle}>Voice Input</Text>
                <Text style={s.affordanceSub}>Speak your plan</Text>
                <View style={s.comingSoonBadge}>
                  <Text style={s.comingSoonText}>SOON</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.inputAffordance}
                onPress={handleImageImport}
                activeOpacity={0.8}
              >
                <View style={s.affordanceIcon}>
                  <Ionicons name="image-outline" size={18} color={Colors.gold} />
                </View>
                <Text style={s.affordanceTitle}>Import Schedule</Text>
                <Text style={s.affordanceSub}>Photo → AI plan</Text>
              </TouchableOpacity>
            </View>

            {/* Quick action cards */}
            <Text style={s.sectionLabel}>QUICK ACTIONS</Text>
            <View style={s.actionCards}>
              {quickActions.slice(0, 4).map((qa) => {
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
              {quickActions.slice(4).map((qa) => {
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
        <View style={s.inputBar}>
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

      </KeyboardAvoidingView>

      <UpgradeModal
        visible={upgradeFeat !== null}
        featureName={upgradeFeat ?? undefined}
        onDismiss={() => setUpgradeFeat(null)}
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
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIcon: {
    width: 32, height: 32, borderRadius: Radius.md,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  headerSub:   { fontSize: FontSize.xs, color: Colors.textMuted },
  clearBtn:    { padding: Spacing.xs },

  // Landing content
  landingContent: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },

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
  actionCards: { gap: Spacing.sm },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  actionCardLocked: { opacity: 0.5 },
  actionIcon: {
    width: 32, height: 32, borderRadius: Radius.md,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  actionIconLocked: { backgroundColor: Colors.surface, borderColor: Colors.border },
  actionLabel: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary },
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

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  micBtn: {
    width: 36, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  input: {
    flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
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
