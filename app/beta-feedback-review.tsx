import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchBetaFeedback,
  type BetaFeedbackRow,
  type FeedbackFilter,
} from '../src/services/betaFeedbackService';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../src/constants/theme';

// ─── Filter config ────────────────────────────────────────────────────────────

const FILTERS: Array<{ key: FeedbackFilter; label: string }> = [
  { key: 'most_recent',  label: 'Most Recent'    },
  { key: 'highest_score',label: 'Highest Score'  },
  { key: 'lowest_score', label: 'Lowest Score'   },
  { key: 'return_yes',   label: 'Return: Yes'    },
  { key: 'return_no',    label: 'Return: No'     },
  { key: 'all',          label: 'All'            },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function ScoreDots({ score }: { score: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: n <= score ? Colors.gold : Colors.surfaceHigh,
            borderWidth: 1,
            borderColor: n <= score ? Colors.goldDim : Colors.border,
          }}
        />
      ))}
    </View>
  );
}

function SentimentChip({ value, type }: { value: string; type: 'personalized' | 'return' }) {
  const isPositive  = value === 'yes';
  const isSomewhat  = value === 'somewhat';
  const color       = isPositive ? Colors.success : isSomewhat ? Colors.warning : '#F87171';
  const bgColor     = isPositive ? 'rgba(74,222,128,0.12)' : isSomewhat ? 'rgba(251,191,36,0.12)' : 'rgba(248,113,113,0.12)';
  const label       = type === 'personalized'
    ? `Felt personalized: ${value}`
    : `Would return: ${value}`;

  return (
    <View style={[chip.wrap, { backgroundColor: bgColor, borderColor: color + '44' }]}>
      <Text style={[chip.text, { color }]}>{label}</Text>
    </View>
  );
}

const chip = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  text: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
});

// ─── Qualitative text block ───────────────────────────────────────────────────

function QualBlock({
  icon, iconColor, label, text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  text: string;
}) {
  return (
    <View style={qb.wrap}>
      <View style={qb.header}>
        <Ionicons name={icon} size={12} color={iconColor} />
        <Text style={[qb.label, { color: iconColor }]}>{label}</Text>
      </View>
      <Text style={qb.text}>{text}</Text>
    </View>
  );
}

const qb = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    gap: 4,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  text:   { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
});

// ─── Feedback card ────────────────────────────────────────────────────────────

function FeedbackCard({ row }: { row: BetaFeedbackRow }) {
  const hasQualitative = !!(row.confused || row.missing || row.impressed);

  return (
    <View style={fc.card}>
      {/* Meta row */}
      <View style={fc.meta}>
        <Text style={fc.metaDate}>{formatDate(row.created_at)}</Text>
        <Text style={fc.metaDivider}>·</Text>
        <Text style={fc.metaPlatform}>{row.platform}</Text>
        <Text style={fc.metaDivider}>·</Text>
        <Text style={fc.metaVersion}>{row.app_version}</Text>
      </View>

      {/* Score + chips */}
      <View style={fc.scoreRow}>
        <ScoreDots score={row.recommendation_score} />
        <Text style={fc.scoreNum}>{row.recommendation_score}/5</Text>
      </View>

      <View style={fc.chips}>
        <SentimentChip value={row.felt_personalized} type="personalized" />
        <SentimentChip value={row.would_return}      type="return"       />
      </View>

      {/* Qualitative blocks */}
      {hasQualitative && (
        <View style={fc.qualWrap}>
          {row.confused && (
            <QualBlock
              icon="help-circle-outline"
              iconColor="#F87171"
              label="Confused"
              text={row.confused}
            />
          )}
          {row.missing && (
            <QualBlock
              icon="search-outline"
              iconColor={Colors.gold}
              label="Missing"
              text={row.missing}
            />
          )}
          {row.impressed && (
            <QualBlock
              icon="sparkles-outline"
              iconColor="#818CF8"
              label="Impressed"
              text={row.impressed}
            />
          )}
        </View>
      )}

      {!hasQualitative && (
        <Text style={fc.noQual}>No open-text responses provided.</Text>
      )}
    </View>
  );
}

