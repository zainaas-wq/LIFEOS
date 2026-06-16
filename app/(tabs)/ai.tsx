import React, { useState, useRef, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppStore, useAIContext } from '../../src/store/useAppStore';
import { LocalAIClient } from '../../src/ai/LocalAIClient';
import { BackendAIClient } from '../../src/ai/BackendAIClient';
import type { AIClient } from '../../src/ai/AIClient';
import { executeAIAction } from '../../src/ai/actionExecutor';
import type { ChatMessage, Plan, PlanItem } from '../../src/types';
import { generateId, getTodayDate, formatDate } from '../../src/lib/utils';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/constants/theme';
import { useEntitlements } from '../../src/services/entitlementService';
import type { PlanFeature } from '../../src/services/entitlementService';
import type { UseMonthlyUsageResult } from '../../src/services/usageService';
import { track } from '../../src/services/analyticsService';
import type { AnalyticsEventName } from '../../src/services/analyticsService';
import { UpgradeModal } from '../../src/components/upgrade/UpgradeModal';
import { BetaFeedbackModal } from '../../src/components/BetaFeedbackModal';

// ─── Quick-action prompts (AI inputs — not UI text, stay as English) ──────────

const QUICK_ACTION_PROMPTS = [
  'Build my daily plan for today',
  'Rebuild my weekly plan',
  'Review my week — what went well and what should I focus on next week',
  'I missed some tasks — help me recover today intelligently',
  'I keep getting distracted — give me an anti-distraction strategy',
  'Which of my goals am I behind on and what should I prioritize?',
  'Give me a monthly review of my progress and goals this month',
];

// ─── Context strip ─────────────────────────────────────────────────────────────

const CREDITS_DANGER_COLOR  = '#F87171';

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
  const hour = new Date().getHours();

  const energyLabel =
    hour >= 6  && hour < 12 ? t('coach.context_energy_high')   :
    hour >= 12 && hour < 17 ? t('coach.context_energy_medium') :
                               t('coach.context_energy_low');

  const energyColor =
    hour >= 6  && hour < 12 ? '#6C8EBF' :
    hour >= 12 && hour < 17 ? Colors.gold :
    '#4ADE80';

  const dateLabel = formatDate(getTodayDate());

  // Credits chip — only shown when loaded without error
  const showCredits = !!(usage && !usage.isLoading && !usage.error);
  const creditsRemaining = usage ? Math.max(0, usage.creditsQuota - usage.creditsUsed) : 0;
  const isExhausted    = showCredits && creditsRemaining === 0;
  const creditsDanger  = !!(usage && !isExhausted && usage.percentUsed >= 90);
  const creditsWarning = !!(usage && usage.percentUsed >= 70 && usage.percentUsed < 90);
  const creditsAccent  = creditsDanger ? CREDITS_DANGER_COLOR : creditsWarning ? Colors.gold : null;

  return (
    <View style={ctxStyles.strip}>
      <View style={ctxStyles.chip}>
        <Text style={ctxStyles.chipText}>{dateLabel}</Text>
      </View>
      <View style={[ctxStyles.chip, { borderColor: energyColor + '55' }]}>
        <Text style={[ctxStyles.chipText, { color: energyColor }]}>{energyLabel}</Text>
      </View>
      <View style={ctxStyles.chip}>
        <Text style={ctxStyles.chipText}>
          {t('coach.goal_count', { count: goalCount })}
        </Text>
      </View>
      {showCredits && (
        isExhausted && !!onCreditsExhausted ? (
          <TouchableOpacity
            onPress={onCreditsExhausted}
            style={[ctxStyles.chip, ctxStyles.chipExhausted]}
            activeOpacity={0.75}
          >
            <Ionicons name="sparkles" size={10} color={Colors.gold} />
            <Text style={[ctxStyles.chipText, ctxStyles.chipTextGold]}>0 credits</Text>
          </TouchableOpacity>
        ) : (
          <View style={[ctxStyles.chip, creditsAccent ? { borderColor: creditsAccent + '55' } : undefined]}>
            <Text style={[ctxStyles.chipText, creditsAccent ? { color: creditsAccent } : undefined]}>
              {creditsRemaining} credits
            </Text>
          </View>
        )
      )}
    </View>
  );
}

const ctxStyles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  chipText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },
  chipExhausted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderColor: Colors.goldDim,
  },
  chipTextGold: { color: Colors.gold },
});

