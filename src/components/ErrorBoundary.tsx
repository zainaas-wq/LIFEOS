/**
 * ErrorBoundary — catches unhandled React render errors and shows a
 * friendly recovery screen instead of a white/blank crash screen.
 *
 * Usage: wrap the root navigator (or any subtree) in _layout.tsx:
 *   <ErrorBoundary><Stack /></ErrorBoundary>
 *
 * The "Try again" button resets the boundary state, re-rendering the
 * children. For hard crashes that can't self-recover, the user is
 * instructed to force-close and reopen the app.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

interface Props    { children: React.ReactNode }
interface State    { hasError: boolean; retryCount: number }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, retryCount: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console in development; wire to a crash reporter in production
    console.error('[ErrorBoundary] Unhandled render error:', error.message);
    console.error(info.componentStack);
  }

  private handleRetry = () => {
    this.setState((s) => ({ hasError: false, retryCount: s.retryCount + 1 }));
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const tooManyRetries = this.state.retryCount >= 3;

    return (
      <View style={s.safe}>
        <View style={s.iconWrap}>
          <Ionicons name="warning-outline" size={32} color={Colors.gold} />
        </View>

        <Text style={s.title}>Something went wrong</Text>
        <Text style={s.body}>
          {tooManyRetries
            ? 'LifeOS keeps running into an error. Force-close and reopen the app to recover. Your data is safe.'
            : 'LifeOS hit an unexpected error. Your data is safe — tap below to try again.'}
        </Text>

        {!tooManyRetries && (
          <TouchableOpacity
            style={s.btn}
            onPress={this.handleRetry}
            activeOpacity={0.85}
          >
            <Text style={s.btnText}>Try again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  btn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xxl,
  },
  btnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
});