const fc = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaDate:    { fontSize: FontSize.xs, color: Colors.textMuted },
  metaDivider: { fontSize: FontSize.xs, color: Colors.border },
  metaPlatform:{ fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'capitalize' },
  metaVersion: { fontSize: FontSize.xs, color: Colors.textMuted },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  scoreNum: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.bold },
  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  qualWrap: { gap: Spacing.sm },
  noQual:   { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },
});

// ─── Summary stats bar ────────────────────────────────────────────────────────

function SummaryBar({ rows }: { rows: BetaFeedbackRow[] }) {
  if (rows.length === 0) return null;

  const avgScore = rows.reduce((s, r) => s + r.recommendation_score, 0) / rows.length;
  const wouldReturnCount = rows.filter((r) => r.would_return === 'yes' || r.would_return === 'somewhat').length;
  const returnPct = Math.round((wouldReturnCount / rows.length) * 100);
  const withQual  = rows.filter((r) => r.confused || r.missing || r.impressed).length;

  const stats = [
    { label: 'Submissions', value: String(rows.length),             color: Colors.textPrimary },
    { label: 'Avg Score',   value: `${avgScore.toFixed(1)}/5`,       color: Colors.gold        },
    { label: 'Would Return',value: `${returnPct}%`,                  color: Colors.success     },
    { label: 'With Text',   value: `${withQual}/${rows.length}`,     color: '#818CF8'          },
  ];

  return (
    <View style={sb.wrap}>
      {stats.map((s) => (
        <View key={s.label} style={sb.stat}>
          <Text style={[sb.value, { color: s.color }]}>{s.value}</Text>
          <Text style={sb.label}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

const sb = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: 2,
  },
  value: { fontSize: FontSize.lg,  fontWeight: FontWeight.bold },
  label: { fontSize: FontSize.xs,  color: Colors.textMuted },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BetaFeedbackReviewScreen() {
  const [filter,    setFilter]    = useState<FeedbackFilter>('most_recent');
  const [rows,      setRows]      = useState<BetaFeedbackRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async (f: FeedbackFilter, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const data = await fetchBetaFeedback(f);
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load feedback');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter]);

  const handleRefresh = () => {
    setRefreshing(true);
    load(filter, true);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Beta Feedback</Text>
          <Text style={s.headerSub}>Closed beta · qualitative review</Text>
        </View>
        <TouchableOpacity onPress={handleRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="refresh-outline" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterContent}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterChip, filter === f.key && s.filterChipActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.75}
          >
            <Text style={[s.filterChipText, filter === f.key && s.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Body */}
      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={Colors.gold} />
          <Text style={s.loadingText}>Loading feedback…</Text>
        </View>
      ) : error ? (
        <View style={s.errorWrap}>
          <Ionicons name="warning-outline" size={32} color={Colors.error} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => load(filter)} style={s.retryBtn}>
            <Text style={s.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : rows.length === 0 ? (
        <View style={s.emptyWrap}>
          <Ionicons name="chatbubble-ellipses-outline" size={40} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>No feedback yet</Text>
          <Text style={s.emptyDesc}>
            Feedback appears here after beta users complete their first AI session.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.gold}
            />
          }
        >
          <SummaryBar rows={rows} />
          {rows.map((row) => (
            <FeedbackCard key={row.id} row={row} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },

  filterScroll:  { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  filterChipActive:     { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  filterChipText:       { fontSize: FontSize.xs, color: Colors.textMuted },
  filterChipTextActive: { color: Colors.gold, fontWeight: FontWeight.semibold },

  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },

  loadingWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm,
  },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted },

  errorWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, gap: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.sm, color: Colors.error,
    textAlign: 'center', lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  retryBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary },

  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary,
  },
  emptyDesc: {
    fontSize: FontSize.sm, color: Colors.textMuted,
    textAlign: 'center', lineHeight: 20, maxWidth: 280,
  },
});
