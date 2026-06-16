/**
 * generate-embedding — Sprint 2: Semantic Memory Engine
 *
 * POST /functions/v1/generate-embedding
 * Authorization: Bearer <supabase-jwt>
 * Body: { memory_id: string }
 *
 * Fetches the memory's content from the `memories` table,
 * generates an OpenAI text-embedding-3-small vector (1536 dims),
 * and writes it back to the `embedding` column.
 *
 * Called fire-and-forget from the client after saving a memory.
 * Idempotent: re-running on the same memory_id is safe.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const EMBEDDING_MODEL  = 'text-embedding-3-small';
const EMBEDDING_DIMS   = 1536;
const MAX_INPUT_CHARS  = 8000;

function errorResponse(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function ok(body: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return errorResponse('Authentication required', 401);

  const supabaseUrl     = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openaiKey       = Deno.env.get('OPENAI_API_KEY');

  if (!supabaseUrl || !supabaseAnonKey) return errorResponse('Server misconfigured', 500);
  if (!openaiKey) return errorResponse('OpenAI key not configured', 500);

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return errorResponse('Invalid token', 401);

  const adminClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
  if (!adminClient) return errorResponse('Service role key not configured', 500);

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { memory_id?: string };
  try { body = await req.json(); } catch { return errorResponse('Invalid JSON', 400); }

  const { memory_id } = body;
  if (!memory_id || typeof memory_id !== 'string') {
    return errorResponse('memory_id is required', 400);
  }

  // ── Fetch memory ───────────────────────────────────────────────────────────
  const { data: memory, error: fetchErr } = await adminClient
    .from('memories')
    .select('id, user_id, title, content, embedding_status')
    .eq('id', memory_id)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !memory) return errorResponse('Memory not found', 404);
  if (memory.embedding_status === 'done') return ok({ status: 'already_done' });

  // ── Mark as processing ─────────────────────────────────────────────────────
  await adminClient.from('memories').update({ embedding_status: 'processing' }).eq('id', memory_id);

  // ── Build input string ─────────────────────────────────────────────────────
  const rawInput = `${memory.title}\n\n${memory.content}`.slice(0, MAX_INPUT_CHARS);

  // ── Generate embedding ─────────────────────────────────────────────────────
  try {
    const embRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: rawInput, dimensions: EMBEDDING_DIMS }),
    });

    if (!embRes.ok) {
      const text = await embRes.text().catch(() => '');
      await adminClient.from('memories').update({ embedding_status: 'failed' }).eq('id', memory_id);
      return errorResponse(`OpenAI error ${embRes.status}: ${text.slice(0, 120)}`, 502);
    }

    const embData = await embRes.json();
    const embedding: number[] = embData?.data?.[0]?.embedding;
    if (!embedding || embedding.length !== EMBEDDING_DIMS) {
      await adminClient.from('memories').update({ embedding_status: 'failed' }).eq('id', memory_id);
      return errorResponse('Unexpected embedding shape', 502);
    }

    // ── Store embedding ──────────────────────────────────────────────────────
    const { error: updateErr } = await adminClient
      .from('memories')
      .update({ embedding: JSON.stringify(embedding), embedding_status: 'done' })
      .eq('id', memory_id);

    if (updateErr) {
      console.error('[generate-embedding] store failed:', updateErr.message);
      return errorResponse('Failed to store embedding', 500);
    }

    return ok({ status: 'done', memory_id });
  } catch (err: unknown) {
    await adminClient.from('memories').update({ embedding_status: 'failed' }).eq('id', memory_id);
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-embedding] threw:', msg);
    return errorResponse(`Embedding failed: ${msg}`, 500);
  }
});
