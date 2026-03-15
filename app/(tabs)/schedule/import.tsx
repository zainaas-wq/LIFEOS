/**
 * LEGACY AI PATH — Schedule Import (Smart Import via Claude vision)
 *
 * This screen uses `aiApiKey` from the store to call the Anthropic vision API
 * directly via `src/ai/scheduleParser.ts`. This is a different concern from the
 * chat AI (BackendAIClient / ai-chat edge function) and has not been migrated yet.
 *
 * Migration path (future sprint):
 *   - Add a `parse-schedule` Supabase Edge Function that accepts image base64
 *   - Route `parseScheduleImages` through the edge function using the session token
 *   - Remove `aiApiKey` dependency from this screen
 *
 * Until that sprint: Smart Import is intentionally gated by `aiApiKey`.
 * Manual entry (step === 'manual') is fully functional without a key.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '../../../src/store/useAppStore';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Input';
import { Card } from '../../../src/components/ui/Card';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../../src/constants/theme';
import { parseScheduleImages, type ParsedEvent } from '../../../src/ai/scheduleParser';
import type { EventCategory } from '../../../src/types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CATEGORIES: { value: EventCategory; label: string; color: string }[] = [
  { value: 'class',    label: 'Class',    color: '#6C8EBF' },
  { value: 'work',     label: 'Work',     color: Colors.gold },
  { value: 'health',   label: 'Health',   color: '#4ADE80' },
  { value: 'personal', label: 'Personal', color: '#F472B6' },
  { value: 'social',   label: 'Social',   color: '#A78BFA' },
  { value: 'other',    label: 'Other',    color: Colors.textMuted },
];

const CATEGORY_COLOR: Record<EventCategory, string> = {
  class: '#6C8EBF', work: Colors.gold, health: '#4ADE80',
  personal: '#F472B6', social: '#A78BFA', other: Colors.textMuted,
};

type Step = 'method' | 'images' | 'manual' | 'preview';
type PickedImage = { uri: string; base64: string; mimeType: string };

export default function ImportScheduleScreen() {
  const aiApiKey = useAppStore((s) => s.aiApiKey);
  const addScheduleEvent = useAppStore((s) => s.addScheduleEvent);

  const isWeb = Platform.OS === 'web';

  const [step, setStep] = useState<Step>('method');
  const [pickedImages, setPickedImages] = useState<PickedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [events, setEvents] = useState<ParsedEvent[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Manual form state
  const [manualTitle, setManualTitle] = useState('');
  const [manualStart, setManualStart] = useState('09:00');
  const [manualEnd, setManualEnd] = useState('10:00');
  const [manualDays, setManualDays] = useState<number[]>([1]);
  const [manualCategory, setManualCategory] = useState<EventCategory>('class');
  const [manualLocation, setManualLocation] = useState('');
  const [manualError, setManualError] = useState('');

  // ── Image picking ──────────────────────────────────────────────
  const handlePickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      const imgs: PickedImage[] = result.assets
        .filter((a) => a.base64)
        .map((a) => ({
          uri: a.uri,
          base64: a.base64!,
          mimeType: (a.mimeType as string) || 'image/jpeg',
        }));
      setPickedImages((prev) => [...prev, ...imgs]);
    }
  };

  const handleExtract = async () => {
    if (!aiApiKey) return;
    if (pickedImages.length === 0) { setLoadError('Pick at least one image.'); return; }
    setIsLoading(true);
    setLoadError('');
    try {
      const parsed = await parseScheduleImages(
        pickedImages.map((img) => ({ data: img.base64, mimeType: img.mimeType })),
        aiApiKey,
      );
      if (parsed.length === 0) {
        setLoadError('No events found. Try a clearer image or add events manually.');
        setIsLoading(false);
        return;
      }
      setEvents(parsed);
      setStep('preview');
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to parse schedule.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Manual form ────────────────────────────────────────────────
  const toggleManualDay = (day: number) =>
    setManualDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);

  const handleAddManual = () => {
    if (!manualTitle.trim()) { setManualError('Title is required.'); return; }
    if (manualStart >= manualEnd) { setManualError('End must be after start.'); return; }
    if (manualDays.length === 0) { setManualError('Select at least one day.'); return; }
    const ev: ParsedEvent = {
      title: manualTitle.trim(),
      start: manualStart,
      end: manualEnd,
      category: manualCategory,
      location: manualLocation.trim() || undefined,
      daysOfWeek: [...manualDays].sort(),
      recurring: true,
    };
    setEvents((prev) => [...prev, ev]);
    setManualTitle(''); setManualStart('09:00'); setManualEnd('10:00');
    setManualDays([1]); setManualLocation(''); setManualError('');
    setStep('preview');
  };

  // ── Preview actions ────────────────────────────────────────────
  const handleDeleteEvent = (index: number) =>
    setEvents((prev) => prev.filter((_, i) => i !== index));

  const handleEditTitle = (index: number, title: string) =>
    setEvents((prev) => prev.map((e, i) => i === index ? { ...e, title } : e));

  const handleConfirm = () => {
    events.forEach((e) => addScheduleEvent(e));
    router.back();
  };

  const addMoreManually = () => {
    setManualTitle(''); setManualStart('09:00'); setManualEnd('10:00');
    setManualDays([1]); setManualLocation(''); setManualError('');
    setStep('manual');
  };

  // ── Render helpers ─────────────────────────────────────────────
  const renderHeader = (title: string) => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => {
        if (step === 'method') router.back();
        else if (step === 'images' || step === 'manual') setStep('method');
        else if (step === 'preview') setStep('method');
      }} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 32 }} />
    </View>
  );

  // ── STEP: method select ────────────────────────────────────────
  if (step === 'method') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {renderHeader('Import Schedule')}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>
            Add your weekly recurring events from a screenshot or enter them manually.
          </Text>

          <TouchableOpacity
            style={styles.methodCard}
            onPress={() => setStep('images')}
            activeOpacity={0.8}
          >
            <View style={[styles.methodIcon, { backgroundColor: Colors.goldMuted }]}>
              <Ionicons name="camera-outline" size={24} color={Colors.gold} />
            </View>
            <View style={styles.methodText}>
              <Text style={styles.methodTitle}>Smart Import</Text>
              <Text style={styles.methodDesc}>
                Upload a schedule screenshot — AI extracts events automatically
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.methodCard}
            onPress={() => setStep('manual')}
            activeOpacity={0.8}
          >
            <View style={[styles.methodIcon, { backgroundColor: Colors.surfaceElevated }]}>
              <Ionicons name="create-outline" size={24} color={Colors.textSecondary} />
            </View>
            <View style={styles.methodText}>
              <Text style={styles.methodTitle}>Quick Manual Entry</Text>
              <Text style={styles.methodDesc}>
                Enter events one by one with full control over each field
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── STEP: image pick + extract ─────────────────────────────────
  if (step === 'images') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {renderHeader('Smart Import')}
        <ScrollView contentContainerStyle={styles.content}>
          {isWeb ? (
            <Card style={styles.webOnlyCard}>
              <Ionicons name="phone-portrait-outline" size={24} color={Colors.textMuted} />
              <Text style={styles.webOnlyText}>
                Smart Import is available on the mobile app.
              </Text>
              <Button label="Use Manual Entry instead" onPress={() => setStep('manual')} variant="ghost" size="sm" />
            </Card>
          ) : (
            <>
              {!aiApiKey && (
                <Card style={styles.noKeyCard}>
                  <View style={styles.noKeyRow}>
                    <Ionicons name="key-outline" size={16} color={Colors.textMuted} />
                    <Text style={styles.noKeyText}>
                      Add your Anthropic API key in Settings to use Smart Import.
                    </Text>
                  </View>
                  <Button
                    label="Go to Settings"
                    onPress={() => router.push('/(tabs)/settings' as any)}
                    variant="ghost"
                    size="sm"
                    style={styles.noKeyBtn}
                  />
                </Card>
              )}

              <TouchableOpacity style={styles.pickBtn} onPress={handlePickImages} activeOpacity={0.8}>
                <Ionicons name="images-outline" size={20} color={Colors.gold} />
                <Text style={styles.pickBtnText}>
                  {pickedImages.length > 0 ? `${pickedImages.length} image(s) selected — add more` : 'Pick Images from Library'}
                </Text>
              </TouchableOpacity>

              {pickedImages.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailScroll}>
                  {pickedImages.map((img, i) => (
                    <View key={i} style={styles.thumbnailWrap}>
                      <Image source={{ uri: img.uri }} style={styles.thumbnail} />
                      <TouchableOpacity
                        onPress={() => setPickedImages((prev) => prev.filter((_, idx) => idx !== i))}
                        style={styles.thumbnailRemove}
                      >
                        <Ionicons name="close-circle" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              {loadError ? (
                <Text style={styles.errorText}>{loadError}</Text>
              ) : null}

              <Button
                label={isLoading ? 'Extracting…' : 'Extract Events'}
                onPress={handleExtract}
                disabled={isLoading || !aiApiKey || pickedImages.length === 0}
                style={styles.extractBtn}
              />
              {isLoading && <ActivityIndicator color={Colors.gold} style={{ marginTop: Spacing.sm }} />}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── STEP: manual entry ─────────────────────────────────────────
  if (step === 'manual') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {renderHeader('Manual Entry')}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {events.length > 0 && (
              <Card style={styles.addedCount}>
                <Text style={styles.addedCountText}>
                  {events.length} event{events.length !== 1 ? 's' : ''} added — fill in another or go to preview
                </Text>
                <TouchableOpacity onPress={() => setStep('preview')}>
                  <Text style={styles.previewLink}>Preview →</Text>
                </TouchableOpacity>
              </Card>
            )}

            <Input
              label="Event Title"
              value={manualTitle}
              onChangeText={(t) => { setManualTitle(t); setManualError(''); }}
              placeholder="e.g. Calculus Lecture, Gym, Team standup"
              autoFocus
              error={manualError}
            />

            <Input
              label="Location (optional)"
              value={manualLocation}
              onChangeText={setManualLocation}
              placeholder="e.g. Room 201, Online"
            />

            <View>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.catGrid}>
                {CATEGORIES.map(({ value, label, color }) => {
                  const active = manualCategory === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      onPress={() => setManualCategory(value)}
                      style={[styles.catBtn, active && { borderColor: color, backgroundColor: color + '20' }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.catBtnText, active && { color }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={styles.fieldLabel}>Repeats on</Text>
              <View style={styles.dayGrid}>
                {DAY_NAMES.map((name, day) => {
                  const active = manualDays.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      onPress={() => toggleManualDay(day)}
                      style={[styles.dayGridBtn, active && styles.dayGridBtnActive]}
                    >
                      <Text style={[styles.dayGridText, active && styles.dayGridTextActive]}>{name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.timeRow}>
              <Input
                label="Start"
                value={manualStart}
                onChangeText={setManualStart}
                placeholder="09:00"
                containerStyle={styles.timeInput}
                keyboardType="numbers-and-punctuation"
              />
              <Input
                label="End"
                value={manualEnd}
                onChangeText={setManualEnd}
                placeholder="10:00"
                containerStyle={styles.timeInput}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <Button label="Add to Preview" onPress={handleAddManual} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── STEP: preview ──────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {renderHeader('Preview & Confirm')}
      <ScrollView contentContainerStyle={styles.content}>
        {events.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>No events to preview.</Text>
          </Card>
        ) : (
          events.map((ev, i) => (
            <PreviewRow
              key={i}
              event={ev}
              isEditing={editingIndex === i}
              onStartEdit={() => setEditingIndex(i)}
              onEndEdit={() => setEditingIndex(null)}
              onTitleChange={(t) => handleEditTitle(i, t)}
              onDelete={() => handleDeleteEvent(i)}
            />
          ))
        )}

        <TouchableOpacity onPress={addMoreManually} style={styles.addMoreBtn}>
          <Ionicons name="add-circle-outline" size={16} color={Colors.gold} />
          <Text style={styles.addMoreText}>Add another manually</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={`Confirm & Save ${events.length} event${events.length !== 1 ? 's' : ''}`}
          onPress={handleConfirm}
          disabled={events.length === 0}
          style={styles.confirmBtn}
        />
      </View>
    </SafeAreaView>
  );
}

// ── PreviewRow ─────────────────────────────────────────────────────────────
interface PreviewRowProps {
  event: ParsedEvent;
  isEditing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onTitleChange: (t: string) => void;
  onDelete: () => void;
}

function PreviewRow({ event, isEditing, onStartEdit, onEndEdit, onTitleChange, onDelete }: PreviewRowProps) {
  const color = CATEGORY_COLOR[event.category];
  return (
    <View style={[styles.previewRow, { borderLeftColor: color }]}>
      <View style={styles.previewMain}>
        {isEditing ? (
          <TextInput
            value={event.title}
            onChangeText={onTitleChange}
            onBlur={onEndEdit}
            autoFocus
            style={styles.previewTitleInput}
          />
        ) : (
          <TouchableOpacity onPress={onStartEdit}>
            <Text style={styles.previewTitle}>{event.title}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.previewMeta}>
          <Text style={[styles.previewCategory, { color }]}>{event.category}</Text>
          <Text style={styles.previewTime}> · {event.start}–{event.end}</Text>
          {event.location ? <Text style={styles.previewTime}> · {event.location}</Text> : null}
        </View>

        <View style={styles.dayPills}>
          {event.daysOfWeek.map((d) => (
            <View key={d} style={styles.dayPill}>
              <Text style={styles.dayPillText}>{DAY_NAMES[d]}</Text>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  methodCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  methodIcon: {
    width: 48, height: 48, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  methodText: { flex: 1 },
  methodTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  methodDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },

  noKeyCard: { gap: Spacing.sm },
  noKeyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  noKeyText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  noKeyBtn: { alignSelf: 'flex-start' },

  pickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.goldDim, borderStyle: 'dashed',
    borderRadius: Radius.md, padding: Spacing.md,
    backgroundColor: Colors.goldMuted, justifyContent: 'center',
  },
  pickBtnText: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium },
  thumbnailScroll: { marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg },
  thumbnailWrap: { position: 'relative', marginRight: Spacing.sm },
  thumbnail: { width: 80, height: 80, borderRadius: Radius.sm },
  thumbnailRemove: { position: 'absolute', top: -6, right: -6 },
  extractBtn: { marginTop: Spacing.sm },
  errorText: { fontSize: FontSize.sm, color: Colors.error, textAlign: 'center' },

  fieldLabel: {
    fontSize: FontSize.sm, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs,
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  catBtn: {
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

  addedCount: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  addedCountText: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  previewLink: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.medium },

  previewRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3,
    padding: Spacing.md, gap: Spacing.sm,
  },
  previewMain: { flex: 1, gap: 4 },
  previewTitle: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  previewTitleInput: {
    fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.textPrimary,
    borderBottomWidth: 1, borderBottomColor: Colors.gold, paddingBottom: 2,
  },
  previewMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  previewCategory: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase' },
  previewTime: { fontSize: FontSize.xs, color: Colors.textSecondary },
  dayPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  dayPill: {
    backgroundColor: Colors.border, borderRadius: 3,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  dayPillText: { fontSize: 9, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  deleteBtn: { padding: 4 },

  addMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.sm,
  },
  addMoreText: { fontSize: FontSize.sm, color: Colors.gold },

  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.sm },

  webOnlyCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  webOnlyText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  footer: {
    padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  confirmBtn: {},
});
