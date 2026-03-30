/**
 * Batch 11.2 — Voice hardening tests
 *
 * Tests for new pure guards in src/ai/voiceHelpers.ts:
 *   1. isAcceptableFileSize() — upload size guard
 *   2. MAX_FILE_BYTES constant — 10 MB
 *   3. fileTooLargeMessage() — error string
 *   4. webNotSupportedMessage() — web error string
 *   5. Integration: state machine still correct after re-export check
 *
 * Run: npx tsx __tests__/batch11-2-hardening.ts
 */

import {
  isAcceptableFileSize,
  fileTooLargeMessage,
  webNotSupportedMessage,
  MAX_FILE_BYTES,
  // Re-verify that existing exports still work after the patch
  nextPhase,
  isUsableRecording,
  durationLabel,
  permissionDeniedMessage,
  tooShortMessage,
  MAX_RECORDING_MS,
} from '../src/ai/voiceHelpers';

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

// ─── Suite 1: MAX_FILE_BYTES constant ────────────────────────────────────────

suite('MAX_FILE_BYTES — 10 MB constant', () => {
  assert('MAX_FILE_BYTES === 10 * 1024 * 1024', MAX_FILE_BYTES === 10 * 1024 * 1024);
  assert('MAX_FILE_BYTES is a number',           typeof MAX_FILE_BYTES === 'number');
  assert('MAX_FILE_BYTES > 0',                   MAX_FILE_BYTES > 0);
});

// ─── Suite 2: isAcceptableFileSize() — accept cases ─────────────────────────

suite('isAcceptableFileSize() — acceptable sizes', () => {
  assert('1 byte is acceptable',           isAcceptableFileSize(1));
  assert('1 KB is acceptable',             isAcceptableFileSize(1024));
  assert('100 KB is acceptable',           isAcceptableFileSize(100 * 1024));
  assert('1 MB is acceptable',             isAcceptableFileSize(1024 * 1024));
  assert('5 MB is acceptable',             isAcceptableFileSize(5 * 1024 * 1024));
  assert('exactly 10 MB is acceptable',    isAcceptableFileSize(MAX_FILE_BYTES));
  assert('9.99 MB is acceptable',          isAcceptableFileSize(MAX_FILE_BYTES - 1));
});

// ─── Suite 3: isAcceptableFileSize() — reject cases ─────────────────────────

suite('isAcceptableFileSize() — rejected sizes', () => {
  assert('0 bytes is rejected',            !isAcceptableFileSize(0));
  assert('negative bytes is rejected',     !isAcceptableFileSize(-1));
  assert('10 MB + 1 byte is rejected',     !isAcceptableFileSize(MAX_FILE_BYTES + 1));
  assert('11 MB is rejected',              !isAcceptableFileSize(11 * 1024 * 1024));
  assert('25 MB is rejected',              !isAcceptableFileSize(25 * 1024 * 1024));
  assert('100 MB is rejected',             !isAcceptableFileSize(100 * 1024 * 1024));
});

// ─── Suite 4: isAcceptableFileSize() — boundary exactly ──────────────────────

suite('isAcceptableFileSize() — boundary values', () => {
  // Test exactly at the threshold in both directions
  const boundary = MAX_FILE_BYTES;
  assert('at boundary (10 MB) → acceptable', isAcceptableFileSize(boundary));
  assert('one over boundary → rejected',     !isAcceptableFileSize(boundary + 1));
  assert('one under boundary → acceptable',  isAcceptableFileSize(boundary - 1));
});

// ─── Suite 5: fileTooLargeMessage() ──────────────────────────────────────────

suite('fileTooLargeMessage() — error string content', () => {
  const msg = fileTooLargeMessage();
  assert('returns a non-empty string',                  msg.length > 0);
  assert('typeof string',                               typeof msg === 'string');
  assert('mentions "large" or "size"',
    msg.toLowerCase().includes('large') || msg.toLowerCase().includes('size'));
  assert('mentions recording or voice',
    msg.toLowerCase().includes('recording') || msg.toLowerCase().includes('voice'));
});

// ─── Suite 6: webNotSupportedMessage() ───────────────────────────────────────

suite('webNotSupportedMessage() — error string content', () => {
  const msg = webNotSupportedMessage();
  assert('returns a non-empty string',   msg.length > 0);
  assert('typeof string',                typeof msg === 'string');
  assert('mentions web',                 msg.toLowerCase().includes('web'));
  assert('mentions voice or recording',
    msg.toLowerCase().includes('voice') || msg.toLowerCase().includes('recording'));
  assert('mentions mobile or app',
    msg.toLowerCase().includes('mobile') || msg.toLowerCase().includes('app'));
});

// ─── Suite 7: Regression — existing exports unbroken ─────────────────────────

suite('Regression — pre-existing exports still correct after patch', () => {
  // State machine
  assert('nextPhase still works: idle+start → permission_pending',
    nextPhase('idle', 'start') === 'permission_pending');
  assert('nextPhase still works: recording+stop → stopping',
    nextPhase('recording', 'stop') === 'stopping');
  assert('nextPhase still works: error+reset → idle',
    nextPhase('error', 'reset') === 'idle');

  // Duration guard
  assert('isUsableRecording(499) → false', !isUsableRecording(499));
  assert('isUsableRecording(500) → true',  isUsableRecording(500));

  // Timer label
  assert('durationLabel(65000) === 1:05', durationLabel(65000) === '1:05');

  // Constants
  assert('MAX_RECORDING_MS === 90000', MAX_RECORDING_MS === 90_000);

  // Message strings
  assert('permissionDeniedMessage mentions settings',
    permissionDeniedMessage().toLowerCase().includes('settings'));
  assert('tooShortMessage mentions recording',
    tooShortMessage().toLowerCase().includes('recording'));
});

// ─── Suite 8: Guard interaction — realistic file sizes for a 90s M4A ─────────

suite('Guard interaction — realistic M4A file sizes for 90s clips', () => {
  // M4A at 64 kbps = 8 KB/s → 90s ≈ 720 KB → well within 10 MB
  const typical90sKbps64 = 90 * 8 * 1024; // ~720 KB
  assert('typical 90s M4A (64 kbps) is acceptable',  isAcceptableFileSize(typical90sKbps64));

  // M4A at 128 kbps = 16 KB/s → 90s ≈ 1.4 MB → within 10 MB
  const typical90sKbps128 = 90 * 16 * 1024; // ~1.4 MB
  assert('typical 90s M4A (128 kbps) is acceptable', isAcceptableFileSize(typical90sKbps128));

  // Worst-case uncompressed WAV: 44100 Hz * 2 bytes * 1 ch * 90s ≈ 7.6 MB → within 10 MB
  const worstCasePCM = 90 * 44100 * 2 * 1;
  assert('worst-case 90s PCM WAV (44100/16bit/mono) is acceptable',
    isAcceptableFileSize(worstCasePCM));

  // A corrupt/double-encoded file that somehow hits 15 MB → rejected
  const corrupt15MB = 15 * 1024 * 1024;
  assert('corrupt 15 MB file is rejected', !isAcceptableFileSize(corrupt15MB));
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Batch 11.2 hardening tests: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASS');
}
