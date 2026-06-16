import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';
import { track } from '../services/analyticsService';

// ─── Slide definitions ────────────────────────────────────────────────────────

const SLIDES = [
  {
    id: 'intro',
    icon: 'sparkles' as const,
    iconColor: Colors.gold,
    title: 'Welcome to LifeOS',
    subtitle: 'Your AI Life Coach is activated.',
    body: 'LifeOS is not a task app. It\'s an intelligence layer that builds a real-time model of your life — then executes it for you. The more you use it, the smarter it gets.',
  },
  {
    id: 'memory',
    icon: 'library-outline' as const,
    iconColor: '#818CF8',
    title: 'Memory Engine',
    subtitle: 'Save what matters. Recall anything.',
    body: 'Every note, insight, and decision you save becomes a searchable memory. Your AI Coach uses these to give personalized advice, surface your knowledge gaps, and connect your goals.',
  },
  {
    id: 'intelligence',
    icon: 'analytics-outline' as const,
    iconColor: '#34D399',
    title: 'Intelligence Layer',
    subtitle: 'Automatic risk detection. No setup required.',
    body: 'LifeOS monitors your academic readiness, project health, goal velocity, and weekly focus — then surfaces alerts before things go wrong. It runs continuously in the background.',
  },
  {
    id: 'action',
    icon: 'rocket-outline' as const,
    iconColor: Colors.gold,
    title: 'Your First Move',
    subtitle: 'How would you like to start?',
    body: 'Load a demo profile to immediately see every intelligence feature — health scores, risk alerts, academic readiness — or start with a clean slate and build your own system.',
  },
] as const;

// ─── WelcomeFlow component ────────────────────────────────────────────────────

export function WelcomeFlow({ visible }: { visible: boolean }) {
  const [slide, setSlide] = useState(0);
  const setWelcomeSeen = useAppStore((s) => s.setWelcomeSeen);
  const loadSeedData   = useAppStore((s) => s.loadSeedData);
  const fadeAnim       = useRef(new Animated.Value(0)).current;
  const slideAnim      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setSlide(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      track('welcome_flow_seen');
    }
  }, [visible]);

  const animateToSlide = (next: number) => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -20, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    setSlide(next);
  };

  const handleNext = () => {
    if (slide < SLIDES.length - 1) animateToSlide(slide + 1);
  };

  const handleLoadDemo = () => {
    loadSeedData();
    track('demo_data_loaded');
    setWelcomeSeen();
  };

  const handleStartFresh = () => {
    track('welcome_flow_completed', { choice: 'fresh' });
    setWelcomeSeen();
  };

  const current = SLIDES[slide];
  const isLast  = slide === SLIDES.length - 1;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={s.overlay}>
        <Animated.View style={[s.container, { opacity: fadeAnim }]}>

          {/* Dot progress ── */}
          <View style={s.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[s.dot, i === slide && s.dotActive, i < slide && s.dotDone]}
              />
            ))}
          </View>

          {/* Icon ── */}
          <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
            <View style={[s.iconWrap, { backgroundColor: current.iconColor + '1A' }]}>
              <Ionicons name={current.icon} size={36} color={current.iconColor} />
            </View>

            {/* Text ── */}
            <View style={s.textBlock}>
              <Text style={s.title}>{current.title}</Text>
              <Text style={[s.subtitle, { color: current.iconColor }]}>{current.subtitle}</Text>
              <Text style={s.body}>{current.body}</Text>
            </View>
          </Animated.View>

          {/* Actions ── */}
          {isLast ? (
            <View style={s.finalActions}>
              <TouchableOpacity style={s.primaryBtn} onPress={handleLoadDemo} activeOpacity={0.85}>
                <Ionicons name="flash" size={16} color={Colors.textInverse} />
                <Text style={s.primaryBtnText}>Load Demo Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.ghostBtn} onPress={handleStartFresh} activeOpacity={0.7}>
                <Text style={s.ghostBtnText}>Start with a clean slate</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.navRow}>
              <TouchableOpacity style={s.skipBtn} onPress={handleStartFresh} activeOpacity={0.7}>
                <Text style={s.skipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.nextBtn} onPress={handleNext} activeOpacity={0.85}>
                <Text style={s.nextBtnText}>Next</Text>
                <Ionicons name="arrow-forward" size={14} color={Colors.textInverse} />
              </TouchableOpacity>
            </View>
          )}

        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  container: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 420,
    gap: Spacing.lg,
  },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  dotActive: { backgroundColor: Colors.gold, width: 20 },
  dotDone:   { backgroundColor: Colors.textMuted },

  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },

  textBlock: { gap: Spacing.sm, alignItems: 'center' },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  body: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  skipText: { fontSize: FontSize.sm, color: Colors.textMuted },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.gold,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
  },
  nextBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },

  finalActions: { gap: Spacing.sm },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.gold,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  primaryBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
  ghostBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  ghostBtnText: { fontSize: FontSize.sm, color: Colors.textMuted },
});
