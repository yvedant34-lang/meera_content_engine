// /api/webhook — Telegram entry point.
// Phase 0: security gate only (secret header + chat id). Pipeline arrives at L3·2.
import { timingSafeEqual } from 'node:crypto';

function secretOk(got) {
  const want = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!got || !want) return false;
  const a = Buffer.from(String(got));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('POST only');

  // Constraint 4: reject anything without the right secret token header.
  if (!secretOk(req.headers['x-telegram-bot-api-secret-token'])) {
    return res.status(401).send('unauthorised');
  }

  const update = req.body || {};
  const msg = update.channel_post || update.message;
  const chatId = msg?.chat?.id;

  // Constraint 4: only Meera's chat. Return 200 so Telegram does not retry.
  if (String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) {
    console.log(`ignored update ${update.update_id}: foreign chat`);
    return res.status(200).json({ ok: true, ignored: 'chat' });
  }

  console.log(`received update ${update.update_id} (${update.channel_post ? 'channel_post' : 'message'})`);
  return res.status(200).json({ ok: true });
}
