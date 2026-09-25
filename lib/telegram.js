// Telegram Bot API helpers: send messages and split long drafts at paragraph breaks.
const LIMIT = 4096;

// Tests set globalThis.__tgMock = async (method, body) => ({ ok: true, result: {...} })
async function call(method, body) {
  if (globalThis.__tgMock) return globalThis.__tgMock(method, body);
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description}`);
  return j;
}

// Plain text only (no parse_mode) so model output can never break Markdown/HTML parsing.
export async function send(chatId, text, replyTo) {
  const body = { chat_id: chatId, text, link_preview_options: { is_disabled: true } };
  if (replyTo) body.reply_parameters = { message_id: replyTo, allow_sending_without_reply: true };
  const j = await call('sendMessage', body);
  return j.result.message_id;
}

// Split at paragraph breaks; fall back to line, then hard cut, only if one block exceeds the limit.
export function split(text, limit = LIMIT) {
  const chunks = [];
  let cur = '';
  const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; };
  for (const para of text.split(/\n{2,}/)) {
    const add = cur ? `${cur}\n\n${para}` : para;
    if (add.length <= limit) { cur = add; continue; }
    push();
    if (para.length <= limit) { cur = para; continue; }
    for (const line of para.split('\n')) {
      const addL = cur ? `${cur}\n${line}` : line;
      if (addL.length <= limit) { cur = addL; continue; }
      push();
      let rest = line;
      while (rest.length > limit) { chunks.push(rest.slice(0, limit)); rest = rest.slice(limit); }
      cur = rest;
    }
  }
  push();
  return chunks;
}

// Sends every chunk in order; returns all message ids (stored against the draft).
export async function sendLong(chatId, text, replyTo) {
  const ids = [];
  for (const [i, chunk] of split(text).entries()) {
    ids.push(await send(chatId, chunk, i === 0 ? replyTo : undefined));
  }
  return ids;
}
