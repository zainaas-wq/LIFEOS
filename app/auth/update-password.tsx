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
import { supabase } from '../../src/lib/supabase';
import { Input } from '../../src/components/ui/Input';
import { useDirection } from '../../src/hooks/useDirection';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../src/constants/theme';

const MIN_PW = 8;

function strengthLevel(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < MIN_PW) return 0;
  let score = 0;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}

const STRENGTH_COLOR = ['#EF4444', '#F59E0B', '#EAB308', '#22C55E'];

export default function UpdatePasswordScreen() {
  const { t } = useTranslation();
  const dir = useDirection();

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const strength = strengthLevel(password);
  const strengthColor = STRENGTH_COLOR[strength];
  const strengthLabels = [
    t('auth.password_strength_weak'),
    t('auth.password_strength_fair'),
    t('auth.password_strength_good'),
    t('auth.password_strength_strong'),
  ];

  const confirmHint  = confirm.length > 0 && confirm === password ? '✓ ' + t('auth.passwords_match') : undefined;
  const confirmError = confirm.length > 0 && confirm !== password ? ' ' : undefined;

  const handleUpdate = async () => {
    setError('');
    if (password.length < MIN_PW) { setError(t('auth.error_password_min8')); return; }
    if (!confirm)                  { setError(t('auth.error_confirm_required')); return; }
    if (password !== confirm)      { setError(t('auth.error_passwords_no_match')); return; }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      // Sign out so user re-authenticates with the new password cleanly
      await supabase.auth.signOut();
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? t('auth.error_generic'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.doneBox}>
          <View style={styles.doneIconWrap}>
            <Ionicons name="checkmark-circle-outline" size={36} color={Colors.gold} />
          </View>
          <Text style={[styles.doneTitle, { textAlign: dir.textAlign }]}>
            {t('auth.update_password_success_title')}
          </Text>
          <Text style={[styles.doneSub, { textAlign: dir.textAlign }]}>
            {t('auth.update_password_success_body')}
          </Text>
          <TouchableOpacity
            style={styles.signInBtn}
            onPress={() => router.replace('/auth/login' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.signInBtnText}>{t('auth.back_to_signin')}</Text>
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
                {t('auth.update_password_title')}
              </Text>
              <Text style={[styles.subtitle, { textAlign: dir.textAlign }]}>
                {t('auth.update_password_subtitle')}
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <Input
                label={t('auth.new_password_label')}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(''); }}
                secureTextEntry
                placeholder="••••••••"
                textContentType="newPassword"
                returnKeyType="next"
                autoFocus
                hint={t('auth.password_hint_min8')}
              />

              {/* Strength bar — shown only when user has started typing */}
              {password.length > 0 && (
                <View style={styles.strengthWrap}>
                  <View style={styles.strengthTrack}>
                    <View
                      style={[
                        styles.strengthFill,
                        {
                          width: `${((strength + 1) / 4) * 100}%` as any,
                          backgroundColor: strengthColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthLabel, { color: strengthColor }]}>
                    {strengthLabels[strength]}
                  </Text>
                </View>
              )}

              <Input
                label={t('auth.confirm_password_label')}
                value={confirm}
                onChangeText={(v) => { setConfirm(v); setError(''); }}
                secureTextEntry
                placeholder="••••••••"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={handleUpdate}
                hint={confirmHint}
                error={confirmError}
              />

              {!!error && (
                <Text style={[styles.errorText, { textAlign: dir.textAlign }]}>{error}</Text>
              )}

              <TouchableOpacity
                style={[styles.updateBtn, loading && styles.btnBusy]}
                onPress={handleUpdate}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.textInverse} />
                ) : (
                  <Text style={styles.updateBtnText}>{t('auth.update_password_btn')}</Text>
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
  root:  { flex: 1, backgroundColor: Colors.background },
  flex:  { flex: 1 },
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
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
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

  strengthWrap: { gap: 6 },
  strengthTrack: {
    height: 4, borderRadius: 2,
    backgroundColor: Colors.border, overflow: 'hidden',
  },
  strengthFill: {
    height: '100%', borderRadius: 2,
  },
  strengthLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium as any },

  updateBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.lg, minHeight: 54,
    ...Shadow.gold,
  },
  btnBusy: { opacity: 0.6 },
  updateBtnText: {
    fontSize: FontSize.md, fontWeight: FontWeight.bold as any,
    color: Colors.textInverse, letterSpacing: 0.5,
  },
  errorText: { fontSize: FontSize.sm, color: Colors.error },

  doneBox: {
    flex: 1, justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.lg,
  },
  doneIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  doneTitle: {
    fontSize: FontSize.xl, fontWeight: FontWeight.bold as any,
    color: Colors.textPrimary,
  },
  doneSub: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 24 },
  signInBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.lg, minHeight: 54,
    ...Shadow.gold, marginTop: Spacing.sm,
  },
  signInBtnText: {
    fontSize: FontSize.md, fontWeight: FontWeight.bold as any,
    color: Colors.textInverse, letterSpacing: 0.5,
  },
});
