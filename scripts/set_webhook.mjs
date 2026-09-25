// Registers the Vercel URL with Telegram, then prints getWebhookInfo.
// Usage: node scripts/set_webhook.mjs [https://your-app.vercel.app]
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

const token = env.TELEGRAM_BOT_TOKEN;
const secret = env.TELEGRAM_WEBHOOK_SECRET;
const base = (process.argv[2] || env.VERCEL_URL_PROD || '').replace(/\/$/, '');
if (!token || !secret || !base) {
  console.error('Missing TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET or the Vercel URL.');
  process.exit(1);
}

const api = (m, body) =>
  fetch(`https://api.telegram.org/bot${token}/${m}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then((r) => r.json());

const set = await api('setWebhook', {
  url: `${base}/api/webhook`,
  secret_token: secret,
  allowed_updates: ['message', 'channel_post'],
  drop_pending_updates: true,
});
console.log('setWebhook:', JSON.stringify(set));

const info = await api('getWebhookInfo');
console.log('getWebhookInfo:', JSON.stringify(info, null, 2));
