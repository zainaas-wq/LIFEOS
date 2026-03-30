/**
 * Batch 11.1 — Voice client logic tests
 *
 * Tests for pure helpers in src/ai/voiceHelpers.ts:
 *   1. nextPhase() — recording state machine transitions
 *   2. resolveAudioMime() — URI → MIME type
 *   3. buildVoicePayload() — gateway payload builder
 *   4. isUsableRecording() — min-duration guard
 *   5. durationLabel() — timer display formatting
 *   6. Constants — MAX_RECORDING_MS, message strings
 *   7. Full state machine walk-through
 *   8. Edge cases and invalid inputs
 *
 * Run: npx tsx __tests__/batch11-1-voice.ts
 */

import {
  nextPhase,
  resolveAudioMime,
  buildVoicePayload,
  isUsableRecording,
  durationLabel,
  permissionDeniedMessage,
  tooShortMessage,
  MAX_RECORDING_MS,
} from '../src/ai/voiceHelpers';
import type { VoicePhase, VoiceEvent } from '../src/ai/voiceHelpers';

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

// ─── Suite 1: State machine — happy path ─────────────────────────────────────

suite('nextPhase() — happy path (idle → record → stop)', () => {
  // idle → start → permission_pending
  assert('idle + start → permission_pending',
    nextPhase('idle', 'start') === 'permission_pending');

  // permission_pending → permission_granted → recording
  assert('permission_pending + granted → recording',
    nextPhase('permission_pending', 'permission_granted') === 'recording');

  // recording → stop → stopping
  assert('recording + stop → stopping',
    nextPhase('recording', 'stop') === 'stopping');

  // stopping → reset → idle
  assert('stopping + reset → idle',
    nextPhase('stopping', 'reset') === 'idle');
});

// ─── Suite 2: State machine — permission denied ───────────────────────────────

suite('nextPhase() — permission denied path', () => {
  assert('permission_pending + denied → permission_denied',
    nextPhase('permission_pending', 'permission_denied') === 'permission_denied');

  assert('permission_denied + reset → idle',
    nextPhase('permission_denied', 'reset') === 'idle');

  // permission_denied is a terminal state (until reset)
  assert('permission_denied + start = no change',
    nextPhase('permission_denied', 'start') === 'permission_denied');
});

// ─── Suite 3: State machine — error paths ─────────────────────────────────────

suite('nextPhase() — error paths', () => {
  assert('permission_pending + error → error',
    nextPhase('permission_pending', 'error') === 'error');

  assert('recording + error → error',
    nextPhase('recording', 'error') === 'error');

  assert('stopping + error → error',
    nextPhase('stopping', 'error') === 'error');

  assert('error + reset → idle',
    nextPhase('error', 'reset') === 'idle');

  assert('error + start = no change (must reset first)',
    nextPhase('error', 'start') === 'error');
});

// ─── Suite 4: State machine — no spurious transitions ────────────────────────

suite('nextPhase() — invalid events are no-ops', () => {
  assert('idle + stop = idle (no active recording)',
    nextPhase('idle', 'stop') === 'idle');

  assert('idle + reset = idle (already idle)',
    nextPhase('idle', 'reset') === 'idle');

  assert('recording + permission_granted = recording (already recording)',
    nextPhase('recording', 'permission_granted') === 'recording');

  assert('stopping + stop = stopping (already stopping)',
    nextPhase('stopping', 'stop') === 'stopping');
});

// ─── Suite 5: State machine — cancel from recording ──────────────────────────

suite('nextPhase() — cancel from recording state', () => {
  // User can reset directly from recording (cancel button)
  assert('recording + reset → idle',
    nextPhase('recording', 'reset') === 'idle');
});

// ─── Suite 6: resolveAudioMime() ─────────────────────────────────────────────

suite('resolveAudioMime() — URI to MIME type', () => {
  // M4A (most common iOS/Android output)
  assert('*.m4a → audio/m4a',      resolveAudioMime('/tmp/recording.m4a') === 'audio/m4a');
  assert('URI with m4a → audio/m4a', resolveAudioMime('file:///tmp/rec-0001.m4a') === 'audio/m4a');

  // Other formats
  assert('*.wav → audio/wav',      resolveAudioMime('/tmp/rec.wav') === 'audio/wav');
  assert('*.mp3 → audio/mp3',      resolveAudioMime('/tmp/rec.mp3') === 'audio/mp3');
  assert('*.webm → audio/webm',    resolveAudioMime('/tmp/rec.webm') === 'audio/webm');

  // Unknown → default M4A
  assert('unknown ext → audio/m4a (default)', resolveAudioMime('/tmp/rec.aac') === 'audio/m4a');
  assert('empty string → audio/m4a (default)', resolveAudioMime('') === 'audio/m4a');

  // Case insensitive
  assert('*.M4A uppercase → audio/m4a', resolveAudioMime('/tmp/REC.M4A') === 'audio/m4a');
});

// ─── Suite 7: buildVoicePayload() ────────────────────────────────────────────

