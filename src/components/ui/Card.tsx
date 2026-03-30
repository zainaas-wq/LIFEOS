import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

type CardVariant = 'default' | 'elevated' | 'glass' | 'section' | 'row' | 'gold' | 'success' | 'error';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** @deprecated use variant instead */
  elevated?: boolean;
  /** @deprecated use variant="gold" instead */
  gold?: boolean;
  variant?: CardVariant;
  /** Optional left-border accent color */
  accent?: string;
  padding?: number | 'none';
}

export function Card({
  children,
  style,
  elevated = false,
  gold = false,
  variant,
  accent,
  padding,
}: CardProps) {
  // Resolve variant from legacy props if not provided
  const resolvedVariant: CardVariant =
    variant ?? (gold ? 'gold' : elevated ? 'elevated' : 'default');

  const paddingStyle: ViewStyle | null =
    padding === 'none'
      ? { padding: 0 }
      : padding !== undefined
      ? { padding }
      : null;

  return (
    <View
      style={[
        styles.base,
        variantStyles[resolvedVariant],
        accent && { borderLeftWidth: 3, borderLeftColor: accent, borderColor: 'rgba(255,255,255,0.05)' },
        paddingStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const variantStyles: Record<CardVariant, ViewStyle> = {
  default: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  elevated: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  row: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  gold: {
    backgroundColor: Colors.goldMuted,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.goldDim,
  },
  success: {
    backgroundColor: Colors.successMuted,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.25)',
  },
  error: {
    backgroundColor: Colors.errorMuted,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
  },
};

// Keep styles object for any legacy code that imports it
const styles = StyleSheet.create({
  base: {},
});
