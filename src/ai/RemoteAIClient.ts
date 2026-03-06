/**
 * RemoteAIClient — stub for the Anthropic Claude API.
 *
 * Phase 2: swap LocalAIClient for this once an API key is configured.
 * The API key is stored in the Zustand store (Settings → AI Planner).
 * It is NEVER hardcoded here.
 *
 * To enable:
 *   import { resetAIClient, getAIClient } from './AIClient';
 *   resetAIClient();
 *   const client = getAIClient('remote', myApiKey);
 */

import type { AIClient, AIContext } from './AIClient';
import type { ChatMessage, Plan } from '../types';
import { generateDailyPlanItems, generateWeeklyPlanItems } from './planGenerator';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function buildSystemPrompt(ctx: AIContext): string {
  const goalLines = ctx.goals
    .sort((a, b) => a.priority - b.priority)
    .map((g) => `- ${g.title} (${g.category}, ${g.weeklyHoursTarget}h/week, priority ${g.priority})`)
    .join('\n');

  const ruleLines = ctx.rules
    .filter((r) => r.enabled)
    .map((r) => `- ${r.title}`)
    .join('\n');

  return `You are LifeOS, a concise personal productivity assistant.

USER CONTEXT:
Main focus: ${ctx.mainFocus || 'Not specified'}
Today: ${ctx.todayDate}

Goals:
${goalLines || 'None yet'}

Active rules:
${ruleLines || 'None'}

Keep replies short (≤ 3 paragraphs). When the user asks for a plan, output ONLY a compact schedule — no preamble.`;
}

export class RemoteAIClient implements AIClient {
  constructor(private readonly apiKey: string) {}

  async chat(
    userMessage: string,
    history: ChatMessage[],
    context: AIContext,
  ): Promise<ChatMessage> {
    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMessage },
    ];

    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(context),
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 401) throw new Error('Invalid API key.');
      if (response.status === 429) throw new Error('Rate limit reached.');
      throw new Error(`API error ${response.status}: ${body.slice(0, 100)}`);
    }

    const data = await response.json();
    const text: string = data?.content?.[0]?.text ?? '';

    return {
      id: uid(),
      role: 'assistant',
      content: text || '(empty response)',
      createdAt: new Date().toISOString(),
    };
  }

  async generateDailyPlan(date: string, context: AIContext): Promise<Plan> {
    // For now, fall back to deterministic generator even in remote mode.
    // A future version could ask Claude to output structured JSON.
    return generateDailyPlanItems(
      context.goals,
      context.scheduleEvents,
      context.skillPlans,
      context.rules,
      date,
    );
  }

  async generateWeeklyPlan(startDate: string, context: AIContext): Promise<Plan> {
    return generateWeeklyPlanItems(
      context.goals,
      context.scheduleEvents,
      context.skillPlans,
      context.rules,
      startDate,
    );
  }
}
