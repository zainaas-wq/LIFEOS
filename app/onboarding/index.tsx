/**
 * app/onboarding/index.tsx — Behavior OS onboarding (5 screens)
 *
 * Screen 0: Welcome + name
 * Screen 1: User type (worker / student / worker_student / flexible)
 * Screen 2: Schedule details (conditional on user type)
 *           — flexible: wake + wind-down times
 *           — worker:   scheduleType + if fixed: work start/end
 *           — student:  scheduleType + if fixed: study start/end
 *           — worker+student: scheduleType + if fixed: both sets
 * Screen 3: Off days + skip-routines toggle
 * Screen 4: Identity goals (what user wants to become)
 *
 * On completion:
 *   - completeOnboarding() with full profile including userType/scheduleType/offDays
 *   - setIdentityGoals() for each selection
 *   - addScheduleEvent() to create recurring work/class events (fixed schedule only)
 *   - setTrialStartDate() starts the 3-day trial clock
 *   - generateControlPlanAction() generates today's plan
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Alert,
  BackHandler,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../src/store/useAppStore';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../src/constants/theme';
import { getTodayDate } from '../../src/lib/utils';
import type { UserType, ScheduleType, IdentityGoalType } from '../../src/types';

const TOTAL_STEPS = 5;

// ─── Day-of-week grid ─────────────────────────────────────────────────────────

const DOW_KEYS = ['day_sun', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat'] as const;

// ─── Identity goal options ────────────────────────────────────────────────────

const IDENTITY_TYPES: IdentityGoalType[] = [
  'disciplined', 'fit', 'career', 'studying',
  'less_distraction', 'creative', 'spiritual', 'financial', 'social',
];

const IDENTITY_ICONS: Record<IdentityGoalType, keyof typeof Ionicons.glyphMap> = {
  disciplined:       'shield-checkmark-outline',
  fit:               'barbell-outline',
  career:            'trending-up-outline',
  studying:          'book-outline',
  less_distraction:  'eye-off-outline',
  creative:          'color-palette-outline',
  spiritual:         'leaf-outline',
  financial:         'cash-outline',
  social:            'people-outline',
};

// ─── Step Dots ────────────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={s.stepDots}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[s.stepDot, i === current && s.stepDotActive]} />
      ))}
    </View>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={s.progressTrack}>
      <View style={[s.progressFill, { width: `${((step + 1) / total) * 100}%` as any }]} />
    </View>
  );
}

// ─── Identity Preview ─────────────────────────────────────────────────────────

function IdentityPreview({ selected }: { selected: IdentityGoalType[] }) {
  const { t } = useTranslation();
  if (selected.length === 0) return null;
  return (
    <View style={ip.wrap}>
      <View style={ip.header}>
        <Ionicons name="sparkles" size={12} color={Colors.gold} />
        <Text style={ip.label}>{t('onboarding.identity_preview_label')}</Text>
      </View>
      <View style={ip.chips}>
        {selected.map((type) => (
          <View key={type} style={ip.chip}>
            <Ionicons name={IDENTITY_ICONS[type]} size={11} color={Colors.gold} />
            <Text style={ip.chipText}>{t(`onboarding.identity_${type}` as any)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const ip = StyleSheet.create({
  wrap:     { backgroundColor: Colors.goldMuted, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.goldDim, padding: Spacing.md, gap: Spacing.sm },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label:    { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.8 },
  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, backgroundColor: Colors.background, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.goldDim },
  chipText: { fontSize: FontSize.xs, color: Colors.textPrimary, fontWeight: FontWeight.medium },
});

// ─── Time Input ───────────────────────────────────────────────────────────────

function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={s.timeField}>
      <Text style={s.timeLabel}>{label}</Text>
      <TextInput
        style={s.timeInput}
        value={value}
        onChangeText={onChange}
        placeholder="HH:MM"
        placeholderTextColor={Colors.textMuted}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { t } = useTranslation();

  const completeOnboarding        = useAppStore((s) => s.completeOnboarding);
  const setIdentityGoals          = useAppStore((s) => s.setIdentityGoals);
  const addScheduleEvent          = useAppStore((s) => s.addScheduleEvent);
  const generateControlPlanAction = useAppStore((s) => s.generateControlPlanAction);
  const setTrialStartDate         = useAppStore((s) => s.setTrialStartDate);
  const appLanguage               = useAppStore((s) => s.appLanguage);

  // ── Screen state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);

  // Screen 0
  const [name, setName] = useState('');

  // Screen 1
  const [userType, setUserType] = useState<UserType | null>(null);

  // Screen 2
  const [scheduleType, setSchedType] = useState<ScheduleType>('fixed');
  const [workStart,    setWorkStart] = useState('09:00');
  const [workEnd,      setWorkEnd]   = useState('17:00');
  const [studyStart,   setStudyStart] = useState('09:00');
  const [studyEnd,     setStudyEnd]   = useState('14:00');
  const [wakeTime,     setWakeTime]   = useState('07:00');
  const [windDown,     setWindDown]   = useState('22:00');
  const [timeError,    setTimeError]  = useState('');

  // Screen 3
  const [offDays, setOffDays]             = useState<number[]>([]);
  const [skipOnOffDays, setSkipOnOffDays] = useState(true);

  // Screen 4
  const [identityGoals, setLocalIdentity] = useState<IdentityGoalType[]>([]);

  // Welcome entrance animation
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true, delay: 80 }),
    ]).start();
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const isValidTime = (v: string) => /^\d{2}:\d{2}$/.test(v) && v < '24:00';

  const toggleOffDay = (day: number) =>
    setOffDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );

  const toggleIdentity = (type: IdentityGoalType) =>
    setLocalIdentity((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );

  // ── Navigation ───────────────────────────────────────────────────────────────

  const handleBack = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const confirmLeave = useCallback(() => {
    Alert.alert(
      t('onboarding.leave_setup_title'),
      t('onboarding.leave_setup_msg'),
      [
        { text: t('onboarding.leave_setup_cancel'), style: 'cancel' },
        { text: t('onboarding.leave_setup_confirm'), style: 'destructive', onPress: () => router.replace('/auth/login' as any) },
      ],
    );
  }, [t]);

  // Android hardware back — intercept to prevent navigating out of onboarding
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      if (step === 0) {
        confirmLeave();
      } else {
        handleBack();
      }
      return true; // prevent default back behaviour
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [step, handleBack, confirmLeave]);

  const handleNext = () => {
    setTimeError('');

    if (step === 1 && !userType) return; // type must be selected

    if (step === 2) {
      const needsWorkTime  = userType === 'worker' || userType === 'worker_student';
      const needsStudyTime = userType === 'student' || userType === 'worker_student';
      const isFixed        = scheduleType === 'fixed';

      if (userType === 'flexible') {
        if (!isValidTime(wakeTime) || !isValidTime(windDown) || wakeTime >= windDown) {
          setTimeError(t('onboarding.time_error'));
          return;
        }
      } else if (isFixed) {
        if (needsWorkTime && (!isValidTime(workStart) || !isValidTime(workEnd) || workStart >= workEnd)) {
          setTimeError(t('onboarding.time_error'));
          return;
        }
        if (needsStudyTime && (!isValidTime(studyStart) || !isValidTime(studyEnd) || studyStart >= studyEnd)) {
          setTimeError(t('onboarding.time_error'));
          return;
        }
      }
    }

    setStep((s) => s + 1);
  };

  // ── Complete ─────────────────────────────────────────────────────────────────

  const handleComplete = () => {
    const today = getTodayDate();
    const isFixed  = scheduleType === 'fixed';
    const isWorker = userType === 'worker' || userType === 'worker_student';
    const isStud   = userType === 'student' || userType === 'worker_student';

    // Determine wake/wind-down for the profile window
    const profileStart = userType === 'flexible' ? wakeTime   : (isWorker ? workStart : studyStart);
    const profileEnd   = userType === 'flexible' ? windDown   : (isWorker ? workEnd   : studyEnd);

    completeOnboarding({
      name:                 name.trim() || undefined,
      userType:             userType ?? 'flexible',
      scheduleType,
      offDays,
      skipTasksOnOffDays:   skipOnOffDays,
      fixedScheduleStart:   profileStart,
      fixedScheduleEnd:     profileEnd,
      mainFocus:            identityGoals[0] ?? 'growth',
      biggestDistraction:   '',
      habitToRemove:        '',
      habitToBuild:         '',
      seriousnessScore:     8,
      language:             appLanguage,
    });

    // Identity goals
    const now = new Date().toISOString();
    if (identityGoals.length > 0) {
      setIdentityGoals(
        identityGoals.map((type) => ({ id: `ig-${type}`, type, createdAt: now })),
      );
    }

    // Create recurring ScheduleEvents for fixed schedules (work + study)
    // These populate the Priority B source in scheduleInputService.
    if (isFixed) {
      const activeDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !offDays.includes(d));
      if (isWorker && isValidTime(workStart) && isValidTime(workEnd)) {
        addScheduleEvent({
          title: 'Work',
          start: workStart,
          end:   workEnd,
          category: 'work',
          recurring: true,
          daysOfWeek: activeDays,
        });
      }
      if (isStud && isValidTime(studyStart) && isValidTime(studyEnd)) {
        addScheduleEvent({
          title: 'Study / Class',
          start: studyStart,
          end:   studyEnd,
          category: 'class',
          recurring: true,
          daysOfWeek: activeDays,
        });
      }
    }

    setTrialStartDate(now);
    generateControlPlanAction(today);
    router.replace('/(tabs)/home');
  };

  // ── Screen 0: Welcome ────────────────────────────────────────────────────────

  if (step === 0) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <ProgressBar step={0} total={TOTAL_STEPS} />
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View
            style={[s.welcomeRoot, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
          >
            {/* Back to auth (top-left) */}
            <TouchableOpacity onPress={confirmLeave} style={s.backToAuth} activeOpacity={0.7}>
              <Text style={s.backToAuthText}>{t('onboarding.back_to_auth')}</Text>
            </TouchableOpacity>

            <View style={s.brand}>
              <View style={s.logoMark}>
                <Ionicons name="layers-outline" size={18} color={Colors.gold} />
              </View>
              <Text style={s.logoText}>LifeOS</Text>
            </View>

            <StepDots current={0} total={TOTAL_STEPS} />

            <View style={s.welcomeCopy}>
              <Text style={s.welcomeTitle}>{t('onboarding.welcome_title')}</Text>
              <Text style={s.welcomeSub}>{t('onboarding.welcome_sub')}</Text>
            </View>

            <TextInput
              style={s.nameInput}
              placeholder={t('onboarding.welcome_name')}
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={setName}
              returnKeyType="done"
              onSubmitEditing={handleNext}
            />

            <TouchableOpacity style={s.cta} onPress={handleNext} activeOpacity={0.85}>
              <Text style={s.ctaText}>{t('onboarding.get_started')}</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.textInverse} />
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Screen 1: User Type ───────────────────────────────────────────────────────

  if (step === 1) {
    const types: { key: UserType; icon: keyof typeof Ionicons.glyphMap }[] = [
      { key: 'worker',         icon: 'briefcase-outline' },
      { key: 'student',        icon: 'school-outline' },
      { key: 'worker_student', icon: 'layers-outline' },
      { key: 'flexible',       icon: 'color-wand-outline' },
    ];

    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.screenRoot}>
          <ProgressBar step={1} total={TOTAL_STEPS} />
          <ScrollView contentContainerStyle={s.content}>
            <StepDots current={1} total={TOTAL_STEPS} />
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{t('onboarding.user_type_title')}</Text>
              <Text style={s.sectionSub}>{t('onboarding.user_type_sub')}</Text>
            </View>

            <View style={s.typeGrid}>
              {types.map(({ key, icon }) => {
                const active = userType === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[s.typeCard, active && s.typeCardActive]}
                    onPress={() => setUserType(key)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.typeIconBox, active && s.typeIconBoxActive]}>
                      <Ionicons name={icon} size={20} color={active ? Colors.gold : Colors.textMuted} />
                    </View>
                    <Text style={[s.typeLabel, active && s.typeLabelActive]}>
                      {t(`onboarding.type_${key}` as any)}
                    </Text>
                    <Text style={[s.typeDesc, active && s.typeDescActive]} numberOfLines={2}>
                      {t(`onboarding.type_${key}_desc` as any)}
                    </Text>
                    {active && (
                      <View style={s.typeCheck}>
                        <Ionicons name="checkmark" size={10} color={Colors.gold} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={s.nav}>
            <TouchableOpacity onPress={handleBack} style={s.navBack} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
              <Text style={s.navBackText}>{t('onboarding.back')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNext}
              style={[s.navNext, !userType && s.navNextDisabled]}
              disabled={!userType}
              activeOpacity={0.85}
            >
              <Text style={s.navNextText}>{t('onboarding.continue')}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textInverse} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Screen 2: Schedule Details ────────────────────────────────────────────────

  if (step === 2) {
    const isFlexible    = userType === 'flexible';
    const isWorkerType  = userType === 'worker' || userType === 'worker_student';
    const isStudentType = userType === 'student' || userType === 'worker_student';
    const isFixed       = scheduleType === 'fixed';

    const schedTypeTitle = isFlexible
      ? t('onboarding.schedule_details_title_flex')
      : isWorkerType && !isStudentType
        ? t('onboarding.schedule_details_title_work')
        : t('onboarding.schedule_details_title_study');

    const schedOptions: { key: ScheduleType; icon: keyof typeof Ionicons.glyphMap }[] = [
      { key: 'fixed',        icon: 'calendar-outline' },
      { key: 'weekly_known', icon: 'refresh-outline' },
      { key: 'daily_input',  icon: 'pencil-outline' },
    ];

    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.screenRoot}>
            <ProgressBar step={2} total={TOTAL_STEPS} />
            <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
              <StepDots current={2} total={TOTAL_STEPS} />
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>{schedTypeTitle}</Text>
              </View>

              {/* Flexible: just wake / wind-down */}
              {isFlexible ? (
                <View style={s.timeRow}>
                  <TimeInput
                    label={t('onboarding.wake_label')}
                    value={wakeTime}
                    onChange={(v) => { setWakeTime(v); setTimeError(''); }}
                  />
                  <View style={s.timeSep}><Text style={s.timeSepText}>→</Text></View>
                  <TimeInput
                    label={t('onboarding.wind_down_label')}
                    value={windDown}
                    onChange={(v) => { setWindDown(v); setTimeError(''); }}
                  />
                </View>
              ) : (
                <>
                  {/* Schedule type picker */}
                  <View style={s.schedOptions}>
                    {schedOptions.map(({ key, icon }) => {
                      const active = scheduleType === key;
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[s.schedOption, active && s.schedOptionActive]}
                          onPress={() => { setSchedType(key); setTimeError(''); }}
                          activeOpacity={0.75}
                        >
                          <Ionicons name={icon} size={16} color={active ? Colors.gold : Colors.textMuted} />
                          <View style={s.schedOptionText}>
                            <Text style={[s.schedOptionLabel, active && s.schedOptionLabelActive]}>
                              {t(`onboarding.sched_${key === 'weekly_known' ? 'weekly' : key === 'daily_input' ? 'daily' : 'fixed'}` as any)}
                            </Text>
                            <Text style={s.schedOptionDesc} numberOfLines={1}>
                              {t(`onboarding.sched_${key === 'weekly_known' ? 'weekly' : key === 'daily_input' ? 'daily' : 'fixed'}_desc` as any)}
                            </Text>
                          </View>
                          {active && <Ionicons name="checkmark-circle" size={16} color={Colors.gold} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Time inputs — only shown for fixed schedule */}
                  {isFixed && (
                    <View style={s.timeSection}>
                      {isWorkerType && (
                        <>
                          <Text style={s.timeSectionLabel}>
                            {userType === 'worker_student'
                              ? `🏢 ${t('onboarding.schedule_details_title_work')}`
                              : t('onboarding.schedule_details_title_work')}
                          </Text>
                          <View style={s.timeRow}>
                            <TimeInput
                              label={t('onboarding.work_start_label')}
                              value={workStart}
                              onChange={(v) => { setWorkStart(v); setTimeError(''); }}
                            />
                            <View style={s.timeSep}><Text style={s.timeSepText}>→</Text></View>
                            <TimeInput
                              label={t('onboarding.work_end_label')}
                              value={workEnd}
                              onChange={(v) => { setWorkEnd(v); setTimeError(''); }}
                            />
                          </View>
                        </>
                      )}

                      {isStudentType && (
                        <>
                          <Text style={[s.timeSectionLabel, isWorkerType && { marginTop: Spacing.md }]}>
                            {userType === 'worker_student'
                              ? `📚 ${t('onboarding.schedule_details_title_study')}`
                              : t('onboarding.schedule_details_title_study')}
                          </Text>
                          <View style={s.timeRow}>
                            <TimeInput
                              label={t('onboarding.study_start_label')}
                              value={studyStart}
                              onChange={(v) => { setStudyStart(v); setTimeError(''); }}
                            />
                            <View style={s.timeSep}><Text style={s.timeSepText}>→</Text></View>
                            <TimeInput
                              label={t('onboarding.study_end_label')}
                              value={studyEnd}
                              onChange={(v) => { setStudyEnd(v); setTimeError(''); }}
                            />
                          </View>
                        </>
                      )}
                    </View>
                  )}

                  {/* Hint for non-fixed schedule types */}
                  {!isFixed && (
                    <View style={s.schedHint}>
                      <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
                      <Text style={s.schedHintText}>
                        {scheduleType === 'daily_input'
                          ? t('onboarding.sched_daily_desc')
                          : t('onboarding.sched_weekly_desc')}
                      </Text>
                    </View>
                  )}
                </>
              )}

              {!!timeError && <Text style={s.errorText}>{timeError}</Text>}
            </ScrollView>

            <View style={s.nav}>
              <TouchableOpacity onPress={handleBack} style={s.navBack} activeOpacity={0.7}>
                <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
                <Text style={s.navBackText}>{t('onboarding.back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNext} style={s.navNext} activeOpacity={0.85}>
                <Text style={s.navNextText}>{t('onboarding.continue')}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.textInverse} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Screen 3: Off Days ────────────────────────────────────────────────────────

  if (step === 3) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.screenRoot}>
          <ProgressBar step={3} total={TOTAL_STEPS} />
          <ScrollView contentContainerStyle={s.content}>
            <StepDots current={3} total={TOTAL_STEPS} />
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{t('onboarding.off_days_title')}</Text>
              <Text style={s.sectionSub}>{t('onboarding.off_days_sub')}</Text>
            </View>

            {/* Day grid */}
            <View style={s.dayGrid}>
              {DOW_KEYS.map((key, i) => {
                const active = offDays.includes(i);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[s.dayChip, active && s.dayChipActive]}
                    onPress={() => toggleOffDay(i)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.dayChipText, active && s.dayChipTextActive]}>
                      {t(`onboarding.${key}` as any)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {offDays.length === 0 && (
              <Text style={s.offDaysNoneHint}>{t('onboarding.off_days_none')}</Text>
            )}

            {/* Skip routines toggle */}
            <View style={s.toggleRow}>
              <View style={s.toggleText}>
                <Text style={s.toggleLabel}>{t('onboarding.skip_routines_label')}</Text>
              </View>
              <Switch
                value={skipOnOffDays}
                onValueChange={setSkipOnOffDays}
                trackColor={{ false: Colors.surfaceHigh, true: Colors.goldMuted }}
                thumbColor={skipOnOffDays ? Colors.gold : Colors.textMuted}
              />
            </View>
          </ScrollView>

          <View style={s.nav}>
            <TouchableOpacity onPress={handleBack} style={s.navBack} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
              <Text style={s.navBackText}>{t('onboarding.back')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNext} style={s.navNext} activeOpacity={0.85}>
              <Text style={s.navNextText}>{t('onboarding.continue')}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textInverse} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Screen 4: Identity Goals ──────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.screenRoot}>
        <ProgressBar step={4} total={TOTAL_STEPS} />
        <ScrollView contentContainerStyle={s.content}>
          <StepDots current={4} total={TOTAL_STEPS} />
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{t('onboarding.identity_title')}</Text>
            <Text style={s.sectionSub}>{t('onboarding.identity_sub')}</Text>
          </View>

          <View style={s.identityGrid}>
            {IDENTITY_TYPES.map((type) => {
              const active = identityGoals.includes(type);
              return (
                <TouchableOpacity
                  key={type}
                  style={[s.identityCard, active && s.identityCardActive]}
                  onPress={() => toggleIdentity(type)}
                  activeOpacity={0.75}
                >
                  <View style={[s.identityIconBox, active && s.identityIconBoxActive]}>
                    <Ionicons
                      name={IDENTITY_ICONS[type]}
                      size={16}
                      color={active ? Colors.gold : Colors.textMuted}
                    />
                  </View>
                  <Text style={[s.identityLabel, active && s.identityLabelActive]} numberOfLines={2}>
                    {t(`onboarding.identity_${type}` as any)}
                  </Text>
                  {active && (
                    <View style={s.identityCheck}>
                      <Ionicons name="checkmark" size={10} color={Colors.gold} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Identity selection preview */}
          <IdentityPreview selected={identityGoals} />
        </ScrollView>

        <View style={s.nav}>
          <TouchableOpacity onPress={handleBack} style={s.navBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
            <Text style={s.navBackText}>{t('onboarding.back')}</Text>
          </TouchableOpacity>
          <View style={s.navRight}>
            <TouchableOpacity
              onPress={() => {
                if (identityGoals.length > 0) {
                  Alert.alert(
                    t('onboarding.identity_skip'),
                    t('onboarding.identity_skip_confirm'),
                    [
                      { text: t('onboarding.leave_setup_cancel'), style: 'cancel' },
                      { text: t('onboarding.identity_skip_confirm_btn'), style: 'destructive', onPress: handleComplete },
                    ],
                  );
                } else {
                  handleComplete();
                }
              }}
              style={s.navSkip}
              activeOpacity={0.7}
            >
              <Text style={s.navSkipText}>{t('onboarding.identity_skip')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleComplete}
              style={[s.navNext, identityGoals.length === 0 && s.navNextMuted]}
              activeOpacity={0.85}
            >
              <Text style={s.navNextText}>{t('onboarding.identity_cta')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: Colors.background },
  flex:       { flex: 1 },
  screenRoot: { flex: 1, backgroundColor: Colors.background },

  // Progress bar
  progressTrack: { height: 3, backgroundColor: Colors.surfaceHigh },
  progressFill:  { height: '100%', backgroundColor: Colors.gold },

  // Step dots
  stepDots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  stepDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.surfaceHigh },
  stepDotActive: { width: 18, backgroundColor: Colors.gold },

  // Content
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },

  // Section header
  sectionHeader: { gap: Spacing.xs },
  sectionTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  sectionSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  // Welcome screen
  welcomeRoot: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
    justifyContent: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  logoMark: {
    width: 34, height: 34, borderRadius: Radius.md,
    backgroundColor: Colors.goldMuted,
    borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: 1 },
  welcomeCopy: { gap: Spacing.sm },
  welcomeTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  welcomeSub: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 24 },
  nameInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingVertical: 18,
    ...Shadow.gold,
  },
  ctaText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textInverse },

  // User type grid — 2×2
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeCard: {
    width: '47%',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
    position: 'relative',
  },
  typeCardActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  typeIconBox: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  typeIconBoxActive: { backgroundColor: Colors.goldMuted },
  typeLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, marginTop: 2 },
  typeLabelActive: { color: Colors.gold },
  typeDesc: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16 },
  typeDescActive: { color: Colors.goldDim },
  typeCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },

  // Schedule type options
  schedOptions: { gap: Spacing.sm },
  schedOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  schedOptionActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  schedOptionText: { flex: 1, gap: 2 },
  schedOptionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  schedOptionLabelActive: { color: Colors.gold },
  schedOptionDesc: { fontSize: FontSize.xs, color: Colors.textMuted },
  schedHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
  },
  schedHintText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18 },

  // Time inputs
  timeSection: { gap: Spacing.sm },
  timeSectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, letterSpacing: 0.4 },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs },
  timeField: { flex: 1, gap: Spacing.xs },
  timeLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium, letterSpacing: 0.5 },
  timeInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  timeSep: { paddingBottom: Spacing.md, paddingHorizontal: 2 },
  timeSepText: { fontSize: FontSize.lg, color: Colors.textMuted },

  // Off days
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  dayChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  dayChipActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  dayChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary },
  dayChipTextActive: { color: Colors.gold },
  offDaysNoneHint: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleText: { flex: 1 },
  toggleLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary },

  // Identity goals
  identityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  identityCard: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    position: 'relative',
  },
  identityCardActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  identityIconBox: {
    width: 28, height: 28, borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  identityIconBoxActive: { backgroundColor: Colors.goldMuted },
  identityLabel: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.textSecondary, lineHeight: 16 },
  identityLabelActive: { color: Colors.gold },
  identityCheck: {
    position: 'absolute', top: 6, right: 6,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },

  // Navigation
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  navBack: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, padding: Spacing.sm },
  navBackText: { fontSize: FontSize.md, color: Colors.textSecondary },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  navSkip: { padding: Spacing.sm },
  navSkipText: { fontSize: FontSize.sm, color: Colors.textMuted },
  navNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.lg,
    ...Shadow.gold,
  },
  navNextDisabled: { opacity: 0.35 },
  navNextMuted:    { opacity: 0.6 },
  navNextText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },

  errorText: { fontSize: FontSize.sm, color: Colors.error },

  // Back to auth (step 0)
  backToAuth:     { alignSelf: 'flex-start', paddingVertical: 4 },
  backToAuthText: { fontSize: FontSize.sm, color: Colors.textMuted },
});
