// /api/webhook — the single Vercel function. Security gate, fast 200, pipeline runs after the reply.
import { timingSafeEqual } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { processUpdate } from '../lib/pipeline.js';

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

  // Constraint 4: only Meera's chat. 200 so Telegram does not retry foreign updates.
  if (!msg || String(msg.chat?.id) !== String(process.env.TELEGRAM_CHAT_ID)) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  // Constraint 5: answer Telegram immediately so it never retries a slow run.
  // The pipeline keeps running after the response (up to maxDuration in vercel.json).
  waitUntil(
    processUpdate(update)
      .then((r) => console.log(`update ${update.update_id}: ${r}`))
      .catch((e) => console.error(`update ${update.update_id} crashed:`, e))
  );
  return res.status(200).json({ ok: true });
}
