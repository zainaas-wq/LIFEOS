import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ActiveFocusSession } from '../types';
import { useAppStore } from '../store/useAppStore';
import { Colors, FontSize, FontWeight, Spacing } from '../constants/theme';

interface FocusBannerProps {
  session: ActiveFocusSession;
}

export function FocusBanner({ session }: FocusBannerProps) {
  const endFocus = useAppStore((s) => s.endFocus);
  const [elapsed, setElapsed] = useState(0);
  const slideAnim = useRef(new Animated.Value(-48)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  }, []);

  useEffect(() => {
    const start = new Date(session.startedAt).getTime();
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [session.startedAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.indicator} />
      <Ionicons name="flash" size={13} color={Colors.textInverse} />
      <Text style={styles.label} numberOfLines={1}>
        In Focus · {session.goalTitle}
      </Text>
      <Text style={styles.timer}>{timeStr}</Text>
      <TouchableOpacity onPress={() => endFocus()} style={styles.endBtn}>
        <Text style={styles.endLabel}>End</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gold,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    gap: Spacing.xs,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textInverse,
    opacity: 0.8,
  },
  label: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textInverse,
  },
  timer: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
    fontVariant: ['tabular-nums'],
  },
  endBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 4,
  },
  endLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
});
