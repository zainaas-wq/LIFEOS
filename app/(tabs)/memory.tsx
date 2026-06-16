import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/useAppStore';
import { track } from '../../src/services/analyticsService';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../src/constants/theme';
import type { MemoryEntry, MemoryEntrySource } from '../../src/types';

// ─── Source config ────────────────────────────────────────────────────────────

const SOURCE_META: Record<MemoryEntrySource, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  note:       { label: 'Note',       icon: 'document-text-outline', color: Colors.gold },
  knowledge:  { label: 'Knowledge',  icon: 'bulb-outline',          color: '#6C8EBF'   },
  goal:       { label: 'Goal',       icon: 'flag-outline',          color: '#A78BFA'   },
  reflection: { label: 'Reflection', icon: 'journal-outline',       color: '#F472B6'   },
  focus:      { label: 'Focus',      icon: 'flash-outline',         color: '#4ADE80'   },
  ai_insight: { label: 'AI',         icon: 'sparkles-outline',      color: Colors.gold },
};

type FilterSource = MemoryEntrySource | 'all';

const FILTERS: { value: FilterSource; label: string }[] = [
  { value: 'all',        label: 'All'        },
  { value: 'note',       label: 'Notes'      },
  { value: 'knowledge',  label: 'Knowledge'  },
  { value: 'goal',       label: 'Goals'      },
  { value: 'reflection', label: 'Reflections'},
  { value: 'focus',      label: 'Focus'      },
  { value: 'ai_insight', label: 'AI'         },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Memory card ──────────────────────────────────────────────────────────────

function MemoryCard({
  entry,
  onDelete,
  onPress,
}: {
  entry: MemoryEntry;
  onDelete: () => void;
  onPress: () => void;
}) {
  const meta = SOURCE_META[entry.source];
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardHeader}>
        <View style={[styles.sourceChip, { borderColor: meta.color + '55' }]}>
          <Ionicons name={meta.icon} size={11} color={meta.color} />
          <Text style={[styles.sourceLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={styles.cardDate}>{formatDate(entry.updatedAt)}</Text>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.cardTitle} numberOfLines={1}>{entry.title}</Text>
      <Text style={styles.cardContent} numberOfLines={2}>{entry.content}</Text>

      {entry.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {entry.tags.slice(0, 4).map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Add / View modal ─────────────────────────────────────────────────────────

function MemoryModal({
  visible,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: MemoryEntry | null;
  onSave: (data: { title: string; content: string; source: MemoryEntrySource; tags: string[] }) => void;
  onClose: () => void;
}) {
  const [title,     setTitle]     = useState(initial?.title   ?? '');
  const [content,   setContent]   = useState(initial?.content ?? '');
  const [tagsRaw,   setTagsRaw]   = useState(initial?.tags.join(', ') ?? '');
  const [source,    setSource]    = useState<MemoryEntrySource>(initial?.source ?? 'note');
  const [error,     setError]     = useState('');

  const isReadOnly = initial !== null && initial.source !== 'note' && initial.source !== 'knowledge';

  const handleSave = () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!content.trim()) { setError('Content is required.'); return; }
    const tags = tagsRaw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    onSave({ title: title.trim(), content: content.trim(), source, tags });
    onClose();
  };

  // Reset on open
  React.useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? '');
      setContent(initial?.content ?? '');
      setTagsRaw(initial?.tags.join(', ') ?? '');
      setSource(initial?.source ?? 'note');
      setError('');
    }
  }, [visible]);

  const editableSources: MemoryEntrySource[] = ['note', 'knowledge'];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {initial ? (isReadOnly ? 'Memory' : 'Edit Memory') : 'New Memory'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* Source picker — only for new/editable */}
            {!isReadOnly && (
              <View>
                <Text style={styles.fieldLabel}>Type</Text>
                <View style={styles.sourceRow}>
                  {editableSources.map((s) => {
                    const m = SOURCE_META[s];
                    const active = source === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() => setSource(s)}
                        style={[styles.sourceBtn, active && { borderColor: m.color, backgroundColor: m.color + '18' }]}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={m.icon} size={14} color={active ? m.color : Colors.textMuted} />
                        <Text style={[styles.sourceBtnText, active && { color: m.color }]}>{m.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Title */}
            <View>
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={[styles.textInput, isReadOnly && styles.textInputReadOnly]}
                value={title}
                onChangeText={(t) => { setTitle(t); setError(''); }}
                placeholder="e.g. Java Thread synchronization"
                placeholderTextColor={Colors.textMuted}
                editable={!isReadOnly}
              />
            </View>

            {/* Content */}
            <View>
              <Text style={styles.fieldLabel}>Content</Text>
              <TextInput
                style={[styles.textInput, styles.textInputMulti, isReadOnly && styles.textInputReadOnly]}
                value={content}
                onChangeText={(t) => { setContent(t); setError(''); }}
                placeholder="Write what you want to remember..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                editable={!isReadOnly}
              />
            </View>

            {/* Tags */}
            {!isReadOnly && (
              <View>
                <Text style={styles.fieldLabel}>Tags  <Text style={styles.fieldHint}>(comma-separated)</Text></Text>
                <TextInput
                  style={styles.textInput}
                  value={tagsRaw}
                  onChangeText={setTagsRaw}
                  placeholder="e.g. java, threads, concurrency"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            )}

            {/* Tags display for read-only */}
            {isReadOnly && initial!.tags.length > 0 && (
              <View>
                <Text style={styles.fieldLabel}>Tags</Text>
                <View style={styles.tagsRow}>
                  {initial!.tags.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </ScrollView>

          {!isReadOnly && (
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
                <Text style={styles.saveBtnText}>{initial ? 'Save Changes' : 'Save Memory'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MemoryScreen() {
  const localMemories     = useAppStore((s) => s.localMemories);
  const addLocalMemory    = useAppStore((s) => s.addLocalMemory);
  const updateLocalMemory = useAppStore((s) => s.updateLocalMemory);
  const deleteLocalMemory = useAppStore((s) => s.deleteLocalMemory);

  const [query,        setQuery]        = useState('');
  const [filter,       setFilter]       = useState<FilterSource>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [selected,     setSelected]     = useState<MemoryEntry | null>(null);

  // Filtered + searched list
  const displayed = useMemo(() => {
    let list = filter === 'all' ? localMemories : localMemories.filter((m) => m.source === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          m.tags.some((t) => t.includes(q)),
      );
    }
    return list;
  }, [localMemories, filter, query]);

  const handleSave = (data: { title: string; content: string; source: MemoryEntrySource; tags: string[] }) => {
    if (selected) {
      updateLocalMemory(selected.id, data);
    } else {
      addLocalMemory(data);
      track('memory_created', { source: data.source, tag_count: data.tags.length });
    }
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Delete Memory', `Remove "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteLocalMemory(id) },
    ]);
  };

  const openNew = () => {
    setSelected(null);
    setModalVisible(true);
  };

  const openEntry = (entry: MemoryEntry) => {
    setSelected(entry);
    setModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>Second Brain</Text>
          <Text style={styles.headerTitle}>Memory</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNew} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color={Colors.gold} />
        </TouchableOpacity>
      </View>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search memories, notes, insights..."
          placeholderTextColor={Colors.textMuted}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filter chips ───────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <TouchableOpacity
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={[styles.filterChip, active && styles.filterChipActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Memory list ────────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {displayed.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="library-outline" size={32} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>
              {query ? 'No memories found' : 'Your second brain is empty'}
            </Text>
            <Text style={styles.emptyText}>
              {query
                ? 'Try a different search term.'
                : 'Add notes, insights, and knowledge.\nThe AI will remember everything for you.'}
            </Text>
            {!query && (
              <TouchableOpacity style={styles.emptyBtn} onPress={openNew} activeOpacity={0.85}>
                <Ionicons name="add" size={16} color={Colors.textInverse} />
                <Text style={styles.emptyBtnText}>Add First Memory</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <Text style={styles.listCount}>
              {displayed.length} {displayed.length === 1 ? 'memory' : 'memories'}
              {query ? ` matching "${query}"` : ''}
            </Text>
            {displayed.map((entry) => (
              <MemoryCard
                key={entry.id}
                entry={entry}
                onPress={() => openEntry(entry)}
                onDelete={() => handleDelete(entry.id, entry.title)}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Add / View modal ───────────────────────────────────────────────── */}
      <MemoryModal
        visible={modalVisible}
        initial={selected}
        onSave={handleSave}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  headerLabel: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  headerTitle: {
    fontSize: FontSize.xxl, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, marginTop: 2,
  },
  addBtn: {
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.goldDim,
    alignItems: 'center', justifyContent: 'center',
  },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },

  // Filters
  filterBar:    { flexGrow: 0 },
  filterContent: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs,
    gap: Spacing.xs, flexDirection: 'row', alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterChipActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  filterChipText:       { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  filterChipTextActive: { color: Colors.gold },

  // List
  list:      { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  listCount: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },

  // Card
  card: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sourceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  sourceLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  cardDate:    { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted },
  cardTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  cardContent: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  tagsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  tag: {
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: Radius.sm, backgroundColor: Colors.surfaceHigh,
    borderWidth: 1, borderColor: Colors.border,
  },
  tagText: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Empty state
  empty: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyIcon: {
    width: 64, height: 64, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  emptyText:  { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.gold, borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  emptyBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },

  // Modal
  modal:       { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalBody:  { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  modalFooter: {
    flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  fieldLabel: {
    fontSize: FontSize.xs, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs,
  },
  fieldHint: { color: Colors.textMuted, textTransform: 'none', letterSpacing: 0 },

  // Source picker in modal
  sourceRow: { flexDirection: 'row', gap: Spacing.sm },
  sourceBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
  },
  sourceBtnText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },

  // Text inputs
  textInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.md, color: Colors.textPrimary,
  },
  textInputMulti: { minHeight: 140, textAlignVertical: 'top' },
  textInputReadOnly: { color: Colors.textSecondary, borderColor: Colors.border, opacity: 0.75 },

  errorText: { fontSize: FontSize.sm, color: Colors.error },

  // Footer buttons
  cancelBtn: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cancelBtnText: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  saveBtn: {
    flex: 2, paddingVertical: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.gold, alignItems: 'center',
  },
  saveBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },
});
