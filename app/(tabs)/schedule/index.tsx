import React, { useState, useMemo } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../../src/store/useAppStore";
import { Input } from "../../../src/components/ui/Input";
import { Button } from "../../../src/components/ui/Button";
import { Colors, Spacing, FontSize, FontWeight, Radius } from "../../../src/constants/theme";
import type { ScheduleEvent, EventCategory } from "../../../src/types";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: "class",    label: "Class"    },
  { value: "work",     label: "Work"     },
  { value: "health",   label: "Health"   },
  { value: "personal", label: "Personal" },
  { value: "social",   label: "Social"   },
  { value: "other",    label: "Other"    },
];

const CATEGORY_COLOR: Record<EventCategory, string> = {
  class:    "#6C8EBF",
  work:     Colors.gold,
  health:   "#4ADE80",
  personal: "#F472B6",
  social:   "#A78BFA",
  other:    Colors.textMuted,
};

function getMonthGrid(year: number, month: number): Array<Date | null> {
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: Array<Date | null> = [];
  for (let i = 0; i < firstDay; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d));
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function fmtMonthYear(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDayLabel(d: Date): string {
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

export default function ScheduleScreen() {
  const scheduleEvents      = useAppStore((s) => s.scheduleEvents);
  const addScheduleEvent    = useAppStore((s) => s.addScheduleEvent);
  const deleteScheduleEvent = useAppStore((s) => s.deleteScheduleEvent);

  const today = new Date();

  const [viewDate,     setViewDate]     = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [modalVisible, setModalVisible] = useState(false);

  const [title,    setTitle]    = useState("");
  const [start,    setStart]    = useState("09:00");
  const [end,      setEnd]      = useState("10:00");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<EventCategory>("class");
  const [formDays, setFormDays] = useState<number[]>([new Date().getDay()]);
  const [error,    setError]    = useState("");

  const grid = useMemo(
    () => getMonthGrid(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate],
  );

  const daysWithEvents = useMemo(() => {
    const set = new Set<number>();
    scheduleEvents.forEach((e) => { e.daysOfWeek.forEach((d) => set.add(d)); });
    return set;
  }, [scheduleEvents]);

  const selectedDayEvents = useMemo(
    () => scheduleEvents.filter((e) => e.daysOfWeek.includes(selectedDate.getDay())),
    [scheduleEvents, selectedDate],
  );

  const prevMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const toggleFormDay = (day: number) => {
    setFormDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const resetForm = () => {
    setTitle(""); setStart("09:00"); setEnd("10:00");
    setLocation(""); setCategory("class");
    setFormDays([new Date().getDay()]); setError("");
  };

  const handleAdd = () => {
    if (!title.trim())         { setError("Event title is required."); return; }
    if (start >= end)          { setError("End time must be after start time."); return; }
    if (formDays.length === 0) { setError("Select at least one day."); return; }
    addScheduleEvent({
      title: title.trim(), start, end, category,
      daysOfWeek: [...formDays].sort(),
      location: location.trim() || undefined,
      recurring: true,
    });
    resetForm();
    setModalVisible(false);
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.screenTitle}>Schedule</Text>
          <View style={s.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={s.navBtn} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={s.monthLabel}>{fmtMonthYear(viewDate)}</Text>
            <TouchableOpacity onPress={nextMonth} style={s.navBtn} activeOpacity={0.7}>
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Calendar grid */}
        <View style={s.calendarCard}>
          {/* Day-of-week headers */}
          <View style={s.calRow}>
            {DAY_LABELS.map((d, i) => (
              <View key={i} style={s.calCell}>
                <Text style={s.calDayLabel}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Day cells */}
          {Array.from({ length: grid.length / 7 }, (_, row) => (
            <View key={row} style={s.calRow}>
              {grid.slice(row * 7, row * 7 + 7).map((date, col) => {
                if (!date) return <View key={col} style={s.calCell} />;
                const isToday    = isSameDay(date, today);
                const isSelected = isSameDay(date, selectedDate);
                const hasEvent   = daysWithEvents.has(date.getDay());
                return (
                  <TouchableOpacity
                    key={col}
                    style={s.calCell}
                    onPress={() => setSelectedDate(date)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      s.dayCircle,
                      isToday    && s.dayCircleToday,
                      isSelected && !isToday && s.dayCircleSelected,
                    ]}>
                      <Text style={[
                        s.dayNum,
                        isToday    && s.dayNumToday,
                        isSelected && !isToday && s.dayNumSelected,
                      ]}>
                        {date.getDate()}
                      </Text>
                    </View>
                    {hasEvent && !isToday && (
                      <View style={s.eventDot} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Selected day events */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{fmtDayLabel(selectedDate)}</Text>

          {selectedDayEvents.length === 0 ? (
            <View style={s.emptyDay}>
              <Ionicons name="calendar-outline" size={32} color={Colors.textMuted} />
              <Text style={s.emptyDayText}>No events on this day</Text>
            </View>
          ) : (
            selectedDayEvents.map((event) => {
              const color = CATEGORY_COLOR[event.category];
              return (
                <View key={event.id} style={[s.eventCard, { borderLeftColor: color }]}>
                  <View style={s.eventBody}>
                    <Text style={s.eventTitle}>{event.title}</Text>
                    <Text style={s.eventMeta}>{event.start} – {event.end}</Text>
                    {event.location ? (
                      <View style={s.eventLocationRow}>
                        <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                        <Text style={s.eventLocation}>{event.location}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={[s.categoryChip, { backgroundColor: color + "22" }]}>
                    <Text style={[s.categoryChipText, { color }]}>{event.category}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => Alert.alert("Delete Event", `Delete "${event.title}"?`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteScheduleEvent(event.id) },
                    ])}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color={Colors.textInverse} />
      </TouchableOpacity>

      {/* Add Event Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { resetForm(); setModalVisible(false); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Event</Text>
              <TouchableOpacity onPress={() => { resetForm(); setModalVisible(false); }}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              <Input label="Event Title" value={title} onChangeText={(t) => { setTitle(t); setError(""); }}
                placeholder="e.g. Data Structures Lecture" autoFocus error={error} />

              <Input label="Start Time" value={start} onChangeText={setStart} placeholder="09:00" />
              <Input label="End Time"   value={end}   onChangeText={setEnd}   placeholder="10:00" />
              <Input label="Location (optional)" value={location} onChangeText={setLocation} placeholder="Room 201" />

              <View>
                <Text style={s.fieldLabel}>Category</Text>
                <View style={s.categoryGrid}>
                  {CATEGORIES.map((cat) => {
                    const active = category === cat.value;
                    const color  = CATEGORY_COLOR[cat.value];
                    return (
                      <TouchableOpacity
                        key={cat.value}
                        style={[s.catChip, active && { borderColor: color, backgroundColor: color + "22" }]}
                        onPress={() => setCategory(cat.value)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.catChipText, active && { color }]}>{cat.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text style={s.fieldLabel}>Repeat on days</Text>
                <View style={s.daysRow}>
                  {DAY_LABELS.map((label, day) => {
                    const active = formDays.includes(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[s.dayChip, active && s.dayChipActive]}
                        onPress={() => toggleFormDay(day)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.dayChipText, active && s.dayChipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <View style={s.modalFooter}>
              <Button label="Cancel" onPress={() => { resetForm(); setModalVisible(false); }} variant="secondary" style={{ flex: 1 }} />
              <Button label="Add Event" onPress={handleAdd} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 96, gap: Spacing.lg },

  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  screenTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  monthNav:    { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  navBtn:      { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  monthLabel:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, minWidth: 120, textAlign: "center" },

  calendarCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm },
  calRow:       { flexDirection: "row" },
  calCell:      { flex: 1, alignItems: "center", paddingVertical: 4 },
  calDayLabel:  { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  dayCircle:    { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayCircleToday:    { backgroundColor: Colors.gold },
  dayCircleSelected: { backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.gold },
  dayNum:            { fontSize: FontSize.sm, color: Colors.textSecondary },
  dayNumToday:       { color: Colors.textInverse, fontWeight: FontWeight.bold },
  dayNumSelected:    { color: Colors.gold, fontWeight: FontWeight.semibold },
  eventDot:          { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.gold, marginTop: 1 },

  section:      { gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.sm, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: FontWeight.semibold },

  emptyDay:     { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: "center", gap: Spacing.sm, paddingVertical: Spacing.xl },
  emptyDayText: { fontSize: FontSize.sm, color: Colors.textMuted },

  eventCard:    { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.sm },
  eventBody:    { flex: 1, gap: 3 },
  eventTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  eventMeta:    { fontSize: FontSize.xs, color: Colors.textSecondary },
  eventLocationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  eventLocation:    { fontSize: FontSize.xs, color: Colors.textMuted },
  categoryChip:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  categoryChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: "capitalize" },

  fab: { position: "absolute", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.gold, alignItems: "center", justifyContent: "center", shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },

  modal:       { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalBody:   { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  modalFooter: { flexDirection: "row", gap: Spacing.sm, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },

  fieldLabel:   { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: Spacing.xs },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs },
  catChip:      { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceElevated },
  catChipText:  { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  daysRow:      { flexDirection: "row", gap: Spacing.xs },
  dayChip:      { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceElevated },
  dayChipActive:    { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  dayChipText:      { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  dayChipTextActive:{ color: Colors.gold, fontWeight: FontWeight.bold },
});
