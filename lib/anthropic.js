// Claude Messages API (no SDK). Drafting from B1 onwards.
// Model id confirmed from Anthropic's claude-api skill (cached 2026-06-24): claude-opus-5.
// Opus 5: no temperature/top_p, thinking is adaptive by default, effort set via output_config.
export const CLAUDE_DRAFT_MODEL = process.env.CLAUDE_DRAFT_MODEL || 'claude-opus-5';

export async function claude({ system, user, maxTokens = 4000, effort = 'medium', timeoutMs = 150000 }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      // Server-side refusal fallback, recommended by Anthropic for Opus 5.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: CLAUDE_DRAFT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort },
      fallbacks: 'default',
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await r.json();
  if (j.type === 'error') throw new Error(`claude: ${j.error?.message}`);
  if (j.stop_reason === 'refusal') throw new Error(`claude refused (${j.stop_details?.category || 'unknown'})`);
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new Error(`claude: empty response (${j.stop_reason})`);
  return { text, model: j.model || CLAUDE_DRAFT_MODEL };
}
