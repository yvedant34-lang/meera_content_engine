// Supabase via PostgREST (no SDK). Server-only: uses the secret/service key. Never deletes rows.
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`supabase ${method} ${path.split('?')[0]}: ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// Returns the new note row, or null if this telegram_update_id was already stored (Telegram retry).
export async function insertNote(n) {
  const rows = await rest('notes?on_conflict=telegram_update_id', {
    method: 'POST', body: n, prefer: 'return=representation,resolution=ignore-duplicates',
  });
  return rows?.[0] || null;
}

export const updateNote = (id, patch) =>
  rest(`notes?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });

export async function insertDraft(d) {
  const rows = await rest('drafts', { method: 'POST', body: d, prefer: 'return=representation' });
  return rows[0];
}

export const updateDraft = (id, patch) =>
  rest(`drafts?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });

export async function draftByMessageId(messageId) {
  const rows = await rest(`drafts?telegram_message_ids=cs.{${Number(messageId)}}&select=id,status&limit=1`);
  return rows[0] || null;
}

export async function activeVoice() {
  const rows = await rest('voice_skill?active=eq.true&select=version,content&limit=1');
  return rows[0] || null;
}
