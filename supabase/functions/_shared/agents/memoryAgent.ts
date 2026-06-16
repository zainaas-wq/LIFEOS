/**
 * Memory Agent — Sprint 3
 *
 * Specializes in: retrieving memories, answering "what did I learn/decide/note",
 * and synthesizing knowledge from the user's stored history.
 *
 * Context injected: retrieved memories (semantic), goal history, reflection history.
 * System prompt: focused on recall, synthesis, and knowledge connection.
 */

// ─── Types (local, Deno-compatible) ──────────────────────────────────────────

export interface MemoryAgentContext {
  todayDate: string;
  retrievedMemories: Array<{
    title:      string;
    content:    string;
    source:     string;
    tags:       string[];
    similarity: number;
  }>;
  recentReflections: Array<{ date: string; content: string }>;
  goals: Array<{ title: string; category: string }>;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

export function buildMemoryAgentPrompt(ctx: MemoryAgentContext): string {
  const memoryLines = ctx.retrievedMemories.length
    ? ctx.retrievedMemories
        .map(
          (m, i) =>
            `[${i + 1}] ${m.title} (${m.source}, relevance: ${Math.round(m.similarity * 100)}%)\n${m.content.slice(0, 600)}`,
        )
        .join('\n\n')
    : 'No relevant memories found for this query.';

  const reflectionLines = ctx.recentReflections.length
    ? ctx.recentReflections
        .slice(0, 5)
        .map((r) => `• ${r.date}: ${r.content.slice(0, 200)}`)
        .join('\n')
    : '• No recent reflections.';

  const goalLines = ctx.goals.length
    ? ctx.goals.map((g) => `• ${g.title} (${g.category})`).join('\n')
    : '• No active goals.';

  return `You are the Memory Agent of LifeOS — a personal knowledge retrieval system.
Your role: surface what the user has learned, decided, noted, or experienced.
You have access to their personal memory store, retrieved by semantic similarity.

TODAY: ${ctx.todayDate}

═══ RETRIEVED MEMORIES (semantic match) ═══
${memoryLines}

═══ RECENT REFLECTIONS ═══
${reflectionLines}

═══ ACTIVE GOALS (for context) ═══
${goalLines}

═══ RETRIEVAL RULES ═══
1. Lead with the most relevant memory — cite it explicitly (title + date if available).
2. If multiple memories are relevant, connect them into a coherent synthesis.
3. If no memory matches well (similarity < 70%), say so honestly. Do not hallucinate.
4. Quote the user's own words when possible — they wrote these, they will recognize them.
5. Suggest a follow-up action if a memory reveals a gap or unfinished thought.
6. Keep responses under 200 words unless the user asks for detail.
7. No preamble — lead with the answer.`;
}
