/**
 * OpenAI provider adapter — chat completions (gpt-4o-mini).
 *
 * Handles text chat only. Vision and Whisper remain in index.ts
 * as they are single-provider operations not subject to routing.
 *
 * Required secret: OPENAI_API_KEY
 */

import type { ProviderAdapter, ProviderResult, HistoryMessage, TokenUsage } from './types.ts';

const OPENAI_MODEL = 'gpt-4o-mini';
const MAX_TOKENS   = 1024;

export class OpenAIAdapter implements ProviderAdapter {
  readonly name = 'openai' as const;

  async callText(
    systemPrompt: string,
    history:      HistoryMessage[],
    userMessage:  string,
    signal:       AbortSignal,
  ): Promise<ProviderResult> {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY secret is not configured');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${apiKey}`,
      },
      body:   JSON.stringify({ model: OPENAI_MODEL, max_tokens: MAX_TOKENS, messages }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 401) throw new Error('OpenAI: invalid API key');
      if (res.status === 429) throw new Error('OpenAI: rate limit reached');
      throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 120)}`);
    }

    const data    = await res.json();
    const content = (data?.choices?.[0]?.message?.content as string) ?? '';
    const usage: TokenUsage = {
      promptTokens:     data?.usage?.prompt_tokens     ?? 0,
      completionTokens: data?.usage?.completion_tokens ?? 0,
      totalTokens:      data?.usage?.total_tokens      ?? 0,
      provider:         'openai',
    };
    return { content, usage };
  }
}
