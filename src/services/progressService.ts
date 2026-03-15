import { supabase } from '../lib/supabase';
import type { AlignmentResult } from '../types';

const table = () => supabase.from('progress_snapshots') as any;

export async function saveProgressSnapshot(
  userId: string,
  date: string,
  result: AlignmentResult,
  distractionCount = 0,
): Promise<void> {
  const { error } = await table().upsert(
    {
      user_id: userId,
      date,
      score: result.score,
      task_score: result.taskScore,
      rule_score: result.ruleScore,
      critical_score: result.criticalScore,
      reflection_score: result.reflectionScore,
      label: result.label,
      distraction_count: distractionCount,
    },
    { onConflict: 'user_id,date' },
  );
  if (error) console.warn('[progressService] saveProgressSnapshot:', error.message);
}
