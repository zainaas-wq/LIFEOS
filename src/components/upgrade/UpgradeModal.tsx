import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadow } from '../../constants/theme';
import { track } from '../../services/analyticsService';

interface UpgradeModalProps {
  visible: boolean;
  featureName?: string;
  onDismiss: () => void;
}

export function UpgradeModal({ visible, featureName, onDismiss }: UpgradeModalProps) {
  const router = useRouter();

  useEffect(() => {
    if (visible) track('upgrade_cta_opened');
  }, [visible]);

  const handleUpgrade = () => {
    onDismiss();
    router.push('/upgrade' as any);
  };

  const handleRestore = () => {
    onDismiss();
    router.push('/upgrade' as any);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <TouchableOpacity
            onPress={onDismiss}
            style={styles.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Ionicons name="sparkles" size={24} color={Colors.gold} />
          </View>

          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>

          <Text style={styles.title}>
            {featureName ? `${featureName} is a Pro feature` : 'This is a Pro feature'}
          </Text>

          <Text style={styles.description}>
            Upgrade to Pro for advanced AI coaching, weekly planning, monthly reviews, and more.
          </Text>

          <TouchableOpacity onPress={handleUpgrade} style={styles.upgradeBtn} activeOpacity={0.85}>
            <Ionicons name="sparkles" size={15} color={Colors.textInverse} />
            <Text style={styles.upgradeBtnText}>See what Pro includes</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onDismiss} style={styles.laterBtn} activeOpacity={0.7}>
            <Text style={styles.laterBtnText}>Maybe later</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleRestore} style={styles.restoreLink} activeOpacity={0.7}>
            <Text style={styles.restoreLinkText}>Restore Purchases</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  sheet: {
    width: '100%',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: Spacing.xl,
    paddingTop: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.md,
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    zIndex: 1,
    padding: 4,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1,
    borderColor: Colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  proBadge: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  proBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
    letterSpacing: 1,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  description: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  upgradeBtn: {
    width: '100%',
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    ...Shadow.gold,
  },
  upgradeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
  laterBtn: {
    width: '100%',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  laterBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  restoreLink: {
    width: '100%',
    paddingVertical: Spacing.xs,
    alignItems: 'center',
  },
  restoreLinkText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
});