// ─── Plan item card (inline) ──────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  goal:  Colors.gold,
  skill: '#6C8EBF',
  break: Colors.textMuted,
  event: '#F472B6',
  free:  Colors.textMuted,
};

function InlinePlanItem({ item }: { item: PlanItem }) {
  const color = TYPE_COLOR[item.type] ?? Colors.gold;
  return (
    <View style={[planStyles.row, { borderStartColor: color }]}>
      <View style={planStyles.times}>
        <Text style={planStyles.time}>{item.startTime}</Text>
        <Text style={planStyles.timeSep}>–</Text>
        <Text style={planStyles.time}>{item.endTime}</Text>
      </View>
      <View style={planStyles.info}>
        <Text style={planStyles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={[planStyles.type, { color }]}>{item.type}</Text>
      </View>
    </View>
  );
}

function InlinePlan({ plan }: { plan: Plan }) {
  const { t } = useTranslation();
  const workItems = plan.items.filter((i) => i.type !== 'break');
  if (!workItems.length) return null;
  return (
    <View style={planStyles.container}>
      <Text style={planStyles.header}>
        {plan.type === 'daily' ? t('coach.plan_header_daily') : t('coach.plan_header_weekly')}
        {' · '}{t('coach.plan_sessions', { count: workItems.length })}
      </Text>
      {workItems.slice(0, 8).map((item) => (
        <InlinePlanItem key={item.id} item={item} />
      ))}
      {workItems.length > 8 && (
        <Text style={planStyles.more}>
          {t('coach.plan_more', { count: workItems.length - 8 })}
        </Text>
      )}
    </View>
  );
}

const planStyles = StyleSheet.create({
  container: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  header: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderStartWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  times: { width: 80, flexDirection: 'row', gap: 2, alignItems: 'center' },
  time:   { fontSize: FontSize.xs, color: Colors.textSecondary },
  timeSep:{ fontSize: FontSize.xs, color: Colors.textMuted },
  info:   { flex: 1 },
  title:  { fontSize: FontSize.sm, color: Colors.textPrimary },
  type:   { fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  more: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    padding: Spacing.sm,
    textAlign: 'center',
  },
});

// ─── Action confirmation chip ─────────────────────────────────────────────────

const ACTION_ICON: Record<string, string> = {
  create_memory:       'bookmark-outline',
  update_goal:         'flag-outline',
  complete_task:       'checkmark-circle-outline',
  create_reminder:     'alarm-outline',
  create_focus_session:'timer-outline',
};

const ACTION_LABEL: Record<string, string> = {
  create_memory:       'Memory saved',
  update_goal:         'Goal updated',
  complete_task:       'Task completed',
  create_reminder:     'Reminder set',
  create_focus_session:'Session logged',
};

function ActionChip({ type, status, message }: { type: string; status: string; message?: string }) {
  const icon  = ACTION_ICON[type] ?? 'flash-outline';
  const label = status === 'executed'
    ? (message ?? ACTION_LABEL[type] ?? 'Done')
    : status === 'failed'
      ? (message ?? 'Action failed')
      : 'Processing…';
  const color = status === 'executed' ? '#4ADE80' : status === 'failed' ? '#F87171' : Colors.gold;

  return (
    <View style={[actionStyles.chip, { borderColor: color + '55' }]}>
      <Ionicons name={icon as any} size={11} color={color} />
      <Text style={[actionStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

const actionStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: Spacing.xs, alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1,
    backgroundColor: Colors.surfaceHigh,
  },
  label: { fontSize: FontSize.xs, letterSpacing: 0.2 },
});

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const isWelcome = msg.id === 'welcome';

  const trackRecommendationShown    = useAppStore((s) => s.trackRecommendationShown);
  const trackRecommendationAccepted = useAppStore((s) => s.trackRecommendationAccepted);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (!isUser && !isWelcome) {
      trackRecommendationShown();
      track('recommendation_shown');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVote = (v: 'up' | 'down') => {
    if (vote !== null) return;
    setVote(v);
    if (v === 'up') {
      trackRecommendationAccepted();
      track('recommendation_accepted');
    } else {
      track('recommendation_dismissed');
    }
  };

  return (
    <View style={[bubbleStyles.row, isUser && bubbleStyles.rowUser]}>
      {!isUser && (
        <View style={bubbleStyles.avatar}>
          <Ionicons name="sparkles" size={12} color={Colors.gold} />
        </View>
      )}
      <View style={[bubbleStyles.bubble, isUser ? bubbleStyles.bubbleUser : bubbleStyles.bubbleAI]}>
        <Text style={[bubbleStyles.text, isUser && bubbleStyles.textUser]}>
          {msg.content}
        </Text>
        {msg.plan && <InlinePlan plan={msg.plan} />}
        {msg.action && (
          <ActionChip
            type={msg.action.type}
            status={msg.action.status}
            message={msg.action.message}
          />
        )}
        {!isUser && !isWelcome && (
          <View style={bubbleStyles.voteRow}>
            <TouchableOpacity
              onPress={() => handleVote('up')}
              style={[bubbleStyles.voteBtn, vote === 'up' && bubbleStyles.voteBtnUp]}
              disabled={vote !== null}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name={vote === 'up' ? 'thumbs-up' : 'thumbs-up-outline'}
                size={12}
                color={vote === 'up' ? '#4ADE80' : Colors.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleVote('down')}
              style={[bubbleStyles.voteBtn, vote === 'down' && bubbleStyles.voteBtnDown]}
              disabled={vote !== null}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name={vote === 'down' ? 'thumbs-down' : 'thumbs-down-outline'}
                size={12}
                color={vote === 'down' ? '#F87171' : Colors.textMuted}
              />
            </TouchableOpacity>
            {vote && (
              <Text style={bubbleStyles.voteThanks}>
                {vote === 'up' ? 'Helpful' : 'Not helpful'}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs, marginBottom: Spacing.sm },
  rowUser: { flexDirection: 'row-reverse' },
  avatar: {
    width: 28, height: 28, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  bubble:     { maxWidth: '80%', borderRadius: Radius.lg, padding: Spacing.md },
  bubbleAI:   { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border, borderBottomStartRadius: 4 },
  bubbleUser: { backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim, borderBottomEndRadius: 4 },
  text:     { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  textUser: { color: Colors.gold },

  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs + 2,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  voteBtn: {
    padding: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  voteBtnUp:    { borderColor: '#4ADE8044' },
  voteBtnDown:  { borderColor: '#F8717144' },
  voteThanks: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginLeft: Spacing.xs,
    fontStyle: 'italic',
  },
});

// ─── AI Context Summary (shown in empty chat so users see what AI knows) ──────

function AIContextSummary() {
  const [open, setOpen]    = useState(false);
  const goals              = useAppStore((s) => s.goals);
  const localMemories      = useAppStore((s) => s.localMemories);
  const courses            = useAppStore((s) => s.courses);
  const academicRisks      = useAppStore((s) => s.academicRisks);
  const projects           = useAppStore((s) => s.projects);
  const projectIntelligence = useAppStore((s) => s.projectIntelligence);
  const goalIntelligence   = useAppStore((s) => s.goalIntelligence);

  const criticalAcademic   = academicRisks.filter((r) => r.riskLevel === 'critical').length;
  const atRiskGoals        = Object.values(goalIntelligence).filter((g) => g.riskLevel === 'critical' || g.riskLevel === 'at-risk').length;
  const unhealthyProjects  = Object.values(projectIntelligence).filter((p) => p.healthScore < 60).length;

  const items: Array<{ icon: keyof typeof Ionicons.glyphMap; color: string; label: string; value: string }> = [
    {
      icon: 'library-outline', color: '#818CF8',
      label: 'Memories loaded', value: `${Math.min(localMemories.length, 30)} of ${localMemories.length}`,
    },
    {
      icon: 'flag-outline', color: Colors.gold,
      label: 'Goals tracked',
      value: atRiskGoals > 0 ? `${goals.length} (${atRiskGoals} at risk)` : String(goals.length),
    },
    ...(courses.length > 0 ? [{
      icon: 'school-outline' as keyof typeof Ionicons.glyphMap, color: '#6C8EBF',
      label: 'Academic context',
      value: criticalAcademic > 0 ? `${courses.length} courses · ${criticalAcademic} critical` : `${courses.length} courses`,
    }] : []),
    ...(projects.length > 0 ? [{
      icon: 'git-branch-outline' as keyof typeof Ionicons.glyphMap, color: '#34D399',
      label: 'Projects tracked',
      value: unhealthyProjects > 0 ? `${projects.length} (${unhealthyProjects} at risk)` : String(projects.length),
    }] : []),
  ];

  return (
    <View style={ctx.card}>
      <TouchableOpacity
        style={ctx.header}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.75}
      >
        <Ionicons name="sparkles" size={13} color={Colors.gold} />
        <Text style={ctx.headerText}>What your AI Coach knows right now</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={Colors.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={ctx.body}>
          {items.map((item, i) => (
            <View key={i} style={ctx.item}>
              <Ionicons name={item.icon} size={13} color={item.color} />
              <Text style={ctx.itemLabel}>{item.label}</Text>
              <Text style={[ctx.itemValue, { color: item.color }]}>{item.value}</Text>
            </View>
          ))}
          <Text style={ctx.hint}>
            The AI uses this context to personalise every response — no generic advice.
          </Text>
        </View>
      )}
    </View>
  );
}

const ctx = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gold + '33',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.md,
  },
  headerText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  itemLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  itemValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 17,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.xs,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

function makeUserMsg(content: string): ChatMessage {
  return {
    id: generateId(),
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  };
}

export default function AIScreen() {
  const { t } = useTranslation();

  const chatHistory    = useAppStore((s) => s.chatHistory);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const clearChatHistory = useAppStore((s) => s.clearChatHistory);
  const setCurrentPlan = useAppStore((s) => s.setCurrentPlan);
  const session        = useAppStore((s) => s.session);
  const isGuestMode    = useAppStore((s) => s.isGuestMode);
  const goals          = useAppStore((s) => s.goals);
  const aiContext      = useAIContext();
  const pendingCoachMessage    = useAppStore((s) => s.pendingCoachMessage);
  const setPendingCoachMessage = useAppStore((s) => s.setPendingCoachMessage);

  const entitlements = useEntitlements();
  const { refresh: refreshUsage } = entitlements;

  const betaFeedbackSubmitted = useAppStore((s) => s.betaStats.feedbackSubmitted);

  const [input, setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [upgradeFeatName, setUpgradeFeatName] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Trigger feedback modal once after the first real AI response
  useEffect(() => {
    if (!betaFeedbackSubmitted && chatHistory.some((m) => m.role === 'assistant')) {
      const timer = setTimeout(() => setShowFeedback(true), 1800);
      return () => clearTimeout(timer);
    }
  }, [chatHistory, betaFeedbackSubmitted]);

  // Welcome message uses t() — built inside component so translation is available
  const welcomeMsg: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: t('coach.welcome'),
    createdAt: new Date().toISOString(),
  };

  // Quick action labels from i18n; prompts stay as English (sent to AI, not displayed).
  // feature maps to PlanFeature for entitlement checks — Pro-only actions are locked for Free users.
  const quickActions: Array<{ label: string; prompt: string; feature: PlanFeature; analyticsEvent: AnalyticsEventName }> = [
    { label: t('coach.quick_actions.build_day'),          prompt: QUICK_ACTION_PROMPTS[0], feature: 'ai_build_day',      analyticsEvent: 'build_day_used'      },
    { label: t('coach.quick_actions.rebuild_week'),       prompt: QUICK_ACTION_PROMPTS[1], feature: 'ai_weekly_plan',    analyticsEvent: 'ai_chat_used'        },
    { label: t('coach.quick_actions.weekly_review'),      prompt: QUICK_ACTION_PROMPTS[2], feature: 'ai_weekly_plan',    analyticsEvent: 'weekly_review_used'  },
    { label: t('coach.quick_actions.recover_today'),      prompt: QUICK_ACTION_PROMPTS[3], feature: 'ai_recover_day',    analyticsEvent: 'recover_day_used'    },
    { label: t('coach.quick_actions.reduce_distraction'), prompt: QUICK_ACTION_PROMPTS[4], feature: 'ai_chat',           analyticsEvent: 'ai_chat_used'        },
    { label: t('coach.quick_actions.improve_progress'),   prompt: QUICK_ACTION_PROMPTS[5], feature: 'ai_chat',           analyticsEvent: 'ai_chat_used'        },
    { label: t('coach.quick_actions.monthly_review'),     prompt: QUICK_ACTION_PROMPTS[6], feature: 'ai_monthly_review', analyticsEvent: 'ai_chat_used'        },
  ];

  // Auto-fire pending message from Study screen (or any other screen)
  useEffect(() => {
    if (pendingCoachMessage) {
      setPendingCoachMessage(null);
      send(pendingCoachMessage);
    }
  }, []); // intentionally fires once on mount

  // Always show welcome + persisted history
  const messages: ChatMessage[] = [welcomeMsg, ...chatHistory];

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
    async (text: string, analyticsEvent: AnalyticsEventName = 'ai_chat_used') => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      track(analyticsEvent);

      const userMsg = makeUserMsg(trimmed);
      addChatMessage(userMsg);
      setInput('');
      setLoading(true);

      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

      try {
        const client = getClient();
        const rawReply = await client.chat(trimmed, chatHistory, aiContext);

        // Sprint 4: auto-execute any action embedded in the response
        let reply = rawReply;
        if (rawReply.action && rawReply.action.status === 'pending') {
          const result = executeAIAction(rawReply.action);
          reply = {
            ...rawReply,
            action: {
              ...rawReply.action,
              status:  result.success ? 'executed' : 'failed',
              message: result.message,
            },
          };
        }

        addChatMessage(reply);
        if (reply.plan) setCurrentPlan(reply.plan);
      } catch (err: any) {
        addChatMessage({
          id: generateId(),
          role: 'assistant',
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="sparkles" size={16} color={Colors.gold} />
            </View>
            <View>
              <Text style={styles.headerTitle}>{t('coach.title')}</Text>
              <Text style={styles.headerSub}>
                {session && !isGuestMode ? t('coach.mode_remote') : t('coach.mode_local')}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={clearChatHistory} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Context strip ──────────────────────────────────────────────── */}
        <ContextStrip
          goalCount={goals.length}
          usage={session && !isGuestMode ? entitlements : null}
          onCreditsExhausted={() => { track('quota_exhausted'); setUpgradeFeatName(''); }}
        />

        {/* ── Messages ───────────────────────────────────────────────────── */}
        {chatHistory.length === 0 && <AIContextSummary />}

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((msg) => (
            <ChatBubble key={msg.id} msg={msg} />
          ))}
          {loading && (
            <View style={styles.typingRow}>
              <View style={styles.typingBubble}>
                <ActivityIndicator size="small" color={Colors.gold} />
                <Text style={styles.typingText}>{t('coach.thinking')}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── Quick actions ──────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
        >
          {quickActions.map((qa) => {
            const locked = !entitlements.can(qa.feature);
            return (
              <TouchableOpacity
                key={qa.label}
                onPress={() => {
                  if (locked) {
                    setUpgradeFeatName(qa.label);
                    return;
                  }
                  send(qa.prompt, qa.analyticsEvent);
                }}
                style={[styles.chip, locked && styles.chipLocked]}
                activeOpacity={locked ? 0.5 : 0.7}
                disabled={!locked && loading}
              >
                {locked && (
                  <Ionicons name="lock-closed" size={10} color={Colors.textMuted} />
                )}
                <Text style={[styles.chipText, locked && styles.chipTextLocked]}>
                  {qa.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Input bar ──────────────────────────────────────────────────── */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={t('coach.placeholder')}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            onSubmitEditing={() => send(input)}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-up" size={18} color={Colors.textInverse} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <UpgradeModal
        visible={upgradeFeatName !== null}
        featureName={upgradeFeatName ?? undefined}
        onDismiss={() => setUpgradeFeatName(null)}
      />

      <BetaFeedbackModal
        visible={showFeedback}
        onClose={() => setShowFeedback(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIcon: {
    width: 32, height: 32, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  headerSub:   { fontSize: FontSize.xs, color: Colors.textMuted },
  clearBtn:    { padding: Spacing.xs },

  messages:        { flex: 1 },
  messagesContent: { padding: Spacing.md, paddingBottom: Spacing.sm },

  typingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs, marginBottom: Spacing.sm },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, borderBottomStartRadius: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  typingText: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic' },

  chips:        { maxHeight: 44, borderTopWidth: 1, borderTopColor: Colors.border },
  chipsContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, gap: Spacing.xs, flexDirection: 'row', alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipLocked:     { opacity: 0.55 },
  chipText:       { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  chipTextLocked: { color: Colors.textMuted },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    gap: Spacing.sm, padding: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.sm, color: Colors.textPrimary,
  },
  sendBtn:         { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.35 },
});
