import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Input } from '../../src/components/ui/Input';
import { resetPassword } from '../../src/services/authService';
import { useDirection } from '../../src/hooks/useDirection';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../src/constants/theme';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const dir = useDirection();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleReset = async () => {
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError(t('auth.error_email_required')); return; }
    if (!EMAIL_REGEX.test(trimmed)) { setError(t('auth.error_email_invalid')); return; }
    setLoading(true);
    try {
      await resetPassword(trimmed);
      setSent(true);
    } catch (e: any) {
      setError(e.message ?? t('auth.error_generic'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.sentBox}>
          <View style={styles.sentIconWrap}>
            <Ionicons name="mail-outline" size={32} color={Colors.gold} />
          </View>
          <Text style={[styles.sentTitle, { textAlign: dir.textAlign }]}>
            {t('auth.reset_sent_title')}
          </Text>
          <Text style={[styles.sentBody, { textAlign: dir.textAlign }]}>
            {t('auth.reset_sent_body', { email })}
          </Text>
          <Text style={[styles.sentSub, { textAlign: dir.textAlign }]}>
            {t('auth.reset_sent_sub')}
          </Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace('/auth/login' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.backBtnText}>{t('auth.back_to_signin')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[styles.inner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
          >
            <TouchableOpacity
              style={[styles.backRow, { flexDirection: dir.rowDir }]}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Ionicons
                name={dir.isRTL ? 'arrow-forward' : 'arrow-back'}
                size={20}
                color={Colors.textMuted}
              />
              <Text style={styles.backRowText}>{t('auth.back_to_signin')}</Text>
            </TouchableOpacity>

            <View style={[styles.brand, { flexDirection: dir.rowDir }]}>
              <View style={styles.brandIcon}>
                <Ionicons name="layers-outline" size={26} color={Colors.gold} />
              </View>
              <Text style={styles.brandName}>LifeOS</Text>
            </View>

            <View style={styles.headline}>
              <Text style={[styles.title, { textAlign: dir.textAlign }]}>
                {t('auth.reset_title')}
              </Text>
              <Text style={[styles.subtitle, { textAlign: dir.textAlign }]}>
                {t('auth.reset_subtitle')}
              </Text>
            </View>

            <View style={styles.form}>
              <Input
                label={t('auth.email_label')}
                value={email}
                onChangeText={(v) => { setEmail(v); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                placeholder={t('auth.email_placeholder')}
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={handleReset}
              />
              {!!error && (
                <Text style={[styles.errorText, { textAlign: dir.textAlign }]}>{error}</Text>
              )}
              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.btnBusy]}
                onPress={handleReset}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.textInverse} />
                ) : (
                  <Text style={styles.submitBtnText}>{t('auth.reset_send_link')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl * 2,
    paddingBottom: Spacing.xxl,
  },
  inner: { gap: Spacing.xxl },

  backRow: { alignItems: 'center', gap: Spacing.xs },
  backRowText: { fontSize: FontSize.sm, color: Colors.textMuted },

  brand: { alignItems: 'center', gap: Spacing.sm },
  brandIcon: {
    width: 42, height: 42, borderRadius: Radius.md,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  brandName: {
    fontSize: FontSize.xl, fontWeight: FontWeight.bold as any,
    color: Colors.textPrimary, letterSpacing: 1,
  },

  headline: { gap: Spacing.xs },
  title: {
    fontSize: 32, fontWeight: FontWeight.bold as any,
    color: Colors.textPrimary, lineHeight: 40,
  },
  subtitle: { fontSize: FontSize.md, color: Colors.textMuted, lineHeight: 22 },

  form: { gap: Spacing.md },
  submitBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.lg, minHeight: 54,
    ...Shadow.gold,
  },
  btnBusy: { opacity: 0.6 },
  submitBtnText: {
    fontSize: FontSize.md, fontWeight: FontWeight.bold as any,
    color: Colors.textInverse, letterSpacing: 0.5,
  },
  errorText: { fontSize: FontSize.sm, color: Colors.error },

  sentBox: {
    flex: 1, justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.lg,
  },
  sentIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  sentTitle: {
    fontSize: FontSize.xl, fontWeight: FontWeight.bold as any,
    color: Colors.textPrimary,
  },
  sentBody: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 24 },
  sentSub: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },
  backBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg, paddingVertical: Spacing.lg, minHeight: 54,
    borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.sm,
  },
  backBtnText: {
    fontSize: FontSize.md, fontWeight: FontWeight.semibold as any,
    color: Colors.textPrimary,
  },
});
