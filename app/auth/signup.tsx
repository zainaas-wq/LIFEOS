import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../src/store/useAppStore';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { signUp } from '../../src/services/authService';
import { Colors, FontSize, FontWeight, Spacing } from '../../src/constants/theme';

export default function SignupScreen() {
  const setGuestMode = useAppStore((s) => s.setGuestMode);

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [confirmed, setConfirmed]   = useState(false); // email confirmation pending

  const handleSignUp = async () => {
    setError('');
    if (!email.trim())      { setError('Email is required.'); return; }
    if (password.length < 6){ setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm){ setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(email.trim().toLowerCase(), password);
      if (needsConfirmation) {
        setConfirmed(true);
      }
      // If no confirmation required, session fires via onAuthStateChange → routed by _layout.tsx
    } catch (e: any) {
      setError(e.message ?? 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    setGuestMode(true);
    router.replace('/');
  };

  if (confirmed) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.confirmBox}>
          <Text style={styles.confirmTitle}>Check your email</Text>
          <Text style={styles.confirmText}>
            We sent a confirmation link to{'\n'}
            <Text style={styles.confirmEmail}>{email}</Text>
          </Text>
          <Text style={styles.confirmSubtext}>
            Open the link in your email to activate your account, then come back and sign in.
          </Text>
          <Button
            label="Back to Sign In"
            variant="secondary"
            onPress={() => router.replace('/auth/login' as any)}
            fullWidth
          />
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>LifeOS</Text>
            <Text style={styles.tagline}>Create your account.</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="At least 6 characters"
            />
            <Input
              label="Confirm Password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              placeholder="••••••••"
            />

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <Button
              label="Create Account"
              onPress={handleSignUp}
              loading={loading}
              disabled={loading}
              fullWidth
            />

            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.linkRow}
              activeOpacity={0.7}
            >
              <Text style={styles.linkText}>
                Already have an account?{'  '}
                <Text style={styles.linkAccent}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Guest mode */}
          <Button
            label="Continue without account"
            variant="ghost"
            onPress={handleGuest}
            fullWidth
          />
          <Text style={styles.guestNote}>
            Data stored locally on this device only.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl * 2,
    paddingBottom: Spacing.xl,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl * 1.5,
  },
  logo: {
    fontSize: 40,
    fontWeight: FontWeight.bold as any,
    color: Colors.gold,
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  tagline: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },

  // Form
  form: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.error,
  },
  linkRow: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  linkText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  linkAccent: {
    color: Colors.gold,
    fontWeight: FontWeight.semibold as any,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Guest
  guestNote: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },

  // Email confirmation screen
  confirmBox: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  confirmTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold as any,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  confirmText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  confirmEmail: {
    color: Colors.gold,
    fontWeight: FontWeight.semibold as any,
  },
  confirmSubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
