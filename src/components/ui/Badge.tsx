import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type BadgeVariant = 'gold' | 'success' | 'error' | 'warning' | 'muted' | 'purple' | 'info';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  textStyle?: TextStyle;
  dot?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; border: string; text: string }> = {
  gold:    { bg: Colors.goldMuted,    border: Colors.goldDim,              text: Colors.gold },
  success: { bg: Colors.successMuted, border: 'rgba(74,222,128,0.25)',      text: Colors.success },
  error:   { bg: Colors.errorMuted,   border: 'rgba(248,113,113,0.25)',     text: Colors.error },
  warning: { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)',   text: Colors.warning },
  muted:   { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)', text: Colors.textSecondary },
  purple:  { bg: Colors.purpleMuted,  border: 'rgba(157,78,221,0.25)',      text: Colors.purpleLight },
  info:    { bg: 'rgba(100,149,237,0.12)', border: 'rgba(100,149,237,0.25)', text: '#6495ED' },
};

export function Badge({ label, variant = 'muted', size = 'sm', icon, style, textStyle, dot }: BadgeProps) {
  const v = VARIANT_STYLES[variant];
  const isMd = size === 'md';

  return (
    <View
      style={[
        styles.base,
        isMd && styles.md,
        { backgroundColor: v.bg, borderColor: v.border },
        style,
      ]}
    >
      {dot && (
        <View style={[styles.dot, { backgroundColor: v.text }]} />
      )}
      {icon && (
        <Ionicons name={icon} size={isMd ? 12 : 10} color={v.text} />
      )}
      <Text
        style={[
          styles.text,
          isMd && styles.textMd,
          { color: v.text },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  md: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.4,
  },
  textMd: {
    fontSize: FontSize.sm,
    letterSpacing: 0.3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
