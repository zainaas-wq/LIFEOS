/**
 * signup.tsx — Sign-up screen.
 * Fully localised via react-i18next. Adapts layout for RTL languages.
 * OAuth (Apple / Google) first. Email registration revealed on demand.
 *
 * Batch 2 fixes:
 *  - Email format validation (regex)
 *  - Explicit "confirm password required" check with its own error message
 *  - Real-time confirm password match indicator (hint / error on Input)
 *  - Password visibility toggle on all password fields (handled in Input)
 *  - textContentType + returnKeyType + onSubmitEditing on inputs
 *  - autoFocus on email field when form revealed
 *  - Guest mode warning modal before entering guest
 *  - Error always rendered in the same place (inside form)
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
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../src/store/useAppStore';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { signUp, signInWithOAuthProvider } from '../../src/services/authService';
import { useDirection } from '../../src/hooks/useDirection';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../src/constants/theme';

type OAuthProvider = 'google' | 'apple';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OAUTH_TIMEOUT_MS = 90_000;

export default function SignupScreen() {
  const { t }        = useTranslation();
  const dir          = useDirection();
  const setGuestMode = useAppStore((s) => s.setGuestMode);

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [confirm, setConfirm]           = useState('');
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [confirmed, setConfirmed]       = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [showEmail, setShowEmail]       = useState(false);
  const [guestWarning, setGuestWarning] = useState(false);

  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(20)).current;
  const oauthTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    return () => { if (oauthTimer.current) clearTimeout(oauthTimer.current); };
  }, []);

  // ── OAuth ──────────────────────────────────────────────────────────────────

  const handleOAuth = async (provider: OAuthProvider) => {
    setError('');
    setOauthLoading(provider);
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

  // ── Email sign-up ──────────────────────────────────────────────────────────

  const handleSignUp = async () => {
    setError('');
    const trimmedEmail    = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!trimmedEmail)                   { setError(t('auth.error_email_required'));   return; }
    if (!EMAIL_REGEX.test(trimmedEmail)) { setError(t('auth.error_email_invalid'));    return; }
    if (trimmedPassword.length < 6)      { setError(t('auth.error_password_min'));     return; }
    if (!confirm.trim())                 { setError(t('auth.error_confirm_required')); return; }
    if (trimmedPassword !== confirm.trim()) { setError(t('auth.error_passwords_no_match')); return; }
    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(trimmedEmail, trimmedPassword);
      if (needsConfirmation) setConfirmed(true);
    } catch (e: any) {
      setError(e.message ?? t('auth.error_generic'));
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

  // Real-time confirm match: shown as hint when confirm has value and matches,
  // or as error when confirm has value and doesn't match.
  const confirmHint  = confirm.length > 0 && confirm.trim() === password.trim() ? '✓ Passwords match' : undefined;
  const confirmError = confirm.length > 0 && confirm.trim() !== password.trim() ? ' ' : undefined; // red border only

  const isBusy = loading || !!oauthLoading;

  // ── Confirmation pending ───────────────────────────────────────────────────

  if (confirmed) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.confirmBox}>
          <View style={styles.confirmIconWrap}>
            <Ionicons name="mail-outline" size={28} color={Colors.gold} />
          </View>
          <Text style={[styles.confirmTitle, { textAlign: dir.textAlign }]}>
            {t('auth.confirm_email_title')}
          </Text>
          <Text style={[styles.confirmText, { textAlign: dir.textAlign }]}>
            {t('auth.confirm_email_body', { email })}
          </Text>
          <Text style={[styles.confirmSubtext, { textAlign: dir.textAlign }]}>
            {t('auth.confirm_email_sub')}
          </Text>
          <Button
            label={t('auth.back_to_signin')}
            variant="secondary"
            onPress={() => router.replace('/auth/login' as any)}
            fullWidth
          />
        </View>
      </SafeAreaView>
    );
  }

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

  // ── Main screen ────────────────────────────────────────────────────────────

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
                {t('auth.start_journey')}
              </Text>
              <Text style={[styles.subtitle, { textAlign: dir.textAlign }]}>
                {t('auth.signup_subtitle_sync')}
              </Text>
            </View>

            {/* OAuth buttons */}
            <View style={styles.oauthGroup}>
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
                    <Text style={styles.googleG}>G</Text>
                    <Text style={[styles.oauthBtnText, styles.oauthBtnTextGoogle]}>
                      {t('auth.continue_google')}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>{t('common.or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Email toggle / form */}
            {!showEmail ? (
              <>
                <TouchableOpacity
                  style={[styles.emailToggle, { flexDirection: dir.rowDir }]}
                  onPress={() => { setError(''); setShowEmail(true); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
                  <Text style={styles.emailToggleText}>{t('auth.signup_email')}</Text>
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
                  textContentType="newPassword"
                  returnKeyType="next"
                  hint="Minimum 6 characters"
                />
                <Input
                  label={t('auth.confirm_password_label')}
                  value={confirm}
                  onChangeText={(v) => { setConfirm(v); setError(''); }}
                  secureTextEntry
                  placeholder="••••••••"
                  textContentType="newPassword"
                  returnKeyType="go"
                  onSubmitEditing={handleSignUp}
                  hint={confirmHint}
                  error={confirmError}
                />
                {!!error && (
                  <Text style={[styles.errorText, { textAlign: dir.textAlign }]}>{error}</Text>
                )}
                <TouchableOpacity
                  style={[styles.createBtn, isBusy && styles.btnBusy]}
                  onPress={handleSignUp}
                  disabled={isBusy}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={Colors.textInverse} />
                  ) : (
                    <Text style={styles.createBtnText}>{t('auth.create_account')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} disabled={isBusy}>
                <Text style={[styles.footerText, { textAlign: dir.textAlign }]}>
                  {t('auth.already_account')}{'  '}
                  <Text style={styles.footerAccent}>{t('auth.sign_in_cta')}</Text>
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
    flexGrow: 1, paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl * 2, paddingBottom: Spacing.xxl,
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
  title: { fontSize: 32, fontWeight: FontWeight.bold as any, color: Colors.textPrimary, lineHeight: 40 },
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
  googleG: {
    fontSize: 18, fontWeight: FontWeight.bold as any,
    color: '#4285F4', width: 20, textAlign: 'center',
  },

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

  emailForm: { gap: Spacing.md },
  createBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.lg, minHeight: 54,
    ...Shadow.gold,
  },
  btnBusy:       { opacity: 0.6 },
  createBtnText: {
    fontSize: FontSize.md, fontWeight: FontWeight.bold as any,
    color: Colors.textInverse, letterSpacing: 0.5,
  },

  errorText:    { fontSize: FontSize.sm, color: Colors.error },
  footer:       { alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.sm },
  footerText:   { fontSize: FontSize.sm, color: Colors.textMuted },
  footerAccent: { color: Colors.gold, fontWeight: FontWeight.semibold as any },
  guestText:    { fontSize: FontSize.xs, color: Colors.textMuted, opacity: 0.6 },

  confirmBox: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  confirmIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  confirmTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.textPrimary },
  confirmText:    { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 24 },
  confirmSubtext: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },

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
