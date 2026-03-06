import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { RuleItem } from '../../src/components/RuleItem';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Card } from '../../src/components/ui/Card';
import { SectionHeader } from '../../src/components/SectionHeader';
import { getRulesAtCapacity, getRuleMotivation, evaluateRuleCompliance, FREE_PLAN_RULE_LIMIT } from '../../src/lib/rulesEngine';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import type { RuleType } from '../../src/types';

const RULE_TYPES: { value: RuleType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'screen', label: 'Screen',  icon: 'phone-portrait-outline' },
  { value: 'focus',  label: 'Focus',   icon: 'eye-outline'            },
  { value: 'sleep',  label: 'Sleep',   icon: 'moon-outline'           },
  { value: 'study',  label: 'Study',   icon: 'book-outline'           },
];

export default function RulesScreen() {
  const rules = useAppStore((s) => s.rules);
  const profile = useAppStore((s) => s.profile);
  const addRule = useAppStore((s) => s.addRule);
  const toggleRule = useAppStore((s) => s.toggleRule);
  const toggleRuleFollowed = useAppStore((s) => s.toggleRuleFollowed);
  const deleteRule = useAppStore((s) => s.deleteRule);

  const isPro = profile?.isPro ?? false;
  const atCapacity = getRulesAtCapacity(rules, isPro);
  const compliance = evaluateRuleCompliance(rules);

  const [modalVisible, setModalVisible] = useState(false);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleType, setRuleType] = useState<RuleType>('screen');
  const [ruleStart, setRuleStart] = useState('');
  const [ruleEnd, setRuleEnd] = useState('');
  const [addError, setAddError] = useState('');

  const resetForm = () => {
    setRuleTitle(''); setRuleType('screen');
    setRuleStart(''); setRuleEnd(''); setAddError('');
  };

  const handleAddRule = () => {
    if (!ruleTitle.trim()) {
      setAddError('Please enter a rule title.');
      return;
    }

    const added = addRule({
      title: ruleTitle.trim(),
      enabled: true,
      type: ruleType,
      startTime: ruleStart.trim() || undefined,
      endTime: ruleEnd.trim() || undefined,
    });

    if (!added) {
      setAddError(`Free plan is limited to ${FREE_PLAN_RULE_LIMIT} active rules. Deactivate one or upgrade to Pro.`);
      return;
    }

    resetForm();
    setModalVisible(false);
  };

  const activeRules = rules.filter((r) => r.enabled);
  const inactiveRules = rules.filter((r) => !r.enabled);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.screenLabel}>Rules</Text>
            <Text style={styles.screenTitle}>Your Standards</Text>
          </View>
          <TouchableOpacity
            onPress={() => { resetForm(); setModalVisible(true); }}
            style={styles.addBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={22} color={Colors.gold} />
          </TouchableOpacity>
        </View>

        {/* Compliance Overview */}
        {rules.length > 0 && (
          <Card gold style={styles.complianceCard}>
            <View style={styles.complianceRow}>
              <View style={styles.complianceStat}>
                <Text style={styles.complianceNum}>{compliance.followed}</Text>
                <Text style={styles.complianceDen}>/ {compliance.total}</Text>
                <Text style={styles.complianceLabel}>followed today</Text>
              </View>
              <View style={styles.complianceDivider} />
              <View style={styles.complianceStat}>
                <Text style={styles.complianceNum}>
                  {Math.round(compliance.complianceRate * 100)}%
                </Text>
                <Text style={styles.complianceLabel}>compliance rate</Text>
              </View>
            </View>
            <Text style={styles.motivation}>
              {getRuleMotivation(compliance.complianceRate)}
            </Text>
          </Card>
        )}

        {/* Free plan notice */}
        {!isPro && (
          <View style={styles.planNotice}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.planNoticeText}>
              {activeRules.length}/{FREE_PLAN_RULE_LIMIT} active rules — Free plan
            </Text>
          </View>
        )}

        {/* Active Rules */}
        {activeRules.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Active Rules" />
            {activeRules.map((rule) => (
              <RuleItem
                key={rule.id}
                rule={rule}
                onToggleActive={() => toggleRule(rule.id)}
                onToggleFollowed={() => toggleRuleFollowed(rule.id)}
                onDelete={() => deleteRule(rule.id)}
                locked={atCapacity && !rule.enabled}
              />
            ))}
          </View>
        )}

        {/* Inactive Rules */}
        {inactiveRules.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Inactive" />
            {inactiveRules.map((rule) => (
              <RuleItem
                key={rule.id}
                rule={rule}
                onToggleActive={() => toggleRule(rule.id)}
                onToggleFollowed={() => toggleRuleFollowed(rule.id)}
                onDelete={() => deleteRule(rule.id)}
                locked={atCapacity && !rule.enabled}
              />
            ))}
          </View>
        )}

        {/* Empty state */}
        {rules.length === 0 && (
          <Card style={styles.emptyCard}>
            <Ionicons name="shield-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No rules yet</Text>
            <Text style={styles.emptyText}>
              Rules define who you are when no one is watching.{'\n'}
              Start with one non-negotiable standard.
            </Text>
            <Button
              label="Add First Rule"
              onPress={() => { resetForm(); setModalVisible(true); }}
              variant="ghost"
              size="sm"
            />
          </Card>
        )}
      </ScrollView>

      {/* Add Rule Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Rule</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalHint}>
                A rule is a standard you hold yourself to — unconditionally.
              </Text>

              <Input
                label="Rule"
                value={ruleTitle}
                onChangeText={(t) => { setRuleTitle(t); setAddError(''); }}
                placeholder="e.g. No phone before 10AM"
                autoFocus
                error={addError}
              />

              {/* Type picker */}
              <View>
                <Text style={styles.fieldLabel}>Type</Text>
                <View style={styles.typeGrid}>
                  {RULE_TYPES.map(({ value, label, icon }) => {
                    const active = ruleType === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setRuleType(value)}
                        style={[styles.typeBtn, active && styles.typeBtnActive]}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={icon}
                          size={16}
                          color={active ? Colors.gold : Colors.textMuted}
                        />
                        <Text style={[styles.typeBtnText, active && styles.typeBtnTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Optional time window */}
              <View style={styles.timeRow}>
                <Input
                  label="Active from (optional)"
                  value={ruleStart}
                  onChangeText={setRuleStart}
                  placeholder="21:00"
                  containerStyle={styles.half}
                  keyboardType="numbers-and-punctuation"
                />
                <Input
                  label="Until (optional)"
                  value={ruleEnd}
                  onChangeText={setRuleEnd}
                  placeholder="23:59"
                  containerStyle={styles.half}
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              {atCapacity && (
                <View style={styles.limitWarning}>
                  <Ionicons name="lock-closed-outline" size={14} color={Colors.gold} />
                  <Text style={styles.limitWarningText}>
                    You've reached the {FREE_PLAN_RULE_LIMIT}-rule limit on Free. New rules will be inactive until you deactivate one or upgrade.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button
                label="Cancel"
                onPress={() => setModalVisible(false)}
                variant="secondary"
                style={styles.modalBtn}
              />
              <Button
                label="Add Rule"
                onPress={handleAddRule}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  screenLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  screenTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 2 },
  addBtn: {
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  complianceCard: { gap: Spacing.md },
  complianceRow: { flexDirection: 'row', alignItems: 'center' },
  complianceStat: { flex: 1, alignItems: 'center', gap: 2 },
  complianceNum: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.gold },
  complianceDen: { fontSize: FontSize.sm, color: Colors.textMuted, position: 'absolute', right: '15%', top: 8 },
  complianceLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  complianceDivider: { width: 1, height: 40, backgroundColor: Colors.goldDim, opacity: 0.5 },
  motivation: { fontSize: FontSize.sm, color: Colors.gold, fontStyle: 'italic', textAlign: 'center' },
  planNotice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  planNoticeText: { fontSize: FontSize.xs, color: Colors.textMuted },
  section: { gap: Spacing.xs },
  emptyCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalBody: { padding: Spacing.lg, gap: Spacing.md },
  modalHint: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20, fontStyle: 'italic' },
  fieldLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },
  typeGrid: { flexDirection: 'row', gap: Spacing.sm },
  typeBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', gap: 4,
  },
  typeBtnActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  typeBtnText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  typeBtnTextActive: { color: Colors.gold },
  timeRow: { flexDirection: 'row', gap: Spacing.md },
  half: { flex: 1 },
  limitWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    backgroundColor: Colors.goldMuted, borderRadius: Radius.sm, padding: Spacing.sm,
  },
  limitWarningText: { flex: 1, fontSize: FontSize.xs, color: Colors.gold, lineHeight: 18 },
  modalFooter: {
    flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  modalBtn: { flex: 1 },
});
