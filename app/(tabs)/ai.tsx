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
import { useAppStore, useAIContext } from '../../src/store/useAppStore';
import { LocalAIClient } from '../../src/ai/LocalAIClient';
import { RemoteAIClient } from '../../src/ai/RemoteAIClient';
import type { AIClient } from '../../src/ai/AIClient';
import type { ChatMessage, Plan, PlanItem } from '../../src/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/constants/theme';

// ─── Quick-action chips ────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Daily plan', prompt: 'Generate my daily plan for today' },
  { label: 'Weekly plan', prompt: 'Generate a weekly plan' },
  { label: 'My goals', prompt: 'What are my goals?' },
  { label: 'Free time', prompt: 'When am I free today?' },
];

// ─── Plan item card (inline) ──────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  goal: Colors.gold,
  skill: '#6C8EBF',
  break: Colors.textMuted,
  event: '#F472B6',
  free: Colors.textMuted,
};

function InlinePlanItem({ item }: { item: PlanItem }) {
  const color = TYPE_COLOR[item.type] ?? Colors.gold;
  return (
    <View style={[planStyles.row, { borderLeftColor: color }]}>
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
  const workItems = plan.items.filter((i) => i.type !== 'break');
  if (!workItems.length) return null;
  return (
    <View style={planStyles.container}>
      <Text style={planStyles.header}>
        {plan.type === 'daily' ? "Today's Plan" : 'Weekly Schedule'}
        {' · '}{workItems.length} sessions
      </Text>
      {workItems.slice(0, 8).map((item) => (
        <InlinePlanItem key={item.id} item={item} />
      ))}
      {workItems.length > 8 && (
        <Text style={planStyles.more}>+{workItems.length - 8} more → Planner tab</Text>
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
    borderLeftWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  times: { width: 80, flexDirection: 'row', gap: 2, alignItems: 'center' },
  time: { fontSize: FontSize.xs, color: Colors.textSecondary },
  timeSep: { fontSize: FontSize.xs, color: Colors.textMuted },
  info: { flex: 1 },
  title: { fontSize: FontSize.sm, color: Colors.textPrimary },
  type: { fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  more: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    padding: Spacing.sm,
    textAlign: 'center',
  },
});

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
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
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  rowUser: { flexDirection: 'row-reverse' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  bubbleAI: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    borderBottomRightRadius: 4,
  },
  text: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  textUser: {
    color: Colors.gold,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

function makeUserMsg(content: string): ChatMessage {
  return {
    id: Math.random().toString(36).slice(2),
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  };
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm your LifeOS AI. I can generate daily or weekly plans, check your goals, and find your free time — all locally, no internet needed.\n\nTry a quick action below, or type anything.",
  createdAt: new Date().toISOString(),
};

export default function AIScreen() {
  const chatHistory = useAppStore((s) => s.chatHistory);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const clearChatHistory = useAppStore((s) => s.clearChatHistory);
  const setCurrentPlan = useAppStore((s) => s.setCurrentPlan);
  const aiApiKey = useAppStore((s) => s.aiApiKey);
  const aiContext = useAIContext();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Always show welcome + persisted history
  const messages: ChatMessage[] = [WELCOME, ...chatHistory];

  const getClient = useCallback((): AIClient => {
    if (aiApiKey) return new RemoteAIClient(aiApiKey);
    return new LocalAIClient();
  }, [aiApiKey]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg = makeUserMsg(trimmed);
      addChatMessage(userMsg);
      setInput('');
      setLoading(true);

      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

      try {
        const client = getClient();
        const reply = await client.chat(trimmed, chatHistory, aiContext);
        addChatMessage(reply);
        // If the reply contains a plan, store it
        if (reply.plan) {
          setCurrentPlan(reply.plan);
        }
      } catch (err: any) {
        addChatMessage({
          id: Math.random().toString(36).slice(2),
          role: 'assistant',
          content: `Error: ${err?.message ?? 'Something went wrong. Please try again.'}`,
          createdAt: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [loading, chatHistory, aiContext, getClient, addChatMessage, setCurrentPlan],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="sparkles" size={16} color={Colors.gold} />
            </View>
            <View>
              <Text style={styles.headerTitle}>LifeOS AI</Text>
              <Text style={styles.headerSub}>
                {aiApiKey ? 'Claude API · Remote' : 'Local planner · Offline'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={clearChatHistory} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Messages */}
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
                <Text style={styles.typingText}>Thinking…</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Quick actions */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
        >
          {QUICK_ACTIONS.map((qa) => (
            <TouchableOpacity
              key={qa.label}
              onPress={() => send(qa.prompt)}
              style={styles.chip}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Text style={styles.chipText}>{qa.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything about your schedule…"
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  clearBtn: { padding: Spacing.xs },

  messages: { flex: 1 },
  messagesContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
  },

  typingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs, marginBottom: Spacing.sm },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    borderBottomLeftRadius: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  typingText: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic' },

  chips: {
    maxHeight: 44,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  chipsContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
});
