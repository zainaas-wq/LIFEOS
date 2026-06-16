import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../constants/theme';

// ─── Core ErrorState ──────────────────────────────────────────────────────────

interface ErrorStateProps {
  title?: string;
  description?: string;
  hint?: string;
  onRetry?: () => void;
  icon?: string;
  iconColor?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again.',
  hint,
  onRetry,
  icon = 'alert-circle-outline',
  iconColor = Colors.error,
}: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: iconColor + '22' }]}>
        <Ionicons name={icon as any} size={28} color={iconColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
      {onRetry && (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.8}>
          <Ionicons name="refresh-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Preset: AI Failure ───────────────────────────────────────────────────────

export function AIErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      icon="cloud-offline-outline"
      iconColor="#818CF8"
      title="AI Temporarily Unavailable"
      description="LifeOS can't reach the AI right now. Your data is safe and saved locally."
      hint="Check your internet connection and try again."
      onRetry={onRetry}
    />
  );
}

// ─── Preset: Memory Save Failure ─────────────────────────────────────────────

export function MemorySaveErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      icon="save-outline"
      iconColor={Colors.warning}
      title="Couldn't Save Memory"
      description="The memory was created locally but couldn't sync to the cloud."
      hint="It will sync automatically when your connection returns."
      onRetry={onRetry}
    />
  );
}

// ─── Preset: Network Failure ─────────────────────────────────────────────────

export function NetworkErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      icon="wifi-outline"
      iconColor={Colors.warning}
      title="No Internet Connection"
      description="LifeOS works offline — your data is safe. AI features and cloud sync need a connection."
      hint="Reconnect to enable AI coaching and cloud sync."
      onRetry={onRetry}
    />
  );
}

// ─── Preset: Sync Failure ─────────────────────────────────────────────────────

export function SyncErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      icon="sync-outline"
      iconColor={Colors.warning}
      title="Sync Failed"
      description="Your local data is up to date, but we couldn't sync to the cloud."
      hint="Changes will sync automatically when connection is restored."
      onRetry={onRetry}
    />
  );
}

// ─── Preset: Notification Failure ────────────────────────────────────────────

export function NotificationErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      icon="notifications-off-outline"
      iconColor={Colors.textMuted}
      title="Notifications Disabled"
      description="LifeOS can't send you reminders because notification permission is denied."
      hint="Enable notifications in your device Settings to receive nudges."
      onRetry={onRetry}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  hint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  retryText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});
