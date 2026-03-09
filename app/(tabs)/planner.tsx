import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { NudgeBanner } from '../../src/components/NudgeBanner';
import { FocusModal } from '../../src/components/FocusModal';
import { PlanBlockCard } from '../../src/components/PlanBlockCard';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { getTodayDate, formatDate } from '../../src/lib/utils';
import { getGoalAllocation } from '../../src/lib/weeklyPlanner';
import { timeToMins } from '../../src/ai/planGenerator';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/constants/theme';
import type { PlanItem, PlanBlock, NudgeItem } from '../../src/types';

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Mode = 'weekly' | 'daily';

const TYPE_COLOR: Record<string, string> = {
  goal:  Colors.gold,
  skill: '#6C8EBF',
  event: '#F472B6',
  break: Colors.textMuted,
  free:  Colors.textMuted,
};

const ENERGY_COLOR: Record<string, string> = {
  high:   '#6C8EBF',
  medium: Colors.gold,
  low:    '#4ADE80',
};

// ─── PlanItem row ─────────────────────────────────────────────────────────────

function PlanItemRow({
  item,
  nowMins,
  showReasons,
  onToggle,
  onStartFocus,
}: {
  item: PlanItem;
  nowMins: number;
  showReasons: boolean;
  onToggle: () => void;
  onStartFocus: () => void;
}) {
  const startMins = timeToMins(item.startTime);
  const endMins   = timeToMins(item.endTime);
  const isActive  = startMins <= nowMins && endMins > nowMins;
  const isPast    = endMins <= nowMins;
  const color     = TYPE_COLOR[item.type] ?? Colors.gold;
  const canFocus  = item.type === 'goal' || item.type === 'skill';

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.75}
      style={[
        styles.itemRow,
        { borderLeftColor: item.isCritical ? Colors.gold : color },
        isActive && styles.itemRowActive,
        !!item.isCritical && styles.itemRowCritical,
        item.completed && styles.itemRowDone,
      ]}
    >
      {/* Completion circle */}
      <TouchableOpacity onPress={onToggle} style={styles.itemCheck} activeOpacity={0.7}>
        <View style={[styles.checkCircle, item.completed && { backgroundColor: color, borderColor: color }]}>
          {item.completed && <Ionicons name="checkmark" size={11} color={Colors.textInverse} />}
        </View>
      </TouchableOpacity>

      {/* Time */}
      <View style={styles.itemTimes}>
        <Text style={[styles.itemTime, isPast && !item.completed && styles.itemTimePast]}>
          {item.startTime}
        </Text>
        <Text style={styles.itemTimeSep}>–</Text>
        <Text style={[styles.itemTime, isPast && !item.completed && styles.itemTimePast]}>
          {item.endTime}
        </Text>
      </View>

      {/* Title + badges */}
      <View style={styles.itemInfo}>
        <View style={styles.itemTitleRow}>
          <Text
            style={[
              styles.itemTitle,
              item.completed && styles.itemTitleDone,
              isPast && !item.completed && styles.itemTitlePast,
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {!!item.isCritical && (
            <View style={styles.criticalChip}>
              <Text style={styles.criticalChipText}>CRITICAL</Text>
            </View>
          )}
          {item.energyRequired && (
            <View style={[styles.energyBadge, { backgroundColor: ENERGY_COLOR[item.energyRequired] + '25' }]}>
              <Text style={[styles.energyBadgeText, { color: ENERGY_COLOR[item.energyRequired] }]}>
                {item.energyRequired.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.itemType, { color }]}>{item.type}</Text>
        {showReasons && !!item.notes && (
          <Text style={styles.itemNotes} numberOfLines={2}>{item.notes}</Text>
        )}
      </View>

      {/* Status / Focus button */}
      {isActive && !item.completed && (
        <View style={styles.itemNowBadge}>
          <Text style={styles.itemNowText}>NOW</Text>
        </View>
      )}
      {canFocus && !item.completed && (
        <TouchableOpacity onPress={onStartFocus} style={styles.focusBtn} activeOpacity={0.75}>
          <Ionicons name="play" size={12} color={Colors.gold} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── Control Daily View ───────────────────────────────────────────────────────

function ControlDailyView() {
  const goals                  = useAppStore((s) => s.goals);
  const controlPlan            = useAppStore((s) => s.controlPlan);
  const activeNudge            = useAppStore((s) => s.activeNudge);
  const generateControlPlanAction = useAppStore((s) => s.generateControlPlanAction);
  const toggleControlPlanItem  = useAppStore((s) => s.toggleControlPlanItem);
  const reschedulePlan         = useAppStore((s) => s.reschedulePlan);
  const setActiveNudge         = useAppStore((s) => s.setActiveNudge);
  const dismissNudge           = useAppStore((s) => s.dismissNudge);
  const snoozeNudge            = useAppStore((s) => s.snoozeNudge);
  const startFocus             = useAppStore((s) => s.startFocus);
  const logDistraction         = useAppStore((s) => s.logDistraction);
  const distractionLogs        = useAppStore((s) => s.distractionLogs);

  const today = getTodayDate();
  const [generating, setGenerating] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [focusItem, setFocusItem] = useState<PlanItem | null>(null);

  // Current time in minutes for "now" detection
  const [nowMins, setNowMins] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  // Nudge + clock ticker (every 60s)
  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      const mins = d.getHours() * 60 + d.getMinutes();
      setNowMins(mins);

      if (!controlPlan) return;
      const nowStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      // Find first pending nudge at current time
      for (const nudge of controlPlan.nudgeSchedule) {
        if (nudge.triggerTime === nowStr) {
          // Check if snoozed
          if (nudge.snoozedUntil && nudge.snoozedUntil > nowStr) continue;
          // Check if the item is already completed
          const item = controlPlan.plan.items.find((i) => i.id === nudge.itemId);
          if (item?.completed) continue;
          setActiveNudge(nudge);
          break;
        }
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [controlPlan]);

  const handleGenerate = useCallback(() => {
    if (!goals.length) {
      Alert.alert('No goals', 'Add goals in the Goals tab first.');
      return;
    }
    setGenerating(true);
    setTimeout(() => {
      generateControlPlanAction(today);
      setGenerating(false);
    }, 500);
  }, [goals.length, today]);

  const handleStartFocus = (item: PlanItem) => {
    const goal = goals.find((g) => g.id === item.goalId);
    startFocus({
      id: Math.random().toString(36).slice(2),
      goalId: item.goalId,
      goalTitle: goal?.title ?? item.title,
      durationMinutes: timeToMins(item.endTime) - timeToMins(item.startTime),
      startedAt: new Date().toISOString(),
    });
  };

  const todayDistractions = distractionLogs.filter((d) =>
    d.timestamp.startsWith(today)
  ).length;

  const items = controlPlan?.plan.items ?? [];
  const nextBestAction = controlPlan?.nextBestAction ?? null;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.dateText}>{formatDate(today)}</Text>

      {/* Nudge banner */}
      {activeNudge && (
        <NudgeBanner
          nudge={activeNudge}
          onDone={() => {
            toggleControlPlanItem(activeNudge.itemId);
            dismissNudge();
          }}
          onSnooze={() => snoozeNudge(10)}
          onSkip={dismissNudge}
        />
      )}

      {/* Next Best Action */}
      {nextBestAction && (
        <Card gold style={styles.nbaCard}>
          <View style={styles.nbaHeader}>
            <Ionicons name="flash" size={13} color={Colors.gold} />
            <Text style={styles.nbaLabel}>Next Best Action</Text>
          </View>
          <Text style={styles.nbaTitle}>{nextBestAction.title}</Text>
          <Text style={styles.nbaMeta}>
            {nextBestAction.startTime} – {nextBestAction.endTime}
          </Text>
          <TouchableOpacity
            onPress={() => handleStartFocus(nextBestAction)}
            style={styles.nbaFocusBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="play" size={14} color={Colors.textInverse} />
            <Text style={styles.nbaFocusBtnText}>Start Focus</Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* Generate button */}
      <Button
        label={generating ? 'Generating…' : controlPlan ? 'Regenerate Plan' : 'Generate Daily Plan'}
        onPress={handleGenerate}
        loading={generating}
        fullWidth
        size="lg"
      />

      {/* Plan items */}
      {items.length > 0 && (
        <View style={styles.section}>
          <View style={styles.scheduleHeader}>
            <SectionHeader
              title="Today's Schedule"
              action={`${items.filter((i) => i.completed).length}/${items.length}`}
            />
            <TouchableOpacity
              onPress={() => setShowReasons((v) => !v)}
              style={[styles.whyBtn, showReasons && styles.whyBtnActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.whyBtnText, showReasons && styles.whyBtnTextActive]}>
                {showReasons ? 'Hide' : 'Why?'}
              </Text>
            </TouchableOpacity>
          </View>
          {items.map((item) => (
            <PlanItemRow
              key={item.id}
              item={item}
              nowMins={nowMins}
              showReasons={showReasons}
              onToggle={() => toggleControlPlanItem(item.id)}
              onStartFocus={() => handleStartFocus(item)}
            />
          ))}
          <TouchableOpacity
            onPress={() => reschedulePlan(today)}
            style={styles.rescheduleBtn}
            activeOpacity={0.75}
          >
            <Ionicons name="refresh-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.rescheduleBtnText}>Reschedule Remaining</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty state */}
      {items.length === 0 && !generating && (
        <Card style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.emptyStateTitle}>No plan yet</Text>
          <Text style={styles.emptyStateText}>
            Tap Generate to build your daily schedule{'\n'}from your goals and schedule.
          </Text>
        </Card>
      )}

      {/* Distraction log */}
      <TouchableOpacity
        onPress={() => logDistraction()}
        style={styles.distractionBtn}
        activeOpacity={0.75}
      >
        <Ionicons name="warning-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.distractionText}>
          I got distracted{todayDistractions > 0 ? ` · ${todayDistractions} today` : ''}
        </Text>
      </TouchableOpacity>

      {/* Focus modal */}
      <FocusModal
        block={focusItem ? ({
          id: focusItem.id,
          dayOfWeek: new Date().getDay(),
          startTime: focusItem.startTime,
          endTime: focusItem.endTime,
          type: focusItem.type === 'goal' ? 'study' : 'skill',
          goalId: focusItem.goalId,
          focusMode: true,
          completed: focusItem.completed,
          createdAt: new Date().toISOString(),
        }) : null}
        goal={focusItem ? goals.find((g) => g.id === focusItem.goalId) : undefined}
        visible={!!focusItem}
        onClose={() => setFocusItem(null)}
      />
    </ScrollView>
  );
}

// ─── Weekly sub-view (unchanged) ─────────────────────────────────────────────

function WeeklyView({ goals, weeklyPlan, generatedAt, planSource, generating, aiGenerating,
  hasApiKey, selectedDay, allocation, dayBlocks, onDaySelect, onGenerate, onAIGenerate,
  onClear, onBlockPress }: any) {

  const blocksForDay = dayBlocks(selectedDay) as PlanBlock[];
  const completedCount = weeklyPlan.filter((b: PlanBlock) => b.completed).length;
  const anyGenerating = generating || aiGenerating;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenLabel}>Planner</Text>
          <Text style={styles.screenTitle}>Weekly Goal Plan</Text>
        </View>
        {weeklyPlan.length > 0 && (
          <TouchableOpacity onPress={onClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {goals.length > 0 && weeklyPlan.length > 0 && (
        <View style={styles.coverageRow}>
          {allocation.map(({ goal, pct }: any) => (
            <View key={goal.id} style={styles.coveragePill}>
              <View style={[styles.coverageBar, { width: `${pct}%` as any }]} />
              <Text style={styles.coverageLabel} numberOfLines={1}>{goal.title}</Text>
              <Text style={styles.coveragePct}>{pct}%</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.generateRow}>
        <Button
          label={generating ? 'Generating…' : weeklyPlan.length > 0 ? 'Regenerate' : 'Generate Plan'}
          onPress={onGenerate}
          loading={generating}
          disabled={anyGenerating}
          style={styles.generateBtn}
          size="lg"
        />
        <TouchableOpacity
          onPress={onAIGenerate}
          disabled={anyGenerating}
          style={[styles.aiBtn, aiGenerating && styles.aiBtnLoading, !hasApiKey && styles.aiBtnDim]}
          activeOpacity={0.75}
        >
          {aiGenerating ? (
            <Text style={styles.aiBtnText}>Thinking…</Text>
          ) : (
            <>
              <Ionicons name="sparkles" size={15} color={Colors.gold} />
              <Text style={styles.aiBtnText}>AI Plan</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {generatedAt && (
        <View style={styles.generatedRow}>
          {planSource === 'ai' && (
            <View style={styles.aiSourceBadge}>
              <Ionicons name="sparkles" size={10} color={Colors.gold} />
              <Text style={styles.aiSourceText}>AI</Text>
            </View>
          )}
          <Text style={styles.generatedHint}>
            {new Date(generatedAt).toLocaleString()} · {weeklyPlan.length} blocks · {completedCount} done
          </Text>
        </View>
      )}

      {weeklyPlan.length > 0 && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
            {DAY_NAMES_SHORT.map((name, day) => {
              const count = (dayBlocks(day) as PlanBlock[]).length;
              const active = selectedDay === day;
              return (
                <TouchableOpacity key={day} onPress={() => onDaySelect(day)}
                  style={[styles.dayChip, active && styles.dayChipActive]} activeOpacity={0.7}>
                  <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{name}</Text>
                  {count > 0 && (
                    <View style={[styles.dayBadge, active && styles.dayBadgeActive]}>
                      <Text style={[styles.dayBadgeText, active && styles.dayBadgeTextActive]}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.section}>
            <SectionHeader title={DAY_NAMES_FULL[selectedDay]} />
            {blocksForDay.length === 0 ? (
              <Card><Text style={styles.emptyText}>No sessions scheduled — free day.</Text></Card>
            ) : (
              blocksForDay.map((block: PlanBlock) => (
                <PlanBlockCard
                  key={block.id}
                  block={block}
                  goal={goals.find((g: any) => g.id === block.goalId)}
                  onPress={() => onBlockPress(block)}
                />
              ))
            )}
          </View>
        </>
      )}

      {weeklyPlan.length === 0 && goals.length === 0 && (
        <Card style={styles.emptyState}>
          <Ionicons name="layers-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.emptyStateTitle}>No plan yet</Text>
          <Text style={styles.emptyStateText}>
            Add goals in the Goals tab and schedule events in the Schedule tab,{'\n'}then tap Generate to build your week.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlannerScreen() {
  const [mode, setMode] = useState<Mode>('daily');
  const [generating, setGenerating] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
  const [focusBlock, setFocusBlock] = useState<PlanBlock | null>(null);

  const goals            = useAppStore((s) => s.goals);
  const weeklyPlan       = useAppStore((s) => s.weeklyPlan);
  const generatedAt      = useAppStore((s) => s.weeklyPlanGeneratedAt);
  const weeklyPlanSource = useAppStore((s) => s.weeklyPlanSource);
  const generateWeekly   = useAppStore((s) => s.generateWeeklyPlanAction);
  const generateAIWeekly = useAppStore((s) => s.generateAIWeeklyPlanAction);
  const clearWeekly      = useAppStore((s) => s.clearWeeklyPlan);
  const aiApiKey         = useAppStore((s) => s.aiApiKey);

  const allocation = getGoalAllocation(goals, weeklyPlan);
  const dayBlocks  = (day: number) =>
    weeklyPlan.filter((b) => b.dayOfWeek === day)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const handleGenerateWeekly = () => {
    if (!goals.length) { Alert.alert('No goals', 'Add goals first in the Goals tab.'); return; }
    setGenerating(true);
    setTimeout(() => { generateWeekly(); setGenerating(false); }, 600);
  };

  const handleAIGenerate = async () => {
    if (!goals.length) { Alert.alert('No goals', 'Add goals first in the Goals tab.'); return; }
    if (!aiApiKey) {
      Alert.alert('API Key Required', 'Add your Anthropic API key in Settings → AI Planner.');
      return;
    }
    setAiGenerating(true);
    try { await generateAIWeekly(); }
    catch (err: any) { Alert.alert('AI Plan Failed', err?.message ?? 'Unknown error.'); }
    finally { setAiGenerating(false); }
  };

  const focusGoal = focusBlock ? goals.find((g) => g.id === focusBlock.goalId) : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Mode toggle */}
      <View style={styles.modeBar}>
        {(['daily', 'weekly'] as Mode[]).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMode(m)}
            style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
              {m === 'daily' ? 'Daily Plan' : 'Weekly Goals'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'daily' ? (
        <ControlDailyView />
      ) : (
        <WeeklyView
          goals={goals}
          weeklyPlan={weeklyPlan}
          generatedAt={generatedAt}
          planSource={weeklyPlanSource}
          generating={generating}
          aiGenerating={aiGenerating}
          hasApiKey={!!aiApiKey}
          selectedDay={selectedDay}
          allocation={allocation}
          dayBlocks={dayBlocks}
          onDaySelect={setSelectedDay}
          onGenerate={handleGenerateWeekly}
          onAIGenerate={handleAIGenerate}
          onClear={clearWeekly}
          onBlockPress={setFocusBlock}
        />
      )}

      <FocusModal
        block={focusBlock}
        goal={focusGoal}
        visible={!!focusBlock}
        onClose={() => setFocusBlock(null)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },

  modeBar: {
    flexDirection: 'row',
    margin: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeBtn: { flex: 1, paddingVertical: Spacing.xs + 2, borderRadius: Radius.sm - 2, alignItems: 'center' },
  modeBtnActive: { backgroundColor: Colors.gold },
  modeBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  modeBtnTextActive: { color: Colors.textInverse, fontWeight: FontWeight.bold },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  screenLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  screenTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 2 },
  clearBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  clearText: { fontSize: FontSize.sm, color: Colors.error },
  dateText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },

  // NBA card
  nbaCard: { gap: Spacing.xs },
  nbaHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  nbaLabel: { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  nbaTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  nbaMeta: { fontSize: FontSize.sm, color: Colors.textSecondary },
  nbaFocusBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    alignSelf: 'flex-start', backgroundColor: Colors.gold,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full, marginTop: Spacing.xs,
  },
  nbaFocusBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textInverse },

  // Schedule header row with Why? button
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  whyBtn: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  whyBtnActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  whyBtnText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  whyBtnTextActive: { color: Colors.gold, fontWeight: FontWeight.bold },

  // Reschedule button
  rescheduleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    borderStyle: 'dashed' as const, backgroundColor: Colors.surfaceElevated,
    marginTop: Spacing.xs,
  },
  rescheduleBtnText: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Plan item rows
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  itemRowActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted + '30' },
  itemRowCritical: { borderLeftWidth: 4 },
  itemRowDone: { opacity: 0.5 },
  itemCheck: { padding: 2 },
  checkCircle: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  itemTimes: { width: 88, flexDirection: 'row', gap: 2, alignItems: 'center' },
  itemTime: { fontSize: FontSize.xs, color: Colors.textSecondary },
  itemTimeSep: { fontSize: FontSize.xs, color: Colors.textMuted },
  itemTimePast: { color: Colors.textMuted },
  itemInfo: { flex: 1 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  itemTitle: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium, flexShrink: 1 },
  itemTitleDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  itemTitlePast: { color: Colors.textSecondary },
  itemType: { fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.4 },
  itemNotes: { fontSize: 10, color: Colors.textMuted, marginTop: 2, lineHeight: 14 },
  criticalChip: {
    backgroundColor: Colors.gold, borderRadius: 3,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  criticalChipText: { fontSize: 8, fontWeight: FontWeight.bold, color: Colors.textInverse, letterSpacing: 0.5 },
  energyBadge: {
    borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1,
  },
  energyBadgeText: { fontSize: 8, fontWeight: FontWeight.semibold, letterSpacing: 0.4 },
  itemNowBadge: {
    backgroundColor: Colors.gold, borderRadius: Radius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  itemNowText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textInverse },
  focusBtn: {
    width: 28, height: 28, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },

  // Distraction button
  distractionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  distractionText: { fontSize: FontSize.xs, color: Colors.textMuted },

  section: { gap: Spacing.xs },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.sm },
  emptyState: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  emptyStateTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  emptyStateText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },

  coverageRow: { gap: Spacing.xs },
  coveragePill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border,
    paddingRight: Spacing.sm, height: 28,
  },
  coverageBar: { height: '100%', backgroundColor: Colors.goldMuted, position: 'absolute', left: 0 },
  coverageLabel: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, paddingLeft: Spacing.sm, zIndex: 1 },
  coveragePct: { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.bold, zIndex: 1 },

  generateRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'stretch' },
  generateBtn: { flex: 1 },
  aiBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.gold,
    backgroundColor: Colors.goldMuted,
  },
  aiBtnLoading: { opacity: 0.6 },
  aiBtnDim: { borderColor: Colors.border, backgroundColor: Colors.surfaceElevated },
  aiBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gold },
  generatedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, justifyContent: 'center' },
  generatedHint: { fontSize: FontSize.xs, color: Colors.textMuted },
  aiSourceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.goldMuted, borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.goldDim,
  },
  aiSourceText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.gold },

  dayScroll: { marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg },
  dayChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated, marginRight: Spacing.sm,
  },
  dayChipActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  dayChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  dayChipTextActive: { color: Colors.gold, fontWeight: FontWeight.bold },
  dayBadge: {
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  dayBadgeActive: { backgroundColor: Colors.gold },
  dayBadgeText: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold },
  dayBadgeTextActive: { color: Colors.textInverse },
});