suite('buildVoicePayload() — gateway payload builder', () => {
  const base64  = 'dGVzdGF1ZGlv'; // base64 of 'testaudio'
  const uri     = '/tmp/rec.m4a';
  const history = [{ role: 'user' as const, content: 'Hello' }];
  const context = { todayDate: '2026-03-30', tracks: [] };

  const payload = buildVoicePayload(base64, uri, history, context);

  assert('request_mode is voice',        payload.request_mode === 'voice');
  assert('voice_data matches base64',    payload.voice_data === base64);
  assert('voice_mime resolved from URI', payload.voice_mime === 'audio/m4a');
  assert('history passed through',       payload.history.length === 1);
  assert('context passed through',       (payload.context as any).todayDate === '2026-03-30');

  // Webm URI
  const webmPayload = buildVoicePayload(base64, '/tmp/rec.webm', [], {});
  assert('webm URI → voice_mime = audio/webm', webmPayload.voice_mime === 'audio/webm');

  // Empty history is fine
  const emptyHistPayload = buildVoicePayload(base64, uri, [], {});
  assert('empty history → history = []', emptyHistPayload.history.length === 0);
});

// ─── Suite 8: isUsableRecording() ────────────────────────────────────────────

suite('isUsableRecording() — min-duration guard', () => {
  // Under threshold (< 500ms) → reject
  assert('0ms → unusable',   !isUsableRecording(0));
  assert('100ms → unusable', !isUsableRecording(100));
  assert('499ms → unusable', !isUsableRecording(499));

  // At/over threshold (>= 500ms) → usable
  assert('500ms → usable',    isUsableRecording(500));
  assert('1000ms → usable',   isUsableRecording(1000));
  assert('30000ms → usable',  isUsableRecording(30000));
  assert('MAX → usable',      isUsableRecording(MAX_RECORDING_MS));
});

// ─── Suite 9: durationLabel() ────────────────────────────────────────────────

suite('durationLabel() — timer display', () => {
  assert('0ms → 0:00',          durationLabel(0)       === '0:00');
  assert('1000ms → 0:01',       durationLabel(1000)    === '0:01');
  assert('9000ms → 0:09',       durationLabel(9000)    === '0:09');
  assert('10000ms → 0:10',      durationLabel(10000)   === '0:10');
  assert('59000ms → 0:59',      durationLabel(59000)   === '0:59');
  assert('60000ms → 1:00',      durationLabel(60000)   === '1:00');
  assert('65000ms → 1:05',      durationLabel(65000)   === '1:05');
  assert('90000ms → 1:30',      durationLabel(90000)   === '1:30');
  assert('seconds zero-padded', durationLabel(61000)   === '1:01');
});

// ─── Suite 10: Constants ──────────────────────────────────────────────────────

suite('Constants — MAX_RECORDING_MS and message strings', () => {
  assert('MAX_RECORDING_MS = 90000ms (90s)', MAX_RECORDING_MS === 90_000);
  assert('permissionDeniedMessage is non-empty', permissionDeniedMessage().length > 0);
  assert('tooShortMessage is non-empty',         tooShortMessage().length > 0);
  assert('permissionDeniedMessage mentions settings', permissionDeniedMessage().toLowerCase().includes('settings'));
  assert('tooShortMessage mentions recording',        tooShortMessage().toLowerCase().includes('recording'));
});

// ─── Suite 11: Full walk-through simulation ───────────────────────────────────

suite('Full state machine walk — happy path', () => {
  let phase: VoicePhase = 'idle';

  phase = nextPhase(phase, 'start');
  assert('step 1: idle → permission_pending', phase === 'permission_pending');

  phase = nextPhase(phase, 'permission_granted');
  assert('step 2: permission_pending → recording', phase === 'recording');

  phase = nextPhase(phase, 'stop');
  assert('step 3: recording → stopping', phase === 'stopping');

  phase = nextPhase(phase, 'reset');
  assert('step 4: stopping → idle', phase === 'idle');
});

suite('Full state machine walk — denied then retry', () => {
  let phase: VoicePhase = 'idle';

  phase = nextPhase(phase, 'start');
  assert('start → permission_pending', phase === 'permission_pending');

  phase = nextPhase(phase, 'permission_denied');
  assert('denied → permission_denied', phase === 'permission_denied');

  phase = nextPhase(phase, 'reset');
  assert('reset → idle', phase === 'idle');

  // Second attempt works
  phase = nextPhase(phase, 'start');
  assert('retry: idle → permission_pending', phase === 'permission_pending');

  phase = nextPhase(phase, 'permission_granted');
  assert('retry: permission_pending → recording', phase === 'recording');
});

suite('Full state machine walk — error recovery', () => {
  let phase: VoicePhase = 'idle';
  phase = nextPhase(phase, 'start');
  phase = nextPhase(phase, 'permission_granted');
  phase = nextPhase(phase, 'error');
  assert('error while recording → error state', phase === 'error');

  phase = nextPhase(phase, 'reset');
  assert('reset from error → idle', phase === 'idle');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Batch 11.1 voice tests: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASS');
}
