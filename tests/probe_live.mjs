// Sends signed Telegram-shaped updates to the LIVE webhook to prove the constraints in production.
// Usage: node tests/probe_live.mjs      (replies appear in the real channel)
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const URL_ = `${env.VERCEL_URL_PROD}/api/webhook`;
const chat = { id: Number(env.TELEGRAM_CHAT_ID), type: 'channel', title: 'Meera Notes' };
const post = (body, secret = env.TELEGRAM_WEBHOOK_SECRET) => fetch(URL_, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
  body: JSON.stringify(body),
}).then(async (r) => `${r.status} ${await r.text()}`);

const base = Math.floor(Date.now() / 1000) * 10;
const voice = { update_id: base, channel_post: { message_id: 900001, date: 0, chat, voice: { duration: 4, file_id: 'x' } } };
console.log('1. voice note (constraint 9)          ->', await post(voice));
console.log('2. same update again (constraint 5)   ->', await post(voice));
console.log('3. foreign chat (constraint 4)        ->', await post({ update_id: base + 1, message: { message_id: 1, date: 0, chat: { id: 123456, type: 'private' }, text: 'hello' } }));
console.log('4. message from a bot (constraint 8)  ->', await post({ update_id: base + 2, message: { message_id: 2, date: 0, chat, from: { id: 1, is_bot: true, first_name: 'b' }, text: 'loop test' } }));
console.log('5. wrong secret (constraint 4)        ->', await post({}, 'wrong'));
console.log('6. no secret header (constraint 4)    ->', await fetch(URL_, { method: 'POST', body: '{}' }).then((r) => r.status));

await new Promise((r) => setTimeout(r, 8000));
const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const rows = await (await fetch(`${env.SUPABASE_URL}/rest/v1/notes?telegram_update_id=in.(${base},${base + 1},${base + 2})&select=telegram_update_id,status,score_reason`, { headers: h })).json();
console.log('\nSupabase notes for these updates (expect exactly ONE row: the voice note):');
console.log(rows);
