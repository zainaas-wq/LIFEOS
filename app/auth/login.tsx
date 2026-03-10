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
import { signIn } from '../../src/services/authService';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';

export default function LoginScreen() {
  const setGuestMode = useAppStore((s) => s.setGuestMode);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSignIn = async () => {
    setError('');
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!password)     { setError('Password is required.'); return; }

    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // Session is picked up by onAuthStateChange in _layout.tsx.
      // Routing is handled there — no explicit navigate here.
    } catch (e: any) {
      setError(e.message ?? 'Sign in failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    setGuestMode(true);
    // _layout.tsx detects isGuestMode = true and routes to /
    router.replace('/');
  };

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
            <Text style={styles.tagline}>Your personal life operating system.</Text>
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
              placeholder="••••••••"
            />

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <Button
              label="Sign In"
              onPress={handleSignIn}
              loading={loading}
              disabled={loading}
              fullWidth
            />

            <TouchableOpacity
              onPress={() => router.push('/auth/signup' as any)}
              style={styles.linkRow}
              activeOpacity={0.7}
            >
              <Text style={styles.linkText}>
                Don't have an account?{'  '}
                <Text style={styles.linkAccent}>Sign up</Text>
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
});
