/**
 * voiceHelpers.ts — Pure client-side voice request helpers.
 *
 * No React, no Expo APIs, no store deps — safe for Node tests.
 * Consumed by VoiceRecordingModal and tests.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoicePhase =
  | 'idle'
  | 'permission_pending'
  | 'recording'
  | 'stopping'
  | 'permission_denied'
  | 'error';

export type VoiceEvent =
  | 'start'
  | 'permission_granted'
  | 'permission_denied'
  | 'stop'
  | 'error'
  | 'reset';

export interface VoiceGatewayPayload {
  request_mode: 'voice';
  voice_data:   string;   // base64
  voice_mime:   string;   // e.g. 'audio/m4a'
  history:      { role: 'user' | 'assistant'; content: string }[];
  context:      object;
}

// ─── State machine ────────────────────────────────────────────────────────────

/**
 * Pure recording phase state machine.
 * All transitions are deterministic — safe to test without Expo.
 */
export function nextPhase(current: VoicePhase, event: VoiceEvent): VoicePhase {
  switch (current) {
    case 'idle':
      if (event === 'start')  return 'permission_pending';
      return current;

    case 'permission_pending':
      if (event === 'permission_granted') return 'recording';
      if (event === 'permission_denied')  return 'permission_denied';
      if (event === 'error')              return 'error';
      return current;

    case 'recording':
      if (event === 'stop')  return 'stopping';
      if (event === 'error') return 'error';
      if (event === 'reset') return 'idle';
      return current;

    case 'stopping':
      if (event === 'reset') return 'idle';
      if (event === 'error') return 'error';
      return current;

    case 'permission_denied':
    case 'error':
      if (event === 'reset') return 'idle';
      return current;

    default:
      return current;
  }
}

// ─── Audio helpers ────────────────────────────────────────────────────────────

/**
 * Resolve MIME type from audio URI produced by expo-av.
 * expo-av on iOS produces .m4a; Android produces .m4a by default
 * when using the AAC/MPEG-4 preset used here.
 */
export function resolveAudioMime(uri: string): string {
  const lower = (uri ?? '').toLowerCase();
  if (lower.endsWith('.m4a') || lower.includes('m4a')) return 'audio/m4a';
  if (lower.endsWith('.wav') || lower.includes('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3') || lower.includes('.mp3')) return 'audio/mp3';
  if (lower.endsWith('.webm') || lower.includes('webm')) return 'audio/webm';
  // Default — iOS/Android AAC output is M4A
  return 'audio/m4a';
}

/**
 * Build the gateway request payload for a voice submission.
 */
export function buildVoicePayload(
  base64:   string,
  uri:      string,
  history:  { role: 'user' | 'assistant'; content: string }[],
  context:  object,
): VoiceGatewayPayload {
  return {
    request_mode: 'voice',
    voice_data:   base64,
    voice_mime:   resolveAudioMime(uri),
    history,
    context,
  };
}

/**
 * True when a recorded audio clip is long enough to be useful.
 * Clips under 500 ms are usually accidental taps — reject them.
 */
export function isUsableRecording(durationMs: number): boolean {
  return durationMs >= 500;
}

/**
 * Human-readable duration label for the recording timer.
 * e.g. durationLabel(65000) → '1:05'
 */
export function durationLabel(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Maximum single recording duration — 90 seconds.
 * Keeps audio files small enough for Whisper (<25 MB limit).
 */
export const MAX_RECORDING_MS = 90_000;

/**
 * User-facing error message for permission denial.
 */
export function permissionDeniedMessage(): string {
  return 'Microphone access was denied. To use voice, enable it in your device settings.';
}

/**
 * User-facing error for recordings that are too short.
 */
export function tooShortMessage(): string {
  return 'Recording was too short. Tap the mic and speak clearly, then tap stop.';
}
