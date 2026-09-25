// Local test of the feedback loop + posting slot. Real Gemini/Supabase, Telegram mocked.
import { readFileSync } from 'node:fs';
for (const l of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const i = l.indexOf('=');
  if (/^[A-Z_]+=/.test(l) && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const CHAT = -100999000;
process.env.TELEGRAM_CHAT_ID = String(CHAT);
const sent = [];
let nextId = 910000000 + Math.floor(Math.random() * 1e6) * 10;
globalThis.__tgMock = async (m, b) => { const id = nextId++; sent.push({ id, text: b.text }); return { ok: true, result: { message_id: id } }; };
const { processUpdate } = await import('../lib/pipeline.js');
const db = await import('../lib/db.js');
let uid = Date.now();
const upd = (text, replyTo) => ({ update_id: ++uid, channel_post: { message_id: uid % 1e6, chat: { id: CHAT }, text, ...(replyTo ? { reply_to_message: { message_id: replyTo } } : {}) } });
const res = []; const check = (n, ok, d = '') => { res.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
const take = () => sent.splice(0);

let r = await processUpdate(upd('Customers keep asking why our serum has no fragrance. It is not an oversight. Fragrance is the category with the highest contact sensitisation rate and the label term hides dozens of compounds.'));
let m = take(); const v1 = m.find((x) => x.text.startsWith('DRAFT'));
check('v1 drafted', r === 'drafted' && v1);
check('v1 has posting slot line', /Suggested posting slot: (Tuesday|Wednesday|Thursday)/.test(v1?.text || ''));
check('v1 header invites feedback', (v1?.text || '').includes('reply with feedback'));

const fb = 'Too long. Cut it to three short paragraphs and end with a question for the reader instead of advice.';
r = await processUpdate(upd(fb, v1.id)); m = take(); const v2 = m[0];
check('feedback -> revised v2', r === 'revised' && v2?.text.startsWith('REVISED DRAFT v2'), r);
const paras = (v2?.text || '').split('\n\n').slice(1).filter((p) => !p.startsWith('Suggested') && !p.startsWith('───')).length;
console.log('\n----- V2 -----\n' + v2?.text + '\n--------------\n');
check('v2 has posting slot', /Suggested posting slot/.test(v2?.text || ''));
const oldRow = await db.draftByMessageId(v1.id);
check('v1 kept, status revised', oldRow?.status === 'revised', oldRow?.status);

r = await processUpdate(upd('shorter please', v1.id)); m = take();
check('feedback on superseded v1 refused', m[0]?.text.startsWith('This draft is already revised'));

r = await processUpdate(upd('APPROVE', v2.id)); m = take();
check('APPROVE v2', m[0]?.text === 'Marked approved. Publish it yourself on LinkedIn when ready.');
const v2Row = await db.draftFull((await db.draftByMessageId(v2.id)).id);
check('v2 row: version 2, parent + feedback stored, approved', v2Row.version === 2 && v2Row.parent_draft_id && v2Row.feedback === fb && v2Row.status === 'approved');
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
