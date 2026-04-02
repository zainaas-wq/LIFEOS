import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PRIVACY } from '../../src/legal/legalContent';
import { Colors, FontSize, FontWeight, Spacing } from '../../src/constants/theme';

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Nav bar */}
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Legal</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.title}>{PRIVACY.title}</Text>
        <Text style={styles.lastUpdated}>Last Updated: {PRIVACY.lastUpdated}</Text>

        {/* Intro */}
        {PRIVACY.intro && <Text style={styles.intro}>{PRIVACY.intro}</Text>}

        <View style={styles.divider} />

        {/* Sections */}
        {PRIVACY.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        {/* Contact */}
        <View style={styles.contactBlock}>
          <Text style={styles.contactLabel}>Contact</Text>
          <Text style={styles.contactText}>{PRIVACY.contact}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    padding: 4,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  navSpacer: {
    width: 30,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  lastUpdated: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  intro: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeading: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  sectionBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  contactBlock: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contactLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  contactText: {
    fontSize: FontSize.sm,
    color: Colors.gold,
  },
});
