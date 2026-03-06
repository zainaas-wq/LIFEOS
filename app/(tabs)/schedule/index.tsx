import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../../../src/store/useAppStore';
import { Card } from '../../../src/components/ui/Card';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Input';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../../src/constants/theme';
import type { ScheduleEvent, EventCategory } from '../../../src/types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CATEGORIES: { value: EventCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'class',    label: 'Class',    icon: 'school-outline'    },
  { value: 'work',     label: 'Work',     icon: 'briefcase-outline' },
  { value: 'health',   label: 'Health',   icon: 'fitness-outline'   },
  { value: 'personal', label: 'Personal', icon: 'person-outline'    },
  { value: 'social',   label: 'Social',   icon: 'people-outline'    },
  { value: 'other',    label: 'Other',    icon: 'ellipsis-horizontal-outline' },
];

const CATEGORY_COLOR: Record<EventCategory, string> = {
  class:    '#6C8EBF',
  work:     Colors.gold,
  health:   '#4ADE80',
  personal: '#F472B6',
  social:   '#A78BFA',
  other:    Colors.textMuted,
};

export default function ScheduleScreen() {
  const scheduleEvents = useAppStore((s) => s.scheduleEvents);
  const addScheduleEvent = useAppStore((s) => s.addScheduleEvent);
  const deleteScheduleEvent = useAppStore((s) => s.deleteScheduleEvent);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1); // Monday default

  // Form state
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [formDays, setFormDays] = useState<number[]>([1]); // multi-select
  const [category, setCategory] = useState<EventCategory>('class');
  const [error, setError] = useState('');

  const toggleFormDay = (day: number) => {
    setFormDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleAdd = () => {
    if (!title.trim()) { setError('Event title is required.'); return; }
    if (start >= end) { setError('End time must be after start time.'); return; }
    if (formDays.length === 0) { setError('Select at least one day.'); return; }
    addScheduleEvent({
      title: title.trim(),
      start,
      end,
      category,
      daysOfWeek: [...formDays].sort(),
      location: location.trim() || undefined,
      recurring: true,
    });
    resetForm();
    setModalVisible(false);
  };

  const resetForm = () => {
    setTitle(''); setLocation(''); setStart('09:00');
    setEnd('10:00'); setFormDays([selectedDay]); setCategory('class'); setError('');
  };

  const eventsForDay = (day: number) =>
    scheduleEvents
      .filter((e) => e.daysOfWeek.includes(day))
      .sort((a, b) => a.start.localeCompare(b.start));

  const totalEvents = scheduleEvents.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.screenLabel}>Schedule</Text>
            <Text style={styles.screenTitle}>Weekly Events</Text>
          </View>
          <View style={styles.headerBtns}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/schedule/import' as any)}
              style={styles.importBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="cloud-upload-outline" size={16} color={Colors.gold} />
              <Text style={styles.importBtnText}>Import</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { resetForm(); setModalVisible(true); }}
              style={styles.addBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={22} color={Colors.gold} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Day selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
          {DAY_NAMES.map((name, day) => {
            const count = eventsForDay(day).length;
            const active = selectedDay === day;
            return (
              <TouchableOpacity
                key={day}
                onPress={() => setSelectedDay(day)}
                style={[styles.dayChip, active && styles.dayChipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                  {name}
                </Text>
                {count > 0 && (
                  <View style={[styles.dayBadge, active && styles.dayBadgeActive]}>
                    <Text style={[styles.dayBadgeText, active && styles.dayBadgeTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Events for selected day */}
        <View style={styles.section}>
          <SectionHeader
            title={DAY_NAMES_FULL[selectedDay]}
            action="+ Add"
            onAction={() => { resetForm(); setFormDays([selectedDay]); setModalVisible(true); }}
          />

          {eventsForDay(selectedDay).length === 0 ? (
            <Card>
              <Text style={styles.emptyText}>No events on {DAY_NAMES_FULL[selectedDay]}.</Text>
            </Card>
          ) : (
            eventsForDay(selectedDay).map((event) => (
              <EventRow
                key={event.id}
                event={event}
                onDelete={() => deleteScheduleEvent(event.id)}
              />
            ))
          )}
        </View>

        {/* Weekly overview */}
        {totalEvents > 0 && (
          <View style={styles.section}>
            <SectionHeader title="All Events" />
            {DAY_NAMES.map((name, day) => {
              const events = eventsForDay(day);
              if (!events.length) return null;
              return (
                <View key={day} style={styles.overviewDay}>
                  <Text style={styles.overviewDayName}>{name}</Text>
                  <View style={styles.overviewEvents}>
                    {events.map((e) => (
                      <View
                        key={e.id}
                        style={[styles.overviewBadge, { borderLeftColor: CATEGORY_COLOR[e.category] }]}
                      >
                        <Text style={styles.overviewBadgeText} numberOfLines={1}>
                          {e.start} {e.title}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add Event Modal */}
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
              <Text style={styles.modalTitle}>New Event</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Input
                label="Event Title"
                value={title}
                onChangeText={(t) => { setTitle(t); setError(''); }}
                placeholder="e.g. University lecture, Gym, Team standup"
                autoFocus
                error={error}
              />

              <Input
                label="Location (optional)"
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Room 201, Online"
              />

              {/* Category picker */}
              <View>
                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.catGrid}>
                  {CATEGORIES.map(({ value, label, icon }) => {
                    const active = category === value;
                    const color = CATEGORY_COLOR[value];
                    return (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setCategory(value)}
                        style={[
                          styles.catBtn,
                          active && { borderColor: color, backgroundColor: color + '20' },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={icon} size={14} color={active ? color : Colors.textMuted} />
                        <Text style={[styles.catBtnText, active && { color }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Day multi-select */}
              <View>
                <Text style={styles.fieldLabel}>Repeats on</Text>
                <View style={styles.dayGrid}>
                  {DAY_NAMES.map((name, day) => {
                    const active = formDays.includes(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        onPress={() => toggleFormDay(day)}
                        style={[styles.dayGridBtn, active && styles.dayGridBtnActive]}
                      >
                        <Text style={[styles.dayGridText, active && styles.dayGridTextActive]}>
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Time */}
              <View style={styles.timeRow}>
                <Input
                  label="Start"
                  value={start}
                  onChangeText={setStart}
                  placeholder="09:00"
                  containerStyle={styles.timeInput}
                  keyboardType="numbers-and-punctuation"
                />
                <Input
                  label="End"
                  value={end}
                  onChangeText={setEnd}
                  placeholder="10:00"
                  containerStyle={styles.timeInput}
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              <View style={styles.recurringNote}>
                <Ionicons name="repeat" size={13} color={Colors.gold} />
                <Text style={styles.recurringText}>Repeats every week on selected days</Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button label="Cancel" onPress={() => setModalVisible(false)} variant="secondary" style={styles.modalBtn} />
              <Button label="Add Event" onPress={handleAdd} style={styles.modalBtn} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function EventRow({ event, onDelete }: { event: ScheduleEvent; onDelete: () => void }) {
  const color = CATEGORY_COLOR[event.category];
  return (
    <View style={[styles.eventRow, { borderLeftColor: color }]}>
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.eventMeta}>
          {event.start} – {event.end}
          {event.location ? ` · ${event.location}` : ''}
          {' · '}<Text style={{ color }}>{event.category}</Text>
        </Text>
      </View>
      <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  screenLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  screenTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 2 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  importBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.sm, backgroundColor: Colors.goldMuted,
    borderWidth: 1, borderColor: Colors.goldDim,
  },
  importBtnText: { fontSize: FontSize.xs, color: Colors.gold, fontWeight: FontWeight.medium },
  addBtn: {
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },
  dayScroll: { marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg },
  dayChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated, marginRight: Spacing.sm,
  },
  dayChipActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  dayChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  dayChipTextActive: { color: Colors.gold, fontWeight: FontWeight.bold },
  dayBadge: {
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  dayBadgeActive: { backgroundColor: Colors.gold },
  dayBadgeText: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold },
  dayBadgeTextActive: { color: Colors.textInverse },
  section: { gap: Spacing.xs },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.sm },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3,
    padding: Spacing.md, marginBottom: Spacing.xs,
  },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  eventMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  deleteBtn: { padding: 4 },
  overviewDay: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.xs },
  overviewDayName: { fontSize: FontSize.xs, color: Colors.textMuted, width: 28, paddingTop: 3, textTransform: 'uppercase' },
  overviewEvents: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  overviewBadge: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3,
  },
  overviewBadgeText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalBody: { padding: Spacing.lg, gap: Spacing.md },
  fieldLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  catBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.sm, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  catBtnText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  dayGridBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.sm, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  dayGridBtnActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  dayGridText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  dayGridTextActive: { color: Colors.gold, fontWeight: FontWeight.semibold },
  timeRow: { flexDirection: 'row', gap: Spacing.md },
  timeInput: { flex: 1 },
  recurringNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  recurringText: { fontSize: FontSize.xs, color: Colors.gold },
  modalFooter: {
    flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  modalBtn: { flex: 1 },
});
