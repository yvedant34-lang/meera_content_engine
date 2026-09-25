// Drafts one note and checks every number in the post appears in the note or the news item.
// Usage: node tests/fact_check.mjs [gemini|anthropic] "note text"
import { readFileSync } from 'node:fs';
for (const l of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const i = l.indexOf('=');
  if (/^[A-Z_]+=/.test(l) && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
process.env.TELEGRAM_CHAT_ID = '-100999000';
process.env.DRAFT_MODEL_PROVIDER = process.argv[2] || 'gemini';
// Same test-only stand-in as run_local.mjs when voice-skill.txt is absent.
process.env.__TEST_VOICE = `TEST STAND-IN (from CLAUDE.md, not the real voice skill).
Opens on a concrete claim or scene: "Last September I was at a trade fair in Mumbai."
States limits plainly: "I'm not a dermatologist. I don't have a medical degree."
Uses her own data with exact numbers: returns from humid cities "dropped to 8% in the following quarter."
Ends on an action for the reader, not a slogan: "You should ask for them."
First person, evidence led, calm and exact. Admits what she does not know. No hype, no emojis, no hashtags.
Paragraphs of 3 to 5 sentences.`;

const sent = [];
globalThis.__tgMock = async (m, b) => { sent.push(b.text); return { ok: true, result: { message_id: 900000000 + sent.length } }; };
const { processUpdate } = await import('../lib/pipeline.js');

const note = process.argv[3] || 'Mapped returns against humidity again. Humid-city texture returns went from 23% to 8% after we changed the base, actives identical. Most brands never ask what climate their base was validated for.';
const r = await processUpdate({ update_id: Date.now(), channel_post: { message_id: 1, chat: { id: -100999000 }, text: note } });
const all = sent.join('\n');
console.log(`result=${r}\n\n${all}\n`);
const [post, verify = ''] = all.split('─────────────────────────────────');
const nums = (s) => (s.match(/\d+(?:\.\d+)?/g) || []);
const allowed = new Set([...nums(note), ...nums(verify)]);
const header = new Set(nums(all.split('\n')[0]));   // "DRAFT · model · scored 7/10"
const bad = nums(post.split('\n').slice(2).join('\n')).filter((n) => !allowed.has(n) && !header.has(n));
console.log(bad.length ? `FACT CHECK FAIL: numbers not in note/news: ${[...new Set(bad)].join(', ')}` : 'FACT CHECK PASS: every number traces to the note or news');
