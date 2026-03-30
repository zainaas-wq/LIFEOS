import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius } from '../../constants/theme';

interface ProgressBarProps {
  /** 0–100 */
  pct: number;
  color?: string;
  trackColor?: string;
  height?: number;
  style?: ViewStyle;
}

export function ProgressBar({
  pct,
  color = Colors.gold,
  trackColor = Colors.surfaceHigh,
  height = 4,
  style,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: height / 2 }, style]}>
      <View
        style={[
          styles.fill,
          {
            width: `${clamped}%` as any,
            backgroundColor: color,
            height,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: Radius.full,
  },
  fill: {
    borderRadius: Radius.full,
  },
});
