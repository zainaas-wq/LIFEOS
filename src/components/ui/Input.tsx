import React, { useState } from 'react';
import {
  TextInput,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Radius, Spacing } from '../../constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function Input({ label, hint, error, containerStyle, secureTextEntry, ...props }: InputProps) {
  const [focused, setFocused]       = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = secureTextEntry === true;
  const actualSecure = isPassword ? !showPassword : false;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputWrapper}>
        <TextInput
          {...props}
          secureTextEntry={actualSecure}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          placeholderTextColor={Colors.textMuted}
          style={[
            styles.input,
            focused && styles.inputFocused,
            !!error && styles.inputError,
            isPassword && styles.inputWithIcon,
            props.style,
          ]}
        />
        {isPassword && (
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showPassword ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={Colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  inputWithIcon: {
    paddingRight: 44,
  },
  inputFocused: {
    borderColor: Colors.gold,
  },
  inputError: {
    borderColor: Colors.error,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    padding: 2,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  error: {
    fontSize: FontSize.xs,
    color: Colors.error,
  },
});
