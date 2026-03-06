import type { EventCategory } from '../types';

export interface ParsedEvent {
  title: string;
  start: string;       // "HH:MM"
  end: string;         // "HH:MM"
  category: EventCategory;
  location?: string;
  daysOfWeek: number[]; // 0=Sun … 6=Sat
  recurring: boolean;
}

const VALID_CATEGORIES: EventCategory[] = ['class', 'work', 'health', 'personal', 'social', 'other'];
const HH_MM = /^\d{2}:\d{2}$/;

function isValidEvent(e: unknown): e is ParsedEvent {
  if (!e || typeof e !== 'object') return false;
  const ev = e as Record<string, unknown>;
  if (typeof ev.title !== 'string' || !ev.title.trim()) return false;
  if (typeof ev.start !== 'string' || !HH_MM.test(ev.start)) return false;
  if (typeof ev.end !== 'string' || !HH_MM.test(ev.end)) return false;
  if (!Array.isArray(ev.daysOfWeek) || ev.daysOfWeek.length === 0) return false;
  return true;
}

function normalizeCategory(raw: unknown): EventCategory {
  if (typeof raw === 'string' && VALID_CATEGORIES.includes(raw as EventCategory)) {
    return raw as EventCategory;
  }
  return 'other';
}

export async function parseScheduleImages(
  base64Images: { data: string; mimeType: string }[],
  apiKey: string,
): Promise<ParsedEvent[]> {
  const imageBlocks = base64Images.map((img) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      data: img.data,
    },
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system:
        'You are a university schedule parser. Extract all events from the schedule image(s). ' +
        'Return ONLY valid JSON — an array of event objects with these fields: ' +
        'title (string), start (HH:MM 24h), end (HH:MM 24h), ' +
        'daysOfWeek (array of integers 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat), ' +
        'category (one of: class, work, health, personal, social, other), ' +
        'location (string, optional), recurring (boolean). ' +
        'Do not include any explanation or markdown — just the raw JSON array.',
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            {
              type: 'text',
              text: 'Extract all schedule events from the image(s) above and return them as a JSON array.',
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText: string = data?.content?.[0]?.text ?? '[]';

  // Strip markdown code fences if present
  const cleaned = rawText.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to parse JSON from Claude response');
  }

  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array from Claude');

  return parsed
    .filter(isValidEvent)
    .map((e) => ({
      title: e.title.trim(),
      start: e.start,
      end: e.end,
      category: normalizeCategory(e.category),
      location: typeof e.location === 'string' && e.location.trim() ? e.location.trim() : undefined,
      daysOfWeek: (e.daysOfWeek as number[]).filter((d) => d >= 0 && d <= 6).sort(),
      recurring: e.recurring !== false,
    }));
}
