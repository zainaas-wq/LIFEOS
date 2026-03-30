/**
 * NVIDIA NIM provider adapter — OpenAI-compatible chat completions.
 *
 * NVIDIA NIM exposes an OpenAI-compatible /v1/chat/completions endpoint.
 * Used for cost-effective text requests (quick_nudge, focused_answer).
 *
 * Base URL:  https://integrate.api.nvidia.com/v1
 * Model:     meta/llama-3.1-8b-instruct  (fast, low-cost, strong instruction following)
 * Fallback model: nvidia/nemotron-mini-4b-instruct (if primary unavailable)
 *
 * Required secret: NVIDIA_NIM_API_KEY
 *
 * Cost profile vs OpenAI gpt-4o-mini:
 *   NIM Llama-3.1-8B:  ~$0.10 / 1M tokens (input+output combined)
 *   gpt-4o-mini:       ~$0.15 / 1M tokens input, $0.60 / 1M output
 *   → NIM is 2–4× cheaper for short, high-throughput requests
 *
 * Capability profile:
 *   Strong at: short instructions, factual Q&A, action-first nudges
 *   Weaker at: nuanced empathy (recovery_coach), multi-step planning (strategic)
 *   → Route only quick_nudge and focused_answer here
 */

import type { ProviderAdapter, ProviderResult, HistoryMessage, TokenUsage } from './types.ts';

const NIM_BASE_URL    = 'https://integrate.api.nvidia.com/v1';
const NIM_MODEL       = 'meta/llama-3.1-8b-instruct';
const MAX_TOKENS      = 1024;

export class NIMAdapter implements ProviderAdapter {
  readonly name = 'nim' as const;

  async callText(
    systemPrompt: string,
    history:      HistoryMessage[],
    userMessage:  string,
    signal:       AbortSignal,
  ): Promise<ProviderResult> {
    const apiKey = Deno.env.get('NVIDIA_NIM_API_KEY');
    if (!apiKey) throw new Error('NVIDIA_NIM_API_KEY secret is not configured');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       NIM_MODEL,
        max_tokens:  MAX_TOKENS,
        messages,
        temperature: 0.6,   // slightly more deterministic than default for planning tasks
        top_p:       0.95,
        stream:      false,
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 401) throw new Error('NVIDIA NIM: invalid API key');
      if (res.status === 429) throw new Error('NVIDIA NIM: rate limit reached');
      if (res.status === 503) throw new Error('NVIDIA NIM: service unavailable');
      throw new Error(`NVIDIA NIM error ${res.status}: ${text.slice(0, 120)}`);
    }

    const data    = await res.json();
    const content = (data?.choices?.[0]?.message?.content as string) ?? '';

    // NIM returns OpenAI-compatible usage object
    const usage: TokenUsage = {
      promptTokens:     data?.usage?.prompt_tokens     ?? 0,
      completionTokens: data?.usage?.completion_tokens ?? 0,
      totalTokens:      data?.usage?.total_tokens      ?? 0,
      provider:         'nim',
    };
    return { content, usage };
  }
}
