import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';

// ─── SkeletonLine ─────────────────────────────────────────────────────────────

interface SkeletonLineProps {
  width?: string | number;
  height?: number;
  style?: object;
}

export function SkeletonLine({ width = '100%', height = 14, style }: SkeletonLineProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: Radius.sm,
          backgroundColor: Colors.surfaceHigh,
        },
        { opacity },
        style,
      ]}
    />
  );
}

// ─── SkeletonCard ─────────────────────────────────────────────────────────────

export function SkeletonCard({ lines = 3, showHeader = true }: { lines?: number; showHeader?: boolean }) {
  return (
    <View style={skelStyles.card}>
      {showHeader && <SkeletonLine width="55%" height={16} />}
      {Array.from({ length: showHeader ? lines - 1 : lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={i === lines - 2 ? '38%' : '88%'}
          height={12}
          style={{ marginTop: Spacing.xs }}
        />
      ))}
    </View>
  );
}

// ─── SkeletonList ─────────────────────────────────────────────────────────────

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: Spacing.sm }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={i % 2 === 0 ? 3 : 2} />
      ))}
    </View>
  );
}

// ─── SkeletonSection ──────────────────────────────────────────────────────────

export function SkeletonSection({ cards = 2 }: { cards?: number }) {
  return (
    <View style={{ gap: Spacing.sm }}>
      <SkeletonLine width="35%" height={11} />
      <SkeletonList count={cards} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const skelStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
