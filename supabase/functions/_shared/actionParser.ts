/**
 * actionParser — Sprint 4: Action Layer
 *
 * Parses structured action blocks that the LLM embeds in its responses.
 * The LLM is instructed to append an <action>...</action> block when
 * the user explicitly requests an action (create memory, update goal, etc.).
 *
 * Format in LLM response:
 *   <action>{"type":"create_memory","data":{"title":"...","content":"...","tags":[...]}}</action>
 *
 * The caller strips this block from the display text and returns
 * the parsed action separately in the API response.
 *
 * All action types are strictly typed and allowlisted.
 */

// ─── Allowed action types ─────────────────────────────────────────────────────

export const ACTION_TYPES = [
  'create_memory',
  'update_goal',
  'complete_task',
  'create_reminder',
  'create_focus_session',
] as const;

export type ActionType = typeof ACTION_TYPES[number];

// ─── Action data shapes ───────────────────────────────────────────────────────

export interface CreateMemoryData {
  title:                string;
  content:              string;
  tags?:                string[];
  source?:              string;
  linked_project_id?:   string;
  linked_milestone_id?: string;
}

export interface UpdateGoalData {
  goal_title:    string;
  deadline?:     string;
  weekly_target?: number;
}

export interface CompleteTaskData {
  task_title: string;
}

export interface CreateReminderData {
  title:      string;
  trigger_at: string;     // HH:MM
  message?:   string;
}

export interface CreateFocusSessionData {
  goal_title:       string;
  duration_minutes: number;
}

export type ActionData =
  | { type: 'create_memory';      data: CreateMemoryData }
  | { type: 'update_goal';        data: UpdateGoalData }
  | { type: 'complete_task';      data: CompleteTaskData }
  | { type: 'create_reminder';    data: CreateReminderData }
  | { type: 'create_focus_session'; data: CreateFocusSessionData };

// ─── Parser ───────────────────────────────────────────────────────────────────

const ACTION_REGEX = /<action>([\s\S]*?)<\/action>/i;

/**
 * Extracts and parses an <action>...</action> block from LLM output.
 *
 * Returns:
 *   { displayText, action } where displayText has the block removed,
 *   or { displayText: original, action: null } if no valid block found.
 */
export function parseActionFromResponse(rawContent: string): {
  displayText: string;
  action: ActionData | null;
} {
  const match = ACTION_REGEX.exec(rawContent);
  if (!match) return { displayText: rawContent.trim(), action: null };

  // Remove the action block from display text
  const displayText = rawContent.replace(ACTION_REGEX, '').trim();

  let parsed: { type?: string; data?: Record<string, unknown> };
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    console.warn('[actionParser] Failed to parse action JSON:', match[1]);
    return { displayText: rawContent.trim(), action: null };
  }

  // Allowlist check
  if (!parsed.type || !ACTION_TYPES.includes(parsed.type as ActionType)) {
    console.warn('[actionParser] Unknown action type:', parsed.type);
    return { displayText, action: null };
  }

  const actionType = parsed.type as ActionType;
  const data       = parsed.data as Record<string, unknown> ?? {};

  // Per-type validation
  switch (actionType) {
    case 'create_memory': {
      if (!data.title || typeof data.title !== 'string') return { displayText, action: null };
      if (!data.content || typeof data.content !== 'string') return { displayText, action: null };
      return {
        displayText,
        action: {
          type: 'create_memory',
          data: {
            title:                String(data.title).slice(0, 200),
            content:              String(data.content).slice(0, 2000),
            tags:                 Array.isArray(data.tags) ? (data.tags as string[]).map(String).slice(0, 10) : [],
            source:               typeof data.source === 'string' ? data.source : 'ai_insight',
            linked_project_id:   typeof data.linked_project_id === 'string' ? data.linked_project_id : undefined,
            linked_milestone_id: typeof data.linked_milestone_id === 'string' ? data.linked_milestone_id : undefined,
          },
        },
      };
    }

    case 'update_goal': {
      if (!data.goal_title || typeof data.goal_title !== 'string') return { displayText, action: null };
      return {
        displayText,
        action: {
          type: 'update_goal',
          data: {
            goal_title:    String(data.goal_title),
            deadline:      typeof data.deadline === 'string' ? data.deadline : undefined,
            weekly_target: typeof data.weekly_target === 'number' ? data.weekly_target : undefined,
          },
        },
      };
    }

    case 'complete_task': {
      if (!data.task_title || typeof data.task_title !== 'string') return { displayText, action: null };
      return {
        displayText,
        action: { type: 'complete_task', data: { task_title: String(data.task_title) } },
      };
    }

    case 'create_reminder': {
      if (!data.title || typeof data.title !== 'string') return { displayText, action: null };
      if (!data.trigger_at || typeof data.trigger_at !== 'string') return { displayText, action: null };
      return {
        displayText,
        action: {
          type: 'create_reminder',
          data: {
            title:      String(data.title).slice(0, 200),
            trigger_at: String(data.trigger_at),
            message:    typeof data.message === 'string' ? String(data.message) : undefined,
          },
        },
      };
    }

    case 'create_focus_session': {
      if (!data.goal_title || typeof data.goal_title !== 'string') return { displayText, action: null };
      return {
        displayText,
        action: {
          type: 'create_focus_session',
          data: {
            goal_title:       String(data.goal_title),
            duration_minutes: typeof data.duration_minutes === 'number' ? data.duration_minutes : 25,
          },
        },
      };
    }

    default:
      return { displayText, action: null };
  }
}

// ─── System prompt injection ──────────────────────────────────────────────────

/**
 * Injects the action capability instructions at the end of any agent's system prompt.
 * Only injected when the user's message pattern suggests an action intent.
 */
export function buildActionInstructions(): string {
  return `
═══ ACTION CAPABILITY ═══
You can execute real actions in LifeOS. When the user EXPLICITLY asks you to CREATE, SAVE, UPDATE, or SET something, include an action block at the VERY END of your response, after your text reply:

<action>{"type":"ACTION_TYPE","data":{...}}</action>

ALLOWED ACTIONS:
• create_memory    → data: { title, content, tags[], linked_project_id?, linked_milestone_id? }
                     — when user asks to remember/save/note something; include linked_project_id when note is about a specific project (use the Project ID Reference table if available)
• update_goal      → data: { goal_title, deadline?, weekly_target? } — when user asks to change a goal
• complete_task    → data: { task_title }                      — when user asks to mark something done
• create_reminder  → data: { title, trigger_at (HH:MM), message? } — when user asks to set a reminder
• create_focus_session → data: { goal_title, duration_minutes } — when user asks to log focus

RULES:
- Only ONE action block per response.
- Only when the user EXPLICITLY requests the action ("create a memory", "save this", "remind me").
- Do NOT generate actions speculatively.
- Your text response must still be complete and useful without the action block.
- The action block must be valid JSON.`;
}

/**
 * Returns true when the message pattern suggests the user wants an action.
 * Used to decide whether to inject action instructions into the system prompt.
 */
export function isActionRequest(message: string): boolean {
  return /\b(create|save|remember|note|remind|set a reminder|update.*goal|mark.*done|log.*focus|add.*memory)\b/i.test(message);
}
