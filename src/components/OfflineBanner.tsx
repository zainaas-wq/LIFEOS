import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/theme';
import {
  getIsOnline,
  onConnectivityChange,
  startConnectivityPolling,
} from '../lib/networkUtils';

interface Props {
  /** Additional names of services that failed on last sync (from syncErrors). */
  syncErrors?: string[];
}

/**
 * Slides in from the top whenever the device is offline or a sync partially
 * failed. Slides back out automatically when connectivity is restored.
 */
export default function OfflineBanner({ syncErrors = [] }: Props) {
  const [offline, setOffline] = useState(!getIsOnline());
  const slideAnim = useRef(new Animated.Value(offline ? 0 : -48)).current;

  useEffect(() => {
    const stop = startConnectivityPolling(30_000);
    const unsub = onConnectivityChange((online) => setOffline(!online));
    return () => {
      stop();
      unsub();
    };
  }, []);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: offline ? 0 : -48,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [offline]);

  const showPartialWarning = !offline && syncErrors.length > 0;

  if (!offline && !showPartialWarning) return null;

  const message = offline
    ? 'No internet — changes saved locally'
    : `Some data didn't load (${syncErrors.join(', ')}) — pull to retry`;

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
    >
      <View style={styles.dot} />
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    height: 40,
    backgroundColor: '#7C3B12',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.warning,
  },
  text: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
});
