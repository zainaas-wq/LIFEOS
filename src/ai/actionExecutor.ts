/**
 * actionExecutor — Sprint 4: Action Layer (client-side)
 *
 * Receives a parsed AIAction from the Coach response and dispatches it
 * to the Zustand store. Called automatically after each AI response
 * that contains an action block.
 *
 * Returns an execution result so the UI can show confirmation.
 */

import { useAppStore } from '../store/useAppStore';
import { generateId }  from '../lib/utils';
import { scheduleNudge } from '../services/notificationService';
import type { AIAction, MemoryEntrySource, NudgeItem } from '../types';

export interface ExecutionResult {
  success:    boolean;
  message:    string;
  actionType: string;
}

/**
 * Executes a single AI action by dispatching to the store.
 * Fully synchronous for create/update/complete actions.
 * Fire-and-forget for any async side effects (Supabase sync happens inside store).
 */
export function executeAIAction(action: AIAction): ExecutionResult {
  const store = useAppStore.getState();

  try {
    switch (action.type) {

      // ── create_memory ──────────────────────────────────────────────────────
      case 'create_memory': {
        const { title, content, tags, source, linked_project_id, linked_milestone_id } = action.data as {
          title: string; content: string; tags?: string[]; source?: string;
          linked_project_id?: string; linked_milestone_id?: string;
        };
        if (!title || !content) return { success: false, message: 'Missing title or content', actionType: action.type };

        store.addLocalMemory({
          title:             String(title).slice(0, 200),
          content:           String(content).slice(0, 2000),
          source:            ((source as MemoryEntrySource) ?? 'ai_insight'),
          tags:              Array.isArray(tags) ? tags.map(String) : [],
          linkedProjectId:   linked_project_id,
          linkedMilestoneId: linked_milestone_id,
        });
        return { success: true, message: `Memory saved: "${title}"`, actionType: action.type };
      }

      // ── update_goal ────────────────────────────────────────────────────────
      case 'update_goal': {
        const { goal_title, deadline, weekly_target } = action.data as {
          goal_title: string; deadline?: string; weekly_target?: number;
        };
        if (!goal_title) return { success: false, message: 'Missing goal title', actionType: action.type };

        const goal = store.goals.find(
          (g) => g.title.toLowerCase() === String(goal_title).toLowerCase(),
        );
        if (!goal) return { success: false, message: `Goal not found: "${goal_title}"`, actionType: action.type };

        const patch: Record<string, unknown> = {};
        if (deadline)      patch.deadline          = String(deadline);
        if (weekly_target) patch.weeklyHoursTarget = Number(weekly_target);

        if (Object.keys(patch).length === 0) {
          return { success: false, message: 'No changes specified', actionType: action.type };
        }

        store.updateGoal(goal.id, patch);
        return { success: true, message: `Goal updated: "${goal.title}"`, actionType: action.type };
      }

      // ── complete_task ──────────────────────────────────────────────────────
      case 'complete_task': {
        const { task_title } = action.data as { task_title: string };
        if (!task_title) return { success: false, message: 'Missing task title', actionType: action.type };

        // Try plan items first
        const planItem = store.controlPlan?.plan.items.find(
          (i) => i.title.toLowerCase().includes(String(task_title).toLowerCase()),
        );
        if (planItem && !planItem.completed) {
          store.toggleControlPlanItem(planItem.id);
          return { success: true, message: `Task completed: "${planItem.title}"`, actionType: action.type };
        }

        // Try legacy tasks
        const task = store.tasks.find(
          (t) => t.title.toLowerCase().includes(String(task_title).toLowerCase()) && !t.completed,
        );
        if (task) {
          store.toggleTask(task.id);
          return { success: true, message: `Task completed: "${task.title}"`, actionType: action.type };
        }

        return { success: false, message: `Task not found: "${task_title}"`, actionType: action.type };
      }

      // ── create_reminder ────────────────────────────────────────────────────
      case 'create_reminder': {
        const { title, trigger_at, message: nudgeMsg } = action.data as {
          title: string; trigger_at: string; message?: string;
        };
        if (!title || !trigger_at) return { success: false, message: 'Missing reminder fields', actionType: action.type };

        // Create a NudgeItem in the control plan schedule
        const nudge: NudgeItem = {
          id:          generateId(),
          itemId:      generateId(),
          itemTitle:   String(title),
          triggerTime: String(trigger_at),
          type:        'opportunity' as const,
          urgency:     'medium' as const,
          contextReason: nudgeMsg ? String(nudgeMsg) : `Reminder: ${title}`,
        };

        // Add to control plan's nudgeSchedule if one exists
        const { controlPlan } = store;
        if (controlPlan) {
          const updated = {
            ...controlPlan,
            nudgeSchedule: [...(controlPlan.nudgeSchedule ?? []), nudge],
          };
          // @ts-ignore — controlPlan is read-only shape but we need direct update
          useAppStore.setState({ controlPlan: updated });
        }

        // Schedule the OS notification immediately (Sprint 5)
        scheduleNudge(nudge).catch(console.warn);

        return { success: true, message: `Reminder set for ${trigger_at}: "${title}"`, actionType: action.type };
      }

      // ── create_focus_session ───────────────────────────────────────────────
      case 'create_focus_session': {
        const { goal_title, duration_minutes } = action.data as {
          goal_title: string; duration_minutes?: number;
        };
        if (!goal_title) return { success: false, message: 'Missing goal title', actionType: action.type };

        const goal = store.goals.find(
          (g) => g.title.toLowerCase().includes(String(goal_title).toLowerCase()),
        );

        const durationMins = Number(duration_minutes ?? 25);
        const now          = new Date();
        const startTime    = new Date(now.getTime() - durationMins * 60_000);

        store.startFocus({
          id:              generateId(),
          goalId:          goal?.id,
          goalTitle:       goal?.title ?? String(goal_title),
          startedAt:       startTime.toISOString(),
          durationMinutes: durationMins,
        });
        store.endFocus();

        return { success: true, message: `Focus session logged: ${durationMins}min on "${goal?.title ?? goal_title}"`, actionType: action.type };
      }

      default:
        return { success: false, message: `Unknown action type: ${(action as { type: string }).type}`, actionType: (action as { type: string }).type };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[actionExecutor] failed:', msg);
    return { success: false, message: `Execution failed: ${msg}`, actionType: action.type };
  }
}
