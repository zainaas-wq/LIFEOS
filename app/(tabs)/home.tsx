import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { AlignmentRing } from '../../src/components/AlignmentRing';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { computeProgressScore } from '../../src/ai/progressEngine';
import { getTodayDate, getGreeting, formatDate } from '../../src/lib/utils';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';

export default function HomeScreen() {
  const profile       = useAppStore((s) => s.profile);
  const rules         = useAppStore((s) => s.rules);
  const activeFocus   = useAppStore((s) => s.activeFocus);
  const focusSessions = useAppStore((s) => s.focusSessions);
  const controlPlan   = useAppStore((s) => s.controlPlan);
  const saveReflection = useAppStore((s) => s.saveReflection);
  const loadSeedData  = useAppStore((s) => s.loadSeedData);
  const seedLoaded    = useAppStore((s) => s.seedLoaded);
  const logDistraction = useAppStore((s) => s.logDistraction);
  const distractionLogs = useAppStore((s) => s.distractionLogs);
  const todayReflection = useAppStore((s) =>
    s.reflections?.find((r) => r.date === getTodayDate()) ?? null
  );

  useEffect(() => {
    if (__DEV__ && !seedLoaded && !profile) loadSeedData();
  }, []);

  const today = getTodayDate();

  const [reflectionText, setReflectionText]   = useState(todayReflection?.text ?? '');
  const [reflectionSaved, setReflectionSaved] = useState(!!todayReflection);

  const planItems = useMemo(
    () => (controlPlan?.plan.items ?? []).filter((i) => i.type !== 'break' && i.type !== 'event'),
    [controlPlan],
  );

  const todayDistractions = distractionLogs.filter((d) => d.timestamp.startsWith(today)).length;

  const alignmentResult = useMemo(
    () =>
      computeProgressScore({
        planItems,
        rules,
        criticalActionCompleted:
          controlPlan?.plan.items.some((i) => !!i.isCritical && i.completed) ?? false,
        hasReflection: !!todayReflection || reflectionSaved,
        distractionCount: todayDistractions,
        seriousnessScore: profile?.seriousnessScore ?? 7,
      }),
    [planItems, rules, controlPlan, todayReflection, reflectionSaved, todayDistractions, profile],
  );

  const handleSaveReflection = () => {
    if (reflectionText.trim()) {
      saveReflection(today, reflectionText.trim());
      setReflectionSaved(true);
    }
  };

  const todaySessionCount = focusSessions.filter((s) => s.start.startsWith(today)).length;
  const todayFocusMin = focusSessions
    .filter((s) => s.start.startsWith(today))
    .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);

  const greetingName = profile?.name ? `, ${profile.name}` : '';
  const greetingText = `${getGreeting()}${greetingName}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.greeting}>{greetingText}</Text>
            <Text style={styles.date}>{formatDate(today)}</Text>
          </View>

          {/* ── Alignment Ring ─────────────────────────────────────────────── */}
          <View style={styles.ringWrap}>
            <AlignmentRing result={alignmentResult} size={180} />
            <View style={styles.breakdown}>
              <ScorePill label="Tasks"    value={alignmentResult.taskScore}       max={40} />
              <ScorePill label="Rules"    value={alignmentResult.ruleScore}       max={30} />
              <ScorePill label="Critical" value={alignmentResult.criticalScore}   max={20} />
              <ScorePill label="Reflect"  value={alignmentResult.reflectionScore} max={10} />
            </View>
          </View>

          {/* ── Focus stats ────────────────────────────────────────────────── */}
          {(todaySessionCount > 0 || activeFocus) && (
            <Card gold style={styles.focusCard}>
              <View style={styles.focusRow}>
                <Ionicons name="flash" size={16} color={Colors.gold} />
                <Text style={styles.focusLabel}>
                  {activeFocus
                    ? `Focusing · ${activeFocus.goalTitle}`
                    : `${todaySessionCount} session${todaySessionCount !== 1 ? 's' : ''} · ${todayFocusMin} min focused`}
                </Text>
              </View>
            </Card>
          )}

          {/* ── Distraction log ────────────────────────────────────────────── */}
          <TouchableOpacity
            onPress={() => logDistraction()}
            style={styles.distractionBtn}
            activeOpacity={0.75}
          >
            <Ionicons name="warning-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.distractionBtnText}>
              {todayDistractions > 0
                ? `${todayDistractions} distraction${todayDistractions > 1 ? 's' : ''} today — tap to log`
                : 'Got distracted? Tap to log it'}
            </Text>
          </TouchableOpacity>

          {/* ── Critical Action / Today's Focus ────────────────────────────── */}
          {(() => {
            const criticalItem = controlPlan?.plan.items.find((i) => !!i.isCritical);
            if (criticalItem) {
              return (
                <Card gold style={styles.section}>
                  <View style={styles.criticalHeader}>
                    <Ionicons name="flash" size={14} color={Colors.gold} />
                    <Text style={styles.criticalLabel}>Today's Focus</Text>
                  </View>
                  <Text style={styles.criticalAction}>{criticalItem.title}</Text>
                </Card>
              );
            }
            return (
              <Card style={styles.section}>
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyHint}>No plan generated yet.</Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/plan' as any)}>
                    <Text style={styles.emptyLink}>Go to Plan →</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })()}

          {/* ── Ask Coach shortcut ─────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.coachPrompt}
            onPress={() => router.push('/(tabs)/coach' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.coachIcon}>
              <Ionicons name="sparkles" size={14} color={Colors.gold} />
            </View>
            <Text style={styles.coachText}>Ask your Coach…</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* ── Daily Reflection ───────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Daily Reflection</Text>
            <Card elevated>
              <TextInput
                value={reflectionText}
                onChangeText={(t) => { setReflectionText(t); setReflectionSaved(false); }}
                placeholder="How did today go? What will you improve tomorrow?"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
                style={styles.reflectionInput}
                editable={!reflectionSaved}
              />
              {!reflectionSaved && reflectionText.trim().length > 0 && (
                <Button
                  label="Save Reflection"
                  onPress={handleSaveReflection}
                  variant="ghost"
                  size="sm"
                  style={styles.reflectionBtn}
                />
              )}
              {reflectionSaved && (
                <View style={styles.reflectionSavedRow}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                  <Text style={styles.reflectionSavedText}>Saved</Text>
                  <TouchableOpacity onPress={() => setReflectionSaved(false)}>
                    <Text style={styles.reflectionEdit}>Edit</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ScorePill({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <View style={pill.wrap}>
      <Text style={pill.value}>{value}</Text>
      <Text style={pill.max}>/{max}</Text>
      <Text style={pill.label}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  wrap:  { alignItems: 'center', gap: 2 },
  value: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  max:   { fontSize: FontSize.xs, color: Colors.textMuted },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
});

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  flex:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },

  header:   { gap: 2 },
  greeting: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  date:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },

  ringWrap:  { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.lg },
  breakdown: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingHorizontal: Spacing.md },

  focusCard:  { gap: 0 },
  focusRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  focusLabel: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium, flex: 1 },

  distractionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.xs + 2,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  distractionBtnText: { fontSize: FontSize.xs, color: Colors.textMuted },

  section:        { gap: Spacing.xs },
  sectionTitle:   { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  criticalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  criticalLabel:  { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  criticalAction: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 28 },
  emptyRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyHint:      { fontSize: FontSize.sm, color: Colors.textMuted },
  emptyLink:      { fontSize: FontSize.sm, color: Colors.gold },

  coachPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.goldDim, padding: Spacing.md,
  },
  coachIcon: {
    width: 28, height: 28, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center',
  },
  coachText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary },

  reflectionInput:    { color: Colors.textPrimary, fontSize: FontSize.md, lineHeight: 24, minHeight: 90, textAlignVertical: 'top' },
  reflectionBtn:      { alignSelf: 'flex-end', marginTop: Spacing.sm },
  reflectionSavedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
  reflectionSavedText:{ fontSize: FontSize.sm, color: Colors.success, flex: 1 },
  reflectionEdit:     { fontSize: FontSize.sm, color: Colors.gold },
});
