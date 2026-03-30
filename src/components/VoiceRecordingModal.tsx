/**
 * VoiceRecordingModal — Full-lifecycle voice recording UI.
 *
 * Manages the complete recording flow:
 *   idle → permission request → recording → stopping → callback with result
 *
 * On successful stop: calls onSubmit({ base64, uri, durationMs })
 * On cancel or denial: calls onCancel()
 *
 * The component is self-contained — all Expo Audio interaction lives here.
 * The parent (coach.tsx) only receives the final audio blob payload.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import {
  nextPhase,
  durationLabel,
  isUsableRecording,
  permissionDeniedMessage,
  tooShortMessage,
  MAX_RECORDING_MS,
  resolveAudioMime,
} from '../ai/voiceHelpers';
import type { VoicePhase } from '../ai/voiceHelpers';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceResult {
  base64:     string;
  uri:        string;
  durationMs: number;
  mimeType:   string;
}

interface VoiceRecordingModalProps {
  visible:    boolean;
  onSubmit:   (result: VoiceResult) => void;
  onCancel:   () => void;
}

// ─── Recording preset (M4A/AAC) ───────────────────────────────────────────────

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension:    '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate:   44100,
    numberOfChannels: 1,
    bitRate:      64000,
  },
  ios: {
    extension:    '.m4a',
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate:   44100,
    numberOfChannels: 1,
    bitRate:      64000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType:       'audio/webm',
    bitsPerSecond:  64000,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function VoiceRecordingModal({ visible, onSubmit, onCancel }: VoiceRecordingModalProps) {
  const [phase,      setPhase]      = useState<VoicePhase>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pulseAnim    = useRef(new Animated.Value(1)).current;

  // ── Pulse animation when recording ────────────────────────────────────────
  useEffect(() => {
    if (phase === 'recording') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
      return undefined;
    }
  }, [phase, pulseAnim]);

  // ── Duration counter ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'recording') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setDurationMs(elapsed);
        // Auto-stop at MAX_RECORDING_MS
        if (elapsed >= MAX_RECORDING_MS) {
          handleStop();
        }
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset state when modal opens ───────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setPhase('idle');
      setDurationMs(0);
      setErrorMsg(null);
      // Start recording immediately when modal opens
      startRecording();
    } else {
      // Cleanup on close
      cleanup();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recordingRef.current) {
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          await recordingRef.current.stopAndUnloadAsync();
        }
      } catch {
        // Ignore errors during cleanup
      }
      recordingRef.current = null;
    }
    // Reset audio mode
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {
      // Ignore
    }
  }, []);

  // ── Start recording ────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setPhase(nextPhase('idle', 'start'));
    setErrorMsg(null);
    setDurationMs(0);

    try {
      // 1. Request permission
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setPhase(nextPhase('permission_pending', 'permission_denied'));
        setErrorMsg(permissionDeniedMessage());
        return;
      }
      setPhase(nextPhase('permission_pending', 'permission_granted'));

      // 2. Configure audio session
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:  true,
        playsInSilentModeIOS: true,
        // Android defaults are fine
      });

      // 3. Create and start recording
      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      recordingRef.current = recording;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err: any) {
      setPhase(nextPhase('permission_pending', 'error'));
      setErrorMsg(err?.message ?? 'Failed to start recording');
    }
  }, []);

  // ── Stop and submit ────────────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    if (phase !== 'recording' && phase !== 'stopping') return;
    setPhase(nextPhase('recording', 'stop'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const elapsed = Date.now() - startTimeRef.current;

    try {
      if (!recordingRef.current) {
        throw new Error('No active recording');
      }

      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) throw new Error('Recording URI is null');

      // Reject clips that are too short
      if (!isUsableRecording(elapsed)) {
        setPhase(nextPhase('stopping', 'error'));
        setErrorMsg(tooShortMessage());
        return;
      }

      // Read as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!base64 || base64.length < 100) {
        throw new Error('Audio file is empty or unreadable');
      }

      // Clean up temp file after encoding
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

      onSubmit({
        base64,
        uri,
        durationMs: elapsed,
        mimeType:   resolveAudioMime(uri),
      });

      // Reset phase (modal will be hidden by parent)
      setPhase(nextPhase('stopping', 'reset'));

    } catch (err: any) {
      setPhase(nextPhase('stopping', 'error'));
      setErrorMsg(err?.message ?? 'Failed to process recording');
      recordingRef.current = null;
    }
  }, [phase, onSubmit]);

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    await cleanup();
    setPhase('idle');
    setErrorMsg(null);
    setDurationMs(0);
    onCancel();
  }, [cleanup, onCancel]);

  // ── Retry after error ──────────────────────────────────────────────────────
  const handleRetry = useCallback(async () => {
    await cleanup();
    setPhase('idle');
    setErrorMsg(null);
    setDurationMs(0);
    startRecording();
  }, [cleanup, startRecording]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const isRecording = phase === 'recording';
  const isStopping  = phase === 'stopping';
  const hasError    = phase === 'error' || phase === 'permission_denied';
  const isPending   = phase === 'permission_pending' || phase === 'idle';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={s.overlay}>
        <View style={s.sheet}>

          {/* Header */}
          <Text style={s.title}>Voice Command</Text>
          <Text style={s.sub}>
            {isPending  ? 'Requesting microphone…' :
             isRecording ? 'Listening — tap stop when done' :
             isStopping  ? 'Processing…' :
             hasError    ? 'Something went wrong' :
             'Ready'}
          </Text>

          {/* Mic icon — animated when recording */}
          <View style={s.micWrap}>
            <Animated.View style={[s.micRing, isRecording && s.micRingActive, { transform: [{ scale: pulseAnim }] }]}>
              <View style={[s.micCircle, isRecording && s.micCircleActive, hasError && s.micCircleError]}>
                {isStopping
                  ? <Ionicons name="hourglass-outline" size={32} color={Colors.textMuted} />
                  : hasError
                  ? <Ionicons name="alert-circle-outline" size={32} color="#F87171" />
                  : <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={32} color={isRecording ? Colors.textInverse : Colors.textMuted} />
                }
              </View>
            </Animated.View>
          </View>

          {/* Timer */}
          {isRecording && (
            <Text style={s.timer}>{durationLabel(durationMs)}</Text>
          )}

          {/* Error message */}
          {hasError && errorMsg && (
            <Text style={s.errorMsg}>{errorMsg}</Text>
          )}

          {/* Action buttons */}
          <View style={s.actions}>
            {isRecording && (
              <TouchableOpacity style={s.stopBtn} onPress={handleStop} activeOpacity={0.8}>
                <View style={s.stopIcon} />
                <Text style={s.stopBtnText}>Stop</Text>
              </TouchableOpacity>
            )}

            {hasError && phase !== 'permission_denied' && (
              <TouchableOpacity style={s.retryBtn} onPress={handleRetry} activeOpacity={0.8}>
                <Text style={s.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.cancelBtn, isStopping && s.cancelBtnDisabled]}
              onPress={handleCancel}
              activeOpacity={0.7}
              disabled={isStopping}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Max duration hint */}
          {isRecording && (
            <Text style={s.hint}>Max {MAX_RECORDING_MS / 1000}s — auto-stops</Text>
          )}

        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  sheet: {
    width: '100%',
    backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  micWrap: {
    marginVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micRingActive: {
    borderColor: Colors.gold + '66',
    backgroundColor: Colors.goldMuted,
  },
  micCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  micCircleActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  micCircleError: {
    borderColor: '#F87171',
    backgroundColor: 'rgba(248,113,113,0.1)',
  },
  timer: {
    fontSize: 32,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'] as any,
  },
  errorMsg: {
    fontSize: FontSize.sm,
    color: '#F87171',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
  },
  actions: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    width: '100%',
  },
  stopIcon: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: Colors.textInverse,
  },
  stopBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textInverse,
  },
  retryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  retryBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    width: '100%',
  },
  cancelBtnDisabled: {
    opacity: 0.4,
  },
  cancelBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: -Spacing.xs,
  },
});
