/**
 * language.tsx — Language selection screen.
 *
 * First screen every new user sees (before auth / onboarding).
 * Persists the choice globally via store.setLanguage (calls i18next.changeLanguage).
 * All subsequent screens immediately reflect the selected language.
 *
 * This screen itself renders in the CURRENT language (starts as English).
 * After the user selects and taps Continue, all downstream screens render in
 * the chosen language.
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadow } from '../src/constants/theme';
import { useAppStore } from '../src/store/useAppStore';
import { useDirection } from '../src/hooks/useDirection';
import type { SupportedLanguage } from '../src/i18n';

// ── Language registry ─────────────────────────────────────────────────────────
// Extend this array to support additional languages — no other code changes needed.

const LANGUAGES: Array<{
  code: SupportedLanguage;
  nativeLabel: string;
  flag: string;
}> = [
  { code: 'en', nativeLabel: 'English',  flag: '🇺🇸' },
  { code: 'ar', nativeLabel: 'العربية',  flag: '🇸🇦' },
  { code: 'he', nativeLabel: 'עברית',    flag: '🇮🇱' },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LanguageScreen() {
  const router              = useRouter();
  const { t }               = useTranslation();
  const dir                 = useDirection();
  const setLanguage         = useAppStore((s) => s.setLanguage);
  const setLanguageSelected = useAppStore((s) => s.setLanguageSelected);
  const appLanguage         = useAppStore((s) => s.appLanguage);

  const [selected, setSelected] = useState<SupportedLanguage>(
    (appLanguage as SupportedLanguage) ?? 'en',
  );

  // Entrance animation
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 480, useNativeDriver: true }),
    ]).start();
  }, []);

  // When user taps a language card, apply it immediately so the UI reflects it
  const handleSelect = (code: SupportedLanguage) => {
    setSelected(code);
    // Immediately switch i18next language so the CTA label updates in real-time
    setLanguage(code);
  };

  const handleContinue = () => {
    setLanguageSelected();
    router.replace('/auth/login' as any);
  };

  const isRTL = ['ar', 'he'].includes(selected);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Brand mark */}
        <View style={[styles.brand, { flexDirection: dir.rowDir }]}>
          <View style={styles.brandIcon}>
            <Ionicons name="layers-outline" size={26} color={Colors.gold} />
          </View>
          <Text style={styles.brandName}>LifeOS</Text>
        </View>

        {/* Headline */}
        <View style={styles.headline}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>
            {t('language_screen.title')}
          </Text>
          <Text style={[styles.subtitle, { textAlign: dir.textAlign }]}>
            {t('language_screen.subtitle')}
          </Text>
        </View>

        {/* Language options */}
        <View style={styles.optionList}>
          {LANGUAGES.map((lang) => {
            const isSelected = selected === lang.code;
            // English label from translations (or 'en' key from languages section)
            const englishLabel = t(`languages.${lang.code}`);
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => handleSelect(lang.code)}
                activeOpacity={0.75}
              >
                <View style={[styles.optionInner, { flexDirection: dir.rowDir }]}>
                  <Text style={styles.optionFlag}>{lang.flag}</Text>
                  <View style={[styles.optionText, { alignItems: dir.contentStart }]}>
                    <Text style={[styles.optionNative, isSelected && styles.optionNativeSelected]}>
                      {lang.nativeLabel}
                    </Text>
                    <Text style={styles.optionEnglish}>{englishLabel}</Text>
                  </View>
                  <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* RTL notice for Arabic / Hebrew */}
        {isRTL && (
          <View style={[styles.rtlNotice, { flexDirection: dir.rowDir }]}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
            <Text style={[styles.rtlNoticeText, { textAlign: dir.textAlign }]}>
              {t('language_screen.rtl_notice')}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* CTA pinned to bottom */}
      <View style={styles.bottom}>
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>{t('language_screen.continue')}</Text>
          <Ionicons name={dir.forwardIcon} size={16} color={Colors.textInverse} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl * 1.5,
    gap: Spacing.xxl,
  },

  brand: { alignItems: 'center', gap: Spacing.sm },
  brandIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  brandName: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold as any,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },

  headline: { gap: Spacing.xs },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold as any,
    color: Colors.textPrimary,
    lineHeight: 32,
  },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },

  optionList: { gap: Spacing.md },
  option: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  optionSelected: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldMuted,
  },
  optionInner: { alignItems: 'center', gap: Spacing.md },
  optionFlag:  { fontSize: 28 },
  optionText:  { flex: 1, gap: 2 },
  optionNative: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold as any,
    color: Colors.textSecondary,
  },
  optionNativeSelected: { color: Colors.textPrimary },
  optionEnglish: { fontSize: FontSize.xs, color: Colors.textMuted },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: Colors.gold },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.gold },

  rtlNotice: {
    alignItems: 'flex-start', gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  rtlNoticeText: { fontSize: FontSize.xs, color: Colors.textMuted, flex: 1 },

  bottom: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.md,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    ...Shadow.gold,
  },
  continueBtnText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold as any,
    color: Colors.textInverse,
    letterSpacing: 0.5,
  },
});
