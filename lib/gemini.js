// Gemini REST client (no SDK). Used for scoring, keyword extraction and L3 drafting.
// Retries overloaded/rate-limited calls with backoff, then falls back to lighter current models.
// Scoring + keywords use the lightest Flash model so the free-tier daily quota of 3.8-flash is kept for drafting.
export const GEMINI_FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || 'gemini-3.1-flash-lite';
export const GEMINI_DRAFT_MODEL = process.env.GEMINI_DRAFT_MODEL || 'gemini-3.8-flash';
// Second model for DRAFT_MODEL_PROVIDER=both when no Anthropic key is set.
export const GEMINI_COMPARE_MODEL = process.env.GEMINI_COMPARE_MODEL || 'gemini-3.5-flash';
const FALLBACKS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash,gemini-3.1-flash-lite')
  .split(',').map((s) => s.trim()).filter(Boolean);
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cooling = new Map();   // model -> time until which we skip it (per warm instance)

async function once(model, { system, user, schema, timeoutMs }) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: schema ? { responseMimeType: 'application/json', responseSchema: schema } : {},
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = new Error(`gemini ${model}: ${j.error?.message || r.status}`);
    e.retryable = RETRYABLE.has(r.status);
    e.status = r.status;
    throw e;
  }
  const text = (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
  if (!text) { const e = new Error(`gemini ${model}: empty response (${j.candidates?.[0]?.finishReason})`); e.retryable = true; throw e; }
  return schema ? JSON.parse(text) : text;
}

// Returns { value, model } where model is the one that actually answered.
export async function geminiCall({ model = GEMINI_FLASH_MODEL, system, user, schema, timeoutMs = 45000 }) {
  const all = [model, ...FALLBACKS.filter((m) => m !== model)];
  const now = Date.now();
  const chain = all.filter((m) => !(cooling.get(m) > now));   // skip models that just failed
  if (!chain.length) chain.push(...all);
  let last;
  for (const m of chain) {
    // 429 = quota for this model: move on at once. 5xx/overload: one quick retry, then move on.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const value = await once(m, { system, user, schema, timeoutMs });
        cooling.delete(m);
        return { value, model: m };
      } catch (e) {
        last = e;
        if (!e.retryable && e.name !== 'TimeoutError') throw e;   // bad key or bad request: stop
        console.warn(e.message.split('\n')[0]);
        if (e.status === 429 || e.name === 'TimeoutError' || attempt === 1) { cooling.set(m, Date.now() + 60000); break; }
        await sleep(1000);
      }
    }
  }
  throw last;
}

export const gemini = (opts) => geminiCall(opts).then((r) => r.value);
