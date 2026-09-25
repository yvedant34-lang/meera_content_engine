// Local end-to-end test: real Gemini, real Supabase, real Google News. Only Telegram is mocked.
// Usage: node tests/run_local.mjs [gemini|anthropic|both]   (test rows use chat_id -100999000)
import { readFileSync, existsSync } from 'node:fs';

for (const l of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const i = l.indexOf('=');
  if (/^[A-Z_]+=/.test(l) && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const CHAT = -100999000;
process.env.TELEGRAM_CHAT_ID = String(CHAT);
if (process.argv[2]) process.env.DRAFT_MODEL_PROVIDER = process.argv[2];

// Test-only voice stand-in when voice-skill.txt is absent: the voice anchors and style rules
// from CLAUDE.md sections 4 and 6 (Meera's own lines). NOT a voice profile; never seeded.
if (!existsSync(new URL('../voice-skill.txt', import.meta.url))) {
  process.env.__TEST_VOICE = `TEST STAND-IN (from CLAUDE.md, not the real voice skill).
Opens on a concrete claim or scene: "Last September I was at a trade fair in Mumbai."
States limits plainly: "I'm not a dermatologist. I don't have a medical degree."
Uses her own data with exact numbers: returns from humid cities "dropped to 8% in the following quarter."
Ends on an action for the reader, not a slogan: "You should ask for them."
First person, evidence led, calm and exact. Admits what she does not know. No hype, no emojis, no hashtags.
Paragraphs of 3 to 5 sentences.`;
}

const sent = [];
let nextId = 900000000 + Math.floor(Math.random() * 1e6) * 10;
globalThis.__tgMock = async (method, body) => {
  const id = nextId++;
  sent.push({ id, text: body.text, replyTo: body.reply_parameters?.message_id });
  return { ok: true, result: { message_id: id } };
};

const { processUpdate } = await import('../lib/pipeline.js');
const { split } = await import('../lib/telegram.js');
let uid = Date.now();
const upd = (text, extra = {}) => ({ update_id: ++uid, channel_post: { message_id: uid % 1e6, chat: { id: CHAT, type: 'channel' }, text, ...extra } });
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const take = () => sent.splice(0);

// 1. Strong note -> scored >= threshold, drafted
const strong = upd("Third customer this month asking if our serum works with their Vit C. Nobody publishes pH. That's the real answer to half these DMs.");
let t = Date.now();
let r = await processUpdate(strong);
let msgs = take();
check('strong note drafted', r === 'drafted', `${r}, ${((Date.now() - t) / 1000).toFixed(1)}s, ${msgs.length} msg(s)`);
const draftMsg = msgs.find((m) => m.text.startsWith('DRAFT'));
console.log('\n----- DRAFT AS SENT -----\n' + msgs.map((m) => m.text).join('\n[--next message--]\n') + '\n-------------------------\n');
const body = msgs.map((m) => m.text).join('\n');
check('no hashtags/emojis in draft', !/#\w|[\u{1F300}-\u{1FAFF}]/u.test(body));
check('verify block present iff news used', body.includes('NEWS SOURCE:') ? body.includes('⚠ Check this before publishing — you are the author of this claim') : true,
  body.includes('NEWS SOURCE:') ? 'news used' : 'news not used');

// 2. Duplicate delivery (Telegram retry) -> no second draft
r = await processUpdate(strong);
check('duplicate update skipped', r === 'duplicate' && take().length === 0, r);

// 3. Weak notes -> rejected with score <= 3
for (const weak of ['call packaging vendor re: pump samples thurs', 'the thing about retinol is', 'niacinamide post idea']) {
  r = await processUpdate(upd(weak));
  msgs = take();
  const m = msgs[0]?.text.match(/^Scored (\d+)\/10\. .+ No draft made\.$/);
  check(`weak note rejected: "${weak}"`, r === 'rejected' && m && Number(m[1]) <= 3, msgs[0]?.text);
}

// 4. APPROVE as a reply to the draft
await processUpdate(upd('APPROVE', { reply_to_message: { message_id: draftMsg?.id } }));
msgs = take();
check('APPROVE marks approved', msgs[0]?.text === 'Marked approved. Publish it yourself on LinkedIn when ready.', msgs[0]?.text);
await processUpdate(upd('approve', { reply_to_message: { message_id: draftMsg?.id } }));
check('second APPROVE is a no-op', take()[0]?.text.startsWith('Already marked approved'));

// 5. REJECT without reply, voice note, foreign chat, own message
await processUpdate(upd('REJECT'));
check('REJECT without reply asks for a reply', take()[0]?.text.startsWith("I couldn't tell which draft"));
await processUpdate({ update_id: ++uid, channel_post: { message_id: 1, chat: { id: CHAT }, voice: { duration: 3 } } });
check('voice note refused', take()[0]?.text === 'Voice notes are not supported yet, send it as text.');
r = await processUpdate({ update_id: ++uid, channel_post: { message_id: 1, chat: { id: -100111 }, text: 'hi' } });
check('foreign chat ignored', r === 'foreign-chat' && take().length === 0);
r = await processUpdate(upd('Scored 2/10. Something. No draft made.'));
check('own message ignored (no loop)', r === 'own-message' && take().length === 0);

// 6. Splitting
const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}. ` + 'x'.repeat(300)).join('\n\n');
const parts = split(long);
check('long draft split at paragraph breaks', parts.every((p) => p.length <= 4096) && parts.join('\n\n') === long, `${long.length} chars -> ${parts.length} msgs`);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
