/**
 * Batch 14 — AI Orchestration Engine tests
 *
 * Tests for pure functions in src/ai/orchestrationEngine.ts:
 *   1. deriveAIRequestMode() — signal-to-mode mapping
 *   2. selectContextDepth()  — depth from mode + balance
 *   3. historyDepthForMode() — history slice lengths
 *   4. shouldUseExternalAI() — routing policy
 *   5. getResponseStyleHint()— style strings
 *   6. getModeLabelDisplay() — UI labels
 *   7. buildAIContextPacket()— context shaping
 *   8. Integration: end-to-end orchestration scenarios
 *
 * Run: npx tsx __tests__/batch14-orchestration.ts
 */

import {
  deriveAIRequestMode,
  selectContextDepth,
  historyDepthForMode,
  shouldUseExternalAI,
  getResponseStyleHint,
  getModeLabelDisplay,
  buildAIContextPacket,
} from '../src/ai/orchestrationEngine';
import type { OrchestrationSignals, AIRequestMode, ContextDepth } from '../src/ai/orchestrationEngine';
import type { AIContext } from '../src/ai/AIClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _passed = 0;
let _failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    _passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    _failed++;
  }
}

function suite(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ─── Base signals fixture ─────────────────────────────────────────────────────

function baseSignals(overrides: Partial<OrchestrationSignals> = {}): OrchestrationSignals {
  return {
    userMessage:      'How can I improve today?',
    driftScore:       0,
    isInRecoveryMode: false,
    missedTasksCount: 0,
    reviewCount:      0,
    creditBalance:    20,
    dayMode:          'ON_TRACK',
    hasActivePlan:    false,
    topRiskCount:     0,
    ...overrides,
  };
}

// ─── Base context fixture ─────────────────────────────────────────────────────

function baseContext(overrides: Partial<AIContext> = {}): AIContext {
  return {
    goals: [
      { id: 'g1', title: 'Learn TypeScript', category: 'skill', priority: 1, weeklyHoursTarget: 5 } as any,
      { id: 'g2', title: 'Exercise',         category: 'health', priority: 2, weeklyHoursTarget: 3 } as any,
      { id: 'g3', title: 'Read',             category: 'growth', priority: 3, weeklyHoursTarget: 2 } as any,
      { id: 'g4', title: 'Side project',     category: 'work',   priority: 4, weeklyHoursTarget: 4 } as any,
    ],
    skillPlans:     [],
    rules:          [],
    scheduleEvents: [],
    focusSessions:  [],
    todayDate:      '2026-03-31',
    ...overrides,
  } as AIContext;
}

// ─── Suite 1: deriveAIRequestMode ─────────────────────────────────────────────

suite('deriveAIRequestMode() — signal-to-mode mapping', () => {
  // Recovery path
  assert('isInRecoveryMode=true → recovery_coach',
    deriveAIRequestMode(baseSignals({ isInRecoveryMode: true })) === 'recovery_coach');
  assert('driftScore=5 → recovery_coach',
    deriveAIRequestMode(baseSignals({ driftScore: 5 })) === 'recovery_coach');
  assert('driftScore=8 → recovery_coach',
    deriveAIRequestMode(baseSignals({ driftScore: 8 })) === 'recovery_coach');
  assert('missedTasksCount=3 → recovery_coach',
    deriveAIRequestMode(baseSignals({ missedTasksCount: 3 })) === 'recovery_coach');
  assert('missedTasksCount=5 → recovery_coach',
    deriveAIRequestMode(baseSignals({ missedTasksCount: 5 })) === 'recovery_coach');

  // Strategic planning path
  assert('"build my day" → strategic_planning',
    deriveAIRequestMode(baseSignals({ userMessage: 'Help me build my day' })) === 'strategic_planning');
  assert('"daily plan" → strategic_planning',
    deriveAIRequestMode(baseSignals({ userMessage: 'Generate a daily plan for me' })) === 'strategic_planning');
  assert('"weekly plan" → strategic_planning',
    deriveAIRequestMode(baseSignals({ userMessage: 'Create a weekly plan' })) === 'strategic_planning');
  assert('"strategy" → strategic_planning',
    deriveAIRequestMode(baseSignals({ userMessage: 'What is my strategy for this week?' })) === 'strategic_planning');
  assert('"schedule" → strategic_planning',
    deriveAIRequestMode(baseSignals({ userMessage: 'Help me schedule my tasks' })) === 'strategic_planning');

  // Review reflection path (requires reviewCount >= 2)
  assert('"reflect" + reviewCount=2 → review_reflection',
    deriveAIRequestMode(baseSignals({ userMessage: 'Help me reflect on last week', reviewCount: 2 })) === 'review_reflection');
  assert('"recap" + reviewCount=3 → review_reflection',
    deriveAIRequestMode(baseSignals({ userMessage: 'Give me a recap', reviewCount: 3 })) === 'review_reflection');
  assert('"review" + reviewCount=1 → NOT review_reflection (insufficient history)',
    deriveAIRequestMode(baseSignals({ userMessage: 'review my week', reviewCount: 1 })) !== 'review_reflection');

  // Quick nudge — low balance
  assert('balance=2, normal message → quick_nudge',
    deriveAIRequestMode(baseSignals({ creditBalance: 2, userMessage: 'What should I do now?' })) === 'quick_nudge');
  assert('balance=1 → quick_nudge',
    deriveAIRequestMode(baseSignals({ creditBalance: 1 })) === 'quick_nudge');

  // Quick nudge — short message + no drift
  assert('very short message, no drift, no plan → quick_nudge',
    deriveAIRequestMode(baseSignals({ userMessage: 'Help', hasActivePlan: false, driftScore: 0 })) === 'quick_nudge');

  // Default: focused_answer
  assert('normal message, healthy balance → focused_answer',
    deriveAIRequestMode(baseSignals({ userMessage: 'I need help staying focused today', creditBalance: 15 })) === 'focused_answer');
  assert('medium message, no recovery, no plan keywords → focused_answer',
    deriveAIRequestMode(baseSignals({ userMessage: 'I feel a bit scattered, what should I do?' })) === 'focused_answer');
});

// ─── Suite 2: Recovery always wins ───────────────────────────────────────────

suite('deriveAIRequestMode() — recovery beats other signals', () => {
  // Recovery beats planning keywords
  assert('recovery + planning keywords → recovery_coach',
    deriveAIRequestMode(baseSignals({
      isInRecoveryMode: true,
      userMessage: 'Build a daily plan for me',
    })) === 'recovery_coach');

  // Recovery beats review keywords
  assert('recovery + review keywords → recovery_coach',
    deriveAIRequestMode(baseSignals({
      driftScore: 6,
      userMessage: 'Reflect on my week',
      reviewCount: 5,
    })) === 'recovery_coach');

  // Recovery beats low balance
  assert('recovery + low balance → recovery_coach',
    deriveAIRequestMode(baseSignals({
      isInRecoveryMode: true,
      creditBalance: 1,
    })) === 'recovery_coach');
});

// ─── Suite 3: selectContextDepth ─────────────────────────────────────────────

suite('selectContextDepth() — mode + balance → depth', () => {
  assert('quick_nudge → minimal',
    selectContextDepth('quick_nudge', 20) === 'minimal');
  assert('quick_nudge, balance=null → minimal',
    selectContextDepth('quick_nudge', null) === 'minimal');
  assert('any mode, balance=2 → minimal',
    selectContextDepth('focused_answer', 2) === 'minimal');
  assert('any mode, balance=1 → minimal',
    selectContextDepth('recovery_coach', 1) === 'minimal');
  assert('any mode, balance=0 → minimal',
    selectContextDepth('focused_answer', 0) === 'minimal');
  assert('strategic_planning → rich',
    selectContextDepth('strategic_planning', 20) === 'rich');
  assert('review_reflection → rich',
    selectContextDepth('review_reflection', 15) === 'rich');
  assert('focused_answer, healthy balance → focused',
    selectContextDepth('focused_answer', 10) === 'focused');
  assert('recovery_coach, healthy balance → focused',
    selectContextDepth('recovery_coach', 8) === 'focused');
  assert('balance=null, strategic_planning → rich (balance unknown, use mode)',
    selectContextDepth('strategic_planning', null) === 'rich');
  assert('balance=3, focused_answer → focused',
    selectContextDepth('focused_answer', 3) === 'focused');
});

// ─── Suite 4: historyDepthForMode ────────────────────────────────────────────

suite('historyDepthForMode() — history slice limits', () => {
  assert('minimal → 0',  historyDepthForMode('minimal') === 0);
  assert('focused → 4',  historyDepthForMode('focused') === 4);
  assert('rich → 8',     historyDepthForMode('rich') === 8);
});

// ─── Suite 5: shouldUseExternalAI ────────────────────────────────────────────

suite('shouldUseExternalAI() — routing policy', () => {
  // Not authenticated → always local
  assert('not authenticated → false',
    shouldUseExternalAI(20, 'focused_answer', false) === false);
  assert('not authenticated, recovery → false',
    shouldUseExternalAI(20, 'recovery_coach', false) === false);

  // Exhausted → local (save the round-trip)
  assert('balance=0 → false',
    shouldUseExternalAI(0, 'focused_answer', true) === false);
  assert('balance=-1 → false',
    shouldUseExternalAI(-1, 'focused_answer', true) === false);

  // Quick nudge with ≤2 balance → local (preserve credits for valuable requests)
  assert('quick_nudge + balance=2 → false',
    shouldUseExternalAI(2, 'quick_nudge', true) === false);
  assert('quick_nudge + balance=1 → false',
    shouldUseExternalAI(1, 'quick_nudge', true) === false);

  // External AI should be used when authenticated + sufficient balance
  assert('focused_answer + balance=5 → true',
    shouldUseExternalAI(5, 'focused_answer', true) === true);
  assert('recovery_coach + balance=3 → true',
    shouldUseExternalAI(3, 'recovery_coach', true) === true);
  assert('strategic_planning + balance=10 → true',
    shouldUseExternalAI(10, 'strategic_planning', true) === true);
  assert('quick_nudge + balance=3 → true (enough credits)',
    shouldUseExternalAI(3, 'quick_nudge', true) === true);
  assert('balance=null → true (unknown, let backend decide)',
    shouldUseExternalAI(null, 'focused_answer', true) === true);
});

// ─── Suite 6: getResponseStyleHint ───────────────────────────────────────────

suite('getResponseStyleHint() — style strings', () => {
  const modes: AIRequestMode[] = [
    'quick_nudge', 'focused_answer', 'recovery_coach',
    'strategic_planning', 'review_reflection',
  ];

  for (const mode of modes) {
    const hint = getResponseStyleHint(mode);
    assert(`${mode} → non-empty string`, hint.length > 0);
    assert(`${mode} → is string`, typeof hint === 'string');
  }

  assert('quick_nudge mentions 2 sentences or direct',
    getResponseStyleHint('quick_nudge').toLowerCase().includes('sentence') ||
    getResponseStyleHint('quick_nudge').toLowerCase().includes('direct'));

  assert('recovery_coach mentions non-guilt or support',
    getResponseStyleHint('recovery_coach').toLowerCase().includes('guilt') ||
    getResponseStyleHint('recovery_coach').toLowerCase().includes('support'));

  assert('strategic_planning mentions structure',
    getResponseStyleHint('strategic_planning').toLowerCase().includes('struct'));

  assert('review_reflection mentions pattern or interpret',
    getResponseStyleHint('review_reflection').toLowerCase().includes('pattern') ||
    getResponseStyleHint('review_reflection').toLowerCase().includes('interpret'));
});

// ─── Suite 7: getModeLabelDisplay ────────────────────────────────────────────

suite('getModeLabelDisplay() — UI labels', () => {
  assert('quick_nudge → Quick Help',       getModeLabelDisplay('quick_nudge') === 'Quick Help');
  assert('focused_answer → Focused',       getModeLabelDisplay('focused_answer') === 'Focused');
  assert('recovery_coach → Recovery Coach', getModeLabelDisplay('recovery_coach') === 'Recovery Coach');
  assert('strategic_planning → Strategic', getModeLabelDisplay('strategic_planning') === 'Strategic');
  assert('review_reflection → Review',     getModeLabelDisplay('review_reflection') === 'Review');
});

// ─── Suite 8: buildAIContextPacket ───────────────────────────────────────────

suite('buildAIContextPacket() — minimal depth', () => {
  const ctx     = baseContext();
  const packet  = buildAIContextPacket(ctx, 'minimal', 'quick_nudge') as any;

  assert('todayDate present',      typeof packet.todayDate === 'string');
  assert('aiMode = quick_nudge',   packet.aiMode === 'quick_nudge');
  assert('responseStyleHint present', typeof packet.responseStyleHint === 'string');
  assert('no tracks in minimal',   packet.tracks === undefined);
  assert('no schedule in minimal', packet.schedule === undefined);
  assert('no todayPlan in minimal', packet.todayPlan === undefined);
});

suite('buildAIContextPacket() — focused depth', () => {
  const ctx = baseContext({
    currentPlan: {
      id: 'p1', type: 'daily', dateRange: { start: '2026-03-31', end: '2026-03-31' },
      items: [
        { id: 'i1', startTime: '09:00', endTime: '10:00', title: 'TypeScript', type: 'goal', completed: false } as any,
        { id: 'i2', startTime: '10:00', endTime: '11:00', title: 'Break',      type: 'break', completed: false } as any,
      ],
    },
    reviewSignals: {
      recentPatterns:         ['Usually skips morning sessions'],
      adaptationRationale:    'Reduce load based on past patterns',
      preferredRecoveryModes: [] as any,
      reviewCount:            3,
    },
  });
  const packet = buildAIContextPacket(ctx, 'focused', 'focused_answer') as any;

  assert('todayDate present',           typeof packet.todayDate === 'string');
  assert('aiMode = focused_answer',     packet.aiMode === 'focused_answer');
  assert('tracks present (top 3 max)',  Array.isArray(packet.tracks) && packet.tracks.length <= 3);
  assert('todayPlan present',           packet.todayPlan?.items?.length >= 1);
  assert('no focusSummary in focused',  packet.focusSummary === undefined);
  assert('no full schedule in focused', packet.schedule === undefined);
  assert('recentPattern present',       typeof packet.recentPattern === 'string');
});

suite('buildAIContextPacket() — rich depth', () => {
  const ctx = baseContext({
    reviewSignals: {
      recentPatterns:         ['Morning slump', 'Afternoon productive'],
      adaptationRationale:    'Shift goals to afternoon',
      preferredRecoveryModes: [] as any,
      reviewCount:            5,
    },
    predictionSignals: {
      topRisks: [
        { riskType: 'avoidance' as any, confidence: 'high', headline: 'May avoid focus', rationale: '...' },
      ],
      predictionContext: 'High avoidance risk today',
      planExplanation:  { decision: 'lighter', reason: 'stress', signal: 'drift', confidence: 'medium' },
    },
  });
  const packet = buildAIContextPacket(ctx, 'rich', 'strategic_planning') as any;

  assert('aiMode = strategic_planning',       packet.aiMode === 'strategic_planning');
  assert('all 4 tracks in rich',             Array.isArray(packet.tracks) && packet.tracks.length === 4);
  assert('reviewSignals present',            packet.reviewSignals != null);
  assert('predictions present',             packet.predictions != null);
  assert('prediction topRisks present',     Array.isArray(packet.predictions?.topRisks));
  assert('focusSummary present in rich',    packet.focusSummary != null);
});

// ─── Suite 9: Integration scenarios ──────────────────────────────────────────

suite('Integration: end-to-end orchestration scenario — recovery user', () => {
  const signals = baseSignals({
    isInRecoveryMode: true,
    missedTasksCount: 4,
    driftScore:       6,
    creditBalance:    8,
  });
  const mode  = deriveAIRequestMode(signals);
  const depth = selectContextDepth(mode, signals.creditBalance);
  const hist  = historyDepthForMode(depth);
  const ext   = shouldUseExternalAI(signals.creditBalance!, mode, true);
  const hint  = getResponseStyleHint(mode);

  assert('mode = recovery_coach',    mode === 'recovery_coach');
  assert('depth = focused (8cr)',    depth === 'focused');
  assert('history = 4 messages',     hist === 4);
  assert('use external (8 credits)', ext === true);
  assert('hint is supportive',       hint.toLowerCase().includes('guilt') || hint.toLowerCase().includes('support'));
});

suite('Integration: end-to-end orchestration scenario — near-zero balance', () => {
  const signals = baseSignals({
    creditBalance: 2,
    userMessage:   'What should I focus on?',
    driftScore:    0,
  });
  const mode  = deriveAIRequestMode(signals);
  const depth = selectContextDepth(mode, signals.creditBalance);
  const hist  = historyDepthForMode(depth);
  const ext   = shouldUseExternalAI(signals.creditBalance!, mode, true);

  assert('mode = quick_nudge',            mode === 'quick_nudge');
  assert('depth = minimal (low balance)', depth === 'minimal');
  assert('no history sent',               hist === 0);
  assert('route to local (preserve credits)', ext === false);
});

suite('Integration: end-to-end orchestration scenario — strategic user', () => {
  const signals = baseSignals({
    userMessage:   'Help me build a daily plan for today',
    creditBalance: 20,
    reviewCount:   4,
    hasActivePlan: true,
  });
  const mode  = deriveAIRequestMode(signals);
  const depth = selectContextDepth(mode, signals.creditBalance);
  const hist  = historyDepthForMode(depth);
  const ext   = shouldUseExternalAI(signals.creditBalance!, mode, true);

  assert('mode = strategic_planning', mode === 'strategic_planning');
  assert('depth = rich',              depth === 'rich');
  assert('history = 8 messages',      hist === 8);
  assert('use external API',          ext === true);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Batch 14 orchestration tests: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASS');
}
