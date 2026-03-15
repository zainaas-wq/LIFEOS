import { supabase } from '../lib/supabase';
import type { ControlDailyPlan, PlanItem } from '../types';

const plansTable = () => supabase.from('daily_plans') as any;
const itemsTable = () => supabase.from('daily_plan_items') as any;

/**
 * Save (replace) a ControlDailyPlan for a given date.
 * Deletes the existing plan row (cascades to items) then re-inserts.
 * Note: nudgeSchedule and nextBestAction are ephemeral — not stored in DB.
 */
export async function upsertDailyPlan(userId: string, cdp: ControlDailyPlan): Promise<void> {
  // Delete existing plan for this date (items cascade)
  const { error: deleteError } = await plansTable()
    .delete()
    .eq('user_id', userId)
    .eq('date', cdp.date);
  if (deleteError) {
    console.warn('[planService] upsertDailyPlan delete:', deleteError.message);
    return;
  }

  const { error: planError } = await plansTable().insert({
    id: cdp.plan.id,
    user_id: userId,
    date: cdp.date,
    type: cdp.plan.type,
    date_range_start: cdp.plan.dateRange.start,
    date_range_end: cdp.plan.dateRange.end,
    source: cdp.plan.source,
    generated_at: cdp.generatedAt,
  });
  if (planError) { console.warn('[planService] upsertDailyPlan:', planError.message); return; }

  if (cdp.plan.items.length === 0) return;

  const itemRows = cdp.plan.items.map((item: PlanItem) => ({
    id: item.id,
    user_id: userId,
    plan_id: cdp.plan.id,
    start_time: item.startTime,
    end_time: item.endTime,
    title: item.title,
    type: item.type,
    goal_id: item.goalId ?? null,
    skill_plan_id: item.skillPlanId ?? null,
    event_id: item.eventId ?? null,
    notes: item.notes ?? null,
    completed: item.completed,
    is_critical: item.isCritical ?? false,
    energy_required: item.energyRequired ?? null,
  }));

  const { error: itemsError } = await itemsTable().insert(itemRows);
  if (itemsError) console.warn('[planService] upsertDailyPlan items:', itemsError.message);
}

/**
 * Update a single plan item's completion status — cheaper than re-saving the whole plan.
 */
export async function updatePlanItemCompletion(
  userId: string,
  itemId: string,
  completed: boolean,
): Promise<void> {
  const { error } = await itemsTable()
    .update({ completed })
    .eq('id', itemId)
    .eq('user_id', userId);
  if (error) console.warn('[planService] updatePlanItemCompletion:', error.message);
}

/**
 * Load today's ControlDailyPlan from DB.
 * nudgeSchedule/nextBestAction are not stored — returned as empty/null.
 */
export async function getDailyPlan(
  userId: string,
  date: string,
): Promise<ControlDailyPlan | null> {
  const { data: planData, error: planError } = await plansTable()
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .single();

  if (planError) {
    if (planError.code !== 'PGRST116') {
      console.warn('[planService] getDailyPlan:', planError.message);
    }
    return null;
  }
  if (!planData) return null;

  const { data: itemsData, error: itemsError } = await itemsTable()
    .select('*')
    .eq('plan_id', planData.id)
    .eq('user_id', userId)
    .order('start_time', { ascending: true });

  if (itemsError) console.warn('[planService] getDailyPlan items:', itemsError.message);

  const items: PlanItem[] = (itemsData ?? []).map((row: any) => ({
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title,
    type: row.type,
    goalId: row.goal_id ?? undefined,
    skillPlanId: row.skill_plan_id ?? undefined,
    eventId: row.event_id ?? undefined,
    notes: row.notes ?? undefined,
    completed: row.completed,
    isCritical: row.is_critical || undefined,
    energyRequired: row.energy_required ?? undefined,
  }));

  return {
    plan: {
      id: planData.id,
      type: planData.type,
      dateRange: { start: planData.date_range_start, end: planData.date_range_end },
      items,
      generatedAt: planData.generated_at,
      source: planData.source,
    },
    nextBestAction: null,
    nudgeSchedule: [],
    generatedAt: planData.generated_at,
    date,
  };
}
