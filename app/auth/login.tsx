/**
 * login.tsx — Sign-in screen.
 * Fully localised via react-i18next. Adapts layout for RTL languages.
 * OAuth (Apple / Google) is the primary call-to-action.
 * Email + password is revealed on demand.
 *
 * Batch 2 fixes:
 *  - Email format validation (regex)
 *  - Password whitespace trim before submit
 *  - Password visibility toggle (handled in Input component)
 *  - textContentType + returnKeyType + onSubmitEditing on inputs
 *  - autoFocus on email field when form revealed
 *  - Guest mode warning modal before entering guest
 *  - Error always rendered in the same place (inside form / below toggle)
 *  - OAuth loading state cleared on browser cancel (timeout fallback)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../src/store/useAppStore';
import { Input } from '../../src/components/ui/Input';
import { signIn, signInWithOAuthProvider } from '../../src/services/authService';
import { useDirection } from '../../src/hooks/useDirection';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../src/constants/theme';

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

type OAuthProvider = 'google' | 'apple';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OAUTH_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS     = 5;
const LOCKOUT_SECS     = 30;

export default function LoginScreen() {
  const { t }        = useTranslation();
  const dir          = useDirection();
  const setGuestMode = useAppStore((s) => s.setGuestMode);

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [showEmail, setShowEmail]       = useState(false);
  const [guestWarning, setGuestWarning] = useState(false);
  const [failCount, setFailCount]       = useState(0);
  const [lockedSecs, setLockedSecs]     = useState(0);

  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(20)).current;
  const oauthTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockTimer  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    return () => {
      if (oauthTimer.current) clearTimeout(oauthTimer.current);
      if (lockTimer.current)  clearInterval(lockTimer.current);
    };
  }, []);

  const startLockout = () => {
    setLockedSecs(LOCKOUT_SECS);
    lockTimer.current = setInterval(() => {
      setLockedSecs((s) => {
        if (s <= 1) {
          clearInterval(lockTimer.current!);
          lockTimer.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const isLocked = lockedSecs > 0;

  // ── OAuth ──────────────────────────────────────────────────────────────────

  const handleOAuth = async (provider: OAuthProvider) => {
    setError('');
    setOauthLoading(provider);
    // Safety timeout — clears spinner if user cancels or browser hangs
    oauthTimer.current = setTimeout(() => setOauthLoading(null), OAUTH_TIMEOUT_MS);
    try {
      await signInWithOAuthProvider(provider);
    } catch (e: any) {
      setError(e.message ?? t('auth.error_generic'));
    } finally {
      if (oauthTimer.current) clearTimeout(oauthTimer.current);
      setOauthLoading(null);
    }
  };

  // ── Email / password ───────────────────────────────────────────────────────

  const handleSignIn = async () => {
    if (isLocked) return;
    setError('');
    const trimmedEmail    = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!trimmedEmail)                   { setError(t('auth.error_email_required'));  return; }
    if (!EMAIL_REGEX.test(trimmedEmail)) { setError(t('auth.error_email_invalid'));   return; }
    if (!trimmedPassword)                { setError(t('auth.error_password_required')); return; }
    setLoading(true);
    try {
      await signIn(trimmedEmail, trimmedPassword);
      // Success — clear fail counter
      setFailCount(0);
    } catch (e: any) {
      const next = failCount + 1;
      setFailCount(next);
      if (next >= MAX_ATTEMPTS) {
        setError(t('auth.lockout_message', { secs: LOCKOUT_SECS }));
        startLockout();
      } else {
        setError(e.message ?? t('auth.error_generic'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestPress = () => setGuestWarning(true);

  const confirmGuest = () => {
    setGuestWarning(false);
    setGuestMode(true);
    router.replace('/');
  };

  const isBusy = loading || !!oauthLoading || isLocked;

  // ── Guest warning modal ────────────────────────────────────────────────────

  const GuestWarningModal = (
    <Modal
      visible={guestWarning}
      transparent
      animationType="fade"
      onRequestClose={() => setGuestWarning(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t('auth.guest_warning_title')}</Text>
          <Text style={styles.modalBody}>{t('auth.guest_warning_body')}</Text>
          <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmGuest} activeOpacity={0.85}>
            <Text style={styles.modalConfirmText}>{t('auth.guest_warning_confirm')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setGuestWarning(false)} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>{t('auth.guest_warning_cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.root}>
      {GuestWarningModal}
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
            {/* Brand */}
            <View style={[styles.brand, { flexDirection: dir.rowDir }]}>
              <View style={styles.brandIcon}>
                <Ionicons name="layers-outline" size={26} color={Colors.gold} />
              </View>
              <Text style={styles.brandName}>LifeOS</Text>
            </View>

            {/* Headline */}
            <View style={styles.headline}>
              <Text style={[styles.title, { textAlign: dir.textAlign }]}>
                {t('auth.welcome_back')}
              </Text>
              <Text style={[styles.subtitle, { textAlign: dir.textAlign }]}>
                {t('auth.signin_subtitle')}
              </Text>
            </View>

            {/* ── OAuth buttons ────────────────────────────────────────────── */}
            <View style={styles.oauthGroup}>
              {/* Apple — hidden on Android (no native support) */}
              {Platform.OS !== 'android' && (
                <TouchableOpacity
                  style={[styles.oauthBtn, styles.oauthBtnApple]}
                  onPress={() => handleOAuth('apple')}
                  disabled={isBusy}
                  activeOpacity={0.85}
                >
                  {oauthLoading === 'apple' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={[styles.oauthBtnInner, { flexDirection: dir.rowDir }]}>
                      <Ionicons name="logo-apple" size={20} color="#fff" />
                      <Text style={[styles.oauthBtnText, styles.oauthBtnTextApple]}>
                        {t('auth.continue_apple')}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {/* Google */}
              <TouchableOpacity
                style={[styles.oauthBtn, styles.oauthBtnGoogle]}
                onPress={() => handleOAuth('google')}
                disabled={isBusy}
                activeOpacity={0.85}
              >
                {oauthLoading === 'google' ? (
                  <ActivityIndicator size="small" color={Colors.textPrimary} />
                ) : (
                  <View style={[styles.oauthBtnInner, { flexDirection: dir.rowDir }]}>
                    <GoogleLogo size={20} />
                    <Text style={[styles.oauthBtnText, styles.oauthBtnTextGoogle]}>
                      {t('auth.continue_google')}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* ── Divider ──────────────────────────────────────────────────── */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>{t('common.or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* ── Email toggle / form ───────────────────────────────────────── */}
            {!showEmail ? (
              <>
                <TouchableOpacity
                  style={[styles.emailToggle, { flexDirection: dir.rowDir }]}
                  onPress={() => { setError(''); setShowEmail(true); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
                  <Text style={styles.emailToggleText}>{t('auth.continue_email')}</Text>
                </TouchableOpacity>
                {!!error && (
                  <Text style={[styles.errorText, { textAlign: dir.textAlign }]}>{error}</Text>
                )}
              </>
            ) : (
              <View style={styles.emailForm}>
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
                  returnKeyType="next"
                />
                <Input
                  label={t('auth.password_label')}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(''); }}
                  secureTextEntry
                  placeholder="••••••••"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={handleSignIn}
                />
                {!!error && (
                  <Text style={[styles.errorText, { textAlign: dir.textAlign }]}>{error}</Text>
                )}
                <TouchableOpacity
                  style={[styles.emailSignInBtn, isBusy && styles.btnBusy]}
                  onPress={handleSignIn}
                  disabled={isBusy}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={Colors.textInverse} />
                  ) : isLocked ? (
                    <Text style={styles.emailSignInBtnText}>
                      {t('auth.lockout_btn', { secs: lockedSecs })}
                    </Text>
                  ) : (
                    <Text style={styles.emailSignInBtnText}>{t('auth.sign_in')}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push('/auth/forgot-password' as any)}
                  activeOpacity={0.7}
                  disabled={isBusy}
                  style={styles.forgotRow}
                >
                  <Text style={styles.forgotText}>{t('auth.forgot_password')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <View style={styles.footer}>
              <TouchableOpacity
                onPress={() => router.push('/auth/signup' as any)}
                activeOpacity={0.7}
                disabled={isBusy}
              >
                <Text style={[styles.footerText, { textAlign: dir.textAlign }]}>
                  {t('auth.new_here')}{'  '}
                  <Text style={styles.footerAccent}>{t('auth.create_account_cta')}</Text>
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleGuestPress} activeOpacity={0.7} disabled={isBusy}>
                <Text style={styles.guestText}>{t('auth.no_account')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.background },
  flex:   { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl * 2,
    paddingBottom: Spacing.xxl,
  },
  inner: { gap: Spacing.xxl },

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

  oauthGroup: { gap: Spacing.md },
  oauthBtn: {
    borderRadius: Radius.lg, minHeight: 54,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, paddingHorizontal: Spacing.xl,
  },
  oauthBtnApple:  { backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  oauthBtnGoogle: { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  oauthBtnInner:  { alignItems: 'center', gap: Spacing.sm },
  oauthBtnText:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, letterSpacing: 0.2 },
  oauthBtnTextApple:  { color: '#fff' },
  oauthBtnTextGoogle: { color: Colors.textPrimary },
  divider:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dividerLine:  { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerLabel: { fontSize: FontSize.xs, color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },

  emailToggle: {
    alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: 14,
    borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.border, borderStyle: 'dashed',
  },
  emailToggleText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium as any },

  forgotRow: { alignItems: 'center', paddingTop: Spacing.xs },
  forgotText: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium as any },

  emailForm: { gap: Spacing.md },
  emailSignInBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.lg, minHeight: 54,
    ...Shadow.gold,
  },
  btnBusy:          { opacity: 0.6 },
  emailSignInBtnText: {
    fontSize: FontSize.md, fontWeight: FontWeight.bold as any,
    color: Colors.textInverse, letterSpacing: 0.5,
  },

  errorText:    { fontSize: FontSize.sm, color: Colors.error },
  footer:       { alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.sm },
  footerText:   { fontSize: FontSize.sm, color: Colors.textMuted },
  footerAccent: { color: Colors.gold, fontWeight: FontWeight.semibold as any },
  guestText:    { fontSize: FontSize.xs, color: Colors.textMuted, opacity: 0.6 },

  // ── Guest warning modal ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', paddingHorizontal: Spacing.xl,
  },
  modalCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl, padding: Spacing.xl,
    borderWidth: 1, borderColor: Colors.borderLight,
    gap: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.lg, fontWeight: FontWeight.bold as any,
    color: Colors.textPrimary, textAlign: 'center',
  },
  modalBody: {
    fontSize: FontSize.sm, color: Colors.textSecondary,
    lineHeight: 22, textAlign: 'center',
  },
  modalConfirmBtn: {
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.md, alignItems: 'center',
    marginTop: Spacing.xs,
  },
  modalConfirmText: {
    fontSize: FontSize.md, fontWeight: FontWeight.semibold as any,
    color: Colors.textInverse,
  },
  modalCancelBtn: {
    paddingVertical: Spacing.sm, alignItems: 'center',
  },
  modalCancelText: {
    fontSize: FontSize.sm, color: Colors.textMuted,
  },
});
