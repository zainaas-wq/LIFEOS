import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';
import { track } from '../services/analyticsService';
import { submitBetaFeedback } from '../services/betaFeedbackService';

// ─── Question types ───────────────────────────────────────────────────────────

type ScoreOption = 1 | 2 | 3 | 4 | 5;
type YNOption = 'yes' | 'somewhat' | 'no';

// ─── BetaFeedbackModal ────────────────────────────────────────────────────────

interface BetaFeedbackModalProps {
  visible:  boolean;
  onClose:  () => void;
}

export function BetaFeedbackModal({ visible, onClose }: BetaFeedbackModalProps) {
  const setBetaFeedbackSubmitted = useAppStore((s) => s.setBetaFeedbackSubmitted);

  const [confused,       setConfused]       = useState('');
  const [impressed,      setImpressed]      = useState('');
  const [missing,        setMissing]        = useState('');
  const [recScore,       setRecScore]       = useState<ScoreOption | null>(null);
  const [personalized,   setPersonalized]   = useState<YNOption | null>(null);
  const [wouldReturn,    setWouldReturn]    = useState<YNOption | null>(null);
  const [submitted,      setSubmitted]      = useState(false);

  const canSubmit = recScore !== null && personalized !== null && wouldReturn !== null;

  const handleSubmit = () => {
    if (!canSubmit) return;

    // Persist permanently in Supabase — fire-and-forget, never blocks the UI
    submitBetaFeedback({
      recommendation_score: recScore!,
      felt_personalized:    personalized!,
      would_return:         wouldReturn!,
      confused:             confused.trim()  || undefined,
      missing:              missing.trim()   || undefined,
      impressed:            impressed.trim() || undefined,
    }).catch(() => {});

    // Analytics event (scalar metrics for dashboards)
    track('beta_feedback_submitted', {
      recommendation_score:   recScore!,
      felt_personalized:      personalized!,
      would_return:           wouldReturn!,
      has_confusion_feedback: confused.trim().length  > 0 ? 1 : 0,
      has_missing_feedback:   missing.trim().length   > 0 ? 1 : 0,
      has_impressed_feedback: impressed.trim().length > 0 ? 1 : 0,
    });

    setBetaFeedbackSubmitted();
    setSubmitted(true);
  };

  const handleClose = () => {
    setConfused(''); setImpressed(''); setMissing('');
    setRecScore(null); setPersonalized(null); setWouldReturn(null);
    setSubmitted(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={s.overlay}>
        <KeyboardAvoidingView
          style={s.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.sheet}>
            {submitted ? (
              <SubmittedState onClose={handleClose} />
            ) : (
              <>
                {/* Header */}
                <View style={s.header}>
                  <View style={s.headerLeft}>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.gold} />
                    <View>
                      <Text style={s.headerTitle}>Quick Feedback</Text>
                      <Text style={s.headerSub}>2 minutes · helps us improve LifeOS</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={handleClose}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  contentContainerStyle={s.body}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* Q1: Recommendation usefulness */}
                  <View style={s.question}>
                    <Text style={s.qLabel}>
                      How useful were the AI recommendations?
                      <Text style={s.required}> *</Text>
                    </Text>
                    <View style={s.scoreRow}>
                      {([1, 2, 3, 4, 5] as ScoreOption[]).map((n) => (
                        <TouchableOpacity
                          key={n}
                          style={[s.scoreBtn, recScore === n && s.scoreBtnActive]}
                          onPress={() => setRecScore(n)}
                          activeOpacity={0.75}
                        >
                          <Text style={[s.scoreBtnText, recScore === n && s.scoreBtnTextActive]}>
                            {n}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={s.scoreLabels}>
                      <Text style={s.scoreLabel}>Not useful</Text>
                      <Text style={s.scoreLabel}>Very useful</Text>
                    </View>
                  </View>

                  {/* Q2: Felt personalized */}
                  <View style={s.question}>
                    <Text style={s.qLabel}>
                      Did LifeOS feel personalized to you?
                      <Text style={s.required}> *</Text>
                    </Text>
                    <YesNoRow value={personalized} onChange={setPersonalized} />
                  </View>

                  {/* Q3: Would return */}
                  <View style={s.question}>
                    <Text style={s.qLabel}>
                      Would you open LifeOS again tomorrow?
                      <Text style={s.required}> *</Text>
                    </Text>
                    <YesNoRow value={wouldReturn} onChange={setWouldReturn} />
                  </View>

                  {/* Q4: What confused you (optional) */}
                  <View style={s.question}>
                    <Text style={s.qLabel}>What confused you? <Text style={s.optional}>(optional)</Text></Text>
                    <TextInput
                      style={s.textInput}
                      value={confused}
                      onChangeText={setConfused}
                      placeholder="Was anything unclear, difficult, or unexpected?"
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                  </View>

                  {/* Q5: What was missing (optional) */}
                  <View style={s.question}>
                    <Text style={s.qLabel}>What did you expect that was missing? <Text style={s.optional}>(optional)</Text></Text>
                    <TextInput
                      style={s.textInput}
                      value={missing}
                      onChangeText={setMissing}
                      placeholder="What were you hoping LifeOS would do?"
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                  </View>

                  {/* Q6: What impressed you (optional) */}
                  <View style={s.question}>
                    <Text style={s.qLabel}>What impressed you most? <Text style={s.optional}>(optional)</Text></Text>
                    <TextInput
                      style={s.textInput}
                      value={impressed}
                      onChangeText={setImpressed}
                      placeholder="What made you think LifeOS was different?"
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                  </View>
                </ScrollView>

                {/* Footer */}
                <View style={s.footer}>
                  <TouchableOpacity style={s.skipBtn} onPress={handleClose} activeOpacity={0.7}>
                    <Text style={s.skipBtnText}>Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
                    onPress={handleSubmit}
                    activeOpacity={canSubmit ? 0.85 : 1}
                  >
                    <Text style={[s.submitBtnText, !canSubmit && s.submitBtnTextDisabled]}>
                      Submit Feedback
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={14}
                      color={canSubmit ? Colors.textInverse : Colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Yes / Somewhat / No row ──────────────────────────────────────────────────

function YesNoRow({
  value,
  onChange,
}: {
  value: YNOption | null;
  onChange: (v: YNOption) => void;
}) {
  const OPTIONS: Array<{ value: YNOption; label: string }> = [
    { value: 'yes',      label: 'Yes'      },
    { value: 'somewhat', label: 'Somewhat' },
    { value: 'no',       label: 'No'       },
  ];
  return (
    <View style={s.ynRow}>
      {OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[s.ynBtn, value === opt.value && s.ynBtnActive]}
          onPress={() => onChange(opt.value)}
          activeOpacity={0.75}
        >
          <Text style={[s.ynBtnText, value === opt.value && s.ynBtnTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Submitted state ──────────────────────────────────────────────────────────

function SubmittedState({ onClose }: { onClose: () => void }) {
  return (
    <View style={s.submittedWrap}>
      <View style={s.submittedIcon}>
        <Ionicons name="checkmark-circle" size={36} color="#4ADE80" />
      </View>
      <Text style={s.submittedTitle}>Thank you</Text>
      <Text style={s.submittedDesc}>
        Your feedback directly shapes LifeOS.{'\n'}
        Every response is read carefully.
      </Text>
      <TouchableOpacity style={s.submitBtn} onPress={onClose} activeOpacity={0.85}>
        <Text style={s.submitBtnText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  kav: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.gold + '33',
    maxHeight: '90%',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },

  body: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xl },

  question: { gap: Spacing.sm },
  qLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  required: { color: Colors.gold },
  optional: { color: Colors.textMuted, fontWeight: FontWeight.regular },

  // Score row (1-5)
  scoreRow: { flexDirection: 'row', gap: Spacing.sm },
  scoreBtn: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceHigh,
  },
  scoreBtnActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  scoreBtnText:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textMuted },
  scoreBtnTextActive: { color: Colors.gold },
  scoreLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  scoreLabel: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Yes / No row
  ynRow: { flexDirection: 'row', gap: Spacing.sm },
  ynBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceHigh,
  },
  ynBtnActive:      { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  ynBtnText:        { fontSize: FontSize.sm, color: Colors.textMuted },
  ynBtnTextActive:  { color: Colors.gold, fontWeight: FontWeight.semibold },

  // Text input
  textInput: {
    backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    minHeight: 80,
  },

  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  skipBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skipBtnText: { fontSize: FontSize.sm, color: Colors.textMuted },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.gold,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  submitBtnDisabled: { backgroundColor: Colors.surfaceHigh },
  submitBtnText:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },
  submitBtnTextDisabled: { color: Colors.textMuted },

  // Submitted state
  submittedWrap: {
    alignItems: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  submittedIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  submittedTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  submittedDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
