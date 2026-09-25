// Checks what the LIVE bot did with a note sent to the channel, against the workflow rules.
// Usage: node tests/check_note.mjs "first few words of the note"
import { readFileSync } from 'node:fs';
import { unsupportedNumbers } from '../lib/pipeline.js';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const get = (p) => fetch(`${env.SUPABASE_URL}/rest/v1/${p}`, { headers: h }).then((r) => r.json());

const start = process.argv[2];
const notes = await get(`notes?chat_id=eq.${env.TELEGRAM_CHAT_ID}&text=like.${encodeURIComponent(start + '*')}&order=created_at.desc&limit=1&select=*`);
const n = notes[0];
if (!n) { console.log('NO NOTE ROW FOUND — the webhook did not receive/store it'); process.exit(1); }
const drafts = await get(`drafts?note_id=eq.${n.id}&order=created_at&select=*`);
const threshold = Number(env.SCORE_THRESHOLD || 6);

const rows = [];
const check = (name, ok, detail = '') => rows.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
console.log(`NOTE  score=${n.score}/10  status=${n.status}\n      reason: ${n.score_reason}\n`);

check('stored on arrival (B1·3)', true, `update_id ${n.telegram_update_id}`);
check('scored 0-10 with a reason (B1·1)', Number.isInteger(n.score) && !!n.score_reason);
if (n.score < threshold) {
  check('below threshold -> rejected, no draft (B1·1)', n.status === 'rejected_low_score' && drafts.length === 0);
} else {
  check('at/above threshold -> drafted (L3·2)', n.status === 'drafted' && drafts.length > 0, `${drafts.length} draft(s)`);
}
const AMERICAN = /\b(color|colors|flavor|behavior|behaviors|analyze|analyzed|optimize|optimized|organization|recognize|realize|realized|stabilize|stabilizes|neutralize|oxidize|oxidizes|center|fiber|program|favorite|labeling|labeled)\b/gi;
for (const [i, d] of drafts.entries()) {
  const [post] = d.body.split('─────────────────────────────────');
  const words = post.trim().split(/\s+/).length;
  const paras = post.trim().split(/\n{2,}/).filter(Boolean).length;
  const newsText = d.news_headline ? { headline: d.news_headline, summary: '', date: d.news_date || '' } : null;
  const bad = unsupportedNumbers(post, n.text, newsText);
  const us = [...new Set((post.match(AMERICAN) || []).map((w) => w.toLowerCase()))];
  console.log(`--- draft ${i + 1}: ${d.model} · ${words} words · ${paras} paragraphs · status ${d.status} · msgs ${JSON.stringify(d.telegram_message_ids)}`);
  check(`d${i + 1} posted to Telegram (ids stored, C7)`, d.telegram_message_ids?.length > 0);
  check(`d${i + 1} status pending/decided (B1·3)`, ['pending', 'approved', 'rejected'].includes(d.status));
  check(`d${i + 1} no invented numbers (C2)`, bad.length === 0 || d.body.includes('Figures not in your note'), bad.length ? `unsupported: ${bad.join(', ')}` : '');
  check(`d${i + 1} verify block iff news used (B1·2)`, !!d.news_headline === d.body.includes('⚠ Check this before publishing — you are the author of this claim'), d.news_source ? `news: ${d.news_source}` : 'no news used');
  check(`d${i + 1} no hashtags/emojis (style)`, !/#\w|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(post));
  check(`d${i + 1} British spelling (rule 9)`, us.length === 0, us.join(', '));
  check(`d${i + 1} no banned phrases`, !/game.?changer|glow|skin-loving|!\s/i.test(post));
  console.log('\n' + post.trim() + '\n');
}
console.log(rows.join('\n'));
console.log(`\n${rows.filter((r) => r.startsWith('PASS')).length}/${rows.length} checks passed`);
