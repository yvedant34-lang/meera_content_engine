// The whole pipeline: note in -> score -> news -> draft -> Telegram + Supabase. APPROVE/REJECT handling.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as tg from './telegram.js';
import * as db from './db.js';
import { gemini, geminiCall, GEMINI_DRAFT_MODEL, GEMINI_COMPARE_MODEL } from './gemini.js';
import { claude } from './anthropic.js';
import { topNews } from './news.js';
import * as P from './prompts.js';
import { suggestSlot } from './slot.js';

const OWN_PREFIXES = ['DRAFT', 'Scored ', 'Marked approved', 'Marked rejected', 'Already marked',
  'Voice notes are not supported', 'I couldn', 'Something failed', '─────', 'No news', 'News feed',
  'REVISED DRAFT', 'This draft is already', 'Suggested posting'];
const DECISION = /^\s*(approve|reject)\s*[.!]?\s*$/i;

// Voice: active Supabase row first, then voice-skill.txt in the repo. Never invented here.
async function loadVoice() {
  try {
    const row = await db.activeVoice();
    if (row?.content) return { text: row.content, source: `supabase v${row.version}` };
  } catch (e) { console.error('voice from supabase failed:', e.message); }
  try {
    return { text: readFileSync(join(process.cwd(), 'voice-skill.txt'), 'utf8'), source: 'voice-skill.txt' };
  } catch {
    // Local test harness only (tests/run_local.mjs). Never set in Vercel.
    return process.env.__TEST_VOICE ? { text: process.env.__TEST_VOICE, source: 'TEST stand-in' } : null;
  }
}

async function score(text) {
  const { value: out, model } = await geminiCall({ system: P.SCORE_SYSTEM, user: `NOTE:\n"""\n${text}\n"""`, schema: P.SCORE_SCHEMA });
  console.log(`scored by ${model}`);
  const s = Math.max(0, Math.min(10, Math.round(Number(out.score))));
  if (!Number.isFinite(s)) throw new Error('scoring returned no number');
  return { score: s, reason: String(out.reason || '').trim().replace(/([^.!?])$/, '$1.') };
}

async function findNews(text) {
  try {
    const kw = await gemini({ system: P.KEYWORDS_SYSTEM, user: text, schema: P.KEYWORDS_SCHEMA });
    const phrase = String(kw.phrase || kw.terms?.slice(0, 3).join(' ') || '').trim();
    if (!phrase) return { news: null, line: 'No search phrase found; drafted without news.' };
    const news = await topNews(phrase);
    console.log(`news phrase="${phrase}" -> ${news ? news.headline : 'none'}`);
    if (!news) return { news: null, line: `No news found for "${phrase}"; drafted without news.` };
    // Relevance gate: irrelevant news never reaches the drafting model, so it cannot leak into the post.
    const rel = await gemini({ system: P.RELEVANCE_SYSTEM, schema: P.RELEVANCE_SCHEMA,
      user: `NOTE:\n${text}\n\nNEWS HEADLINE: ${news.headline}\nPUBLICATION: ${news.source}\nSUMMARY: ${news.summary}` });
    console.log(`news relevance=${rel.relevant}: ${rel.reason}`);
    return rel.relevant ? { news, phrase } : { news: null, line: 'News found but not relevant; drafted without news.' };
  } catch (e) {
    console.error('news failed:', e.message);
    return { news: null, line: 'News feed unavailable; drafted without news.' };
  }
}

// Constraint 2 guard: every number in the post must appear in the note or the news item.
const NUM = /\d+(?:[.,]\d+)*/g;
export function unsupportedNumbers(post, note, news) {
  const allowed = new Set([...(note.match(NUM) || []),
    ...((news ? `${news.headline} ${news.summary} ${news.date}` : '').match(NUM) || [])]);
  return [...new Set((post.match(NUM) || []).filter((n) => !allowed.has(n)))];
}

// A drafter is { kind: 'gemini', model } or { kind: 'anthropic' }.
async function draftOnce(drafter, system, user) {
  return drafter.kind === 'anthropic'
    ? claude({ system, user })
    : geminiCall({ model: drafter.model, system, user, timeoutMs: 90000 }).then((g) => ({ text: g.value, model: g.model }));
}

// Which models draft this note. Claude is optional: with no ANTHROPIC_API_KEY everything stays on Gemini.
export function drafters(mode = 'gemini', hasClaude = !!process.env.ANTHROPIC_API_KEY) {
  const g = { kind: 'gemini', model: GEMINI_DRAFT_MODEL };
  const second = hasClaude ? { kind: 'anthropic' } : { kind: 'gemini', model: GEMINI_COMPARE_MODEL };
  if (mode === 'both') return [g, second];
  if (mode === 'anthropic') {
    if (!hasClaude) console.warn('DRAFT_MODEL_PROVIDER=anthropic but no ANTHROPIC_API_KEY; drafting with Gemini');
    return [hasClaude ? { kind: 'anthropic' } : g];
  }
  return [g];
}

function parse(raw, news) {
  const m = raw.text.match(/\n?\s*NEWS_USED:\s*(yes|no)\s*$/i);
  let post = (m ? raw.text.slice(0, m.index) : raw.text).trim();
  // Safety net: if the marker is missing but the post names the publication, treat news as used.
  // Belt and braces: any visible reference to the news counts as use, so the verify block is never skipped.
  const refersToNews = !!news && (post.toLowerCase().includes(news.source.toLowerCase())
    || /\b(articles?|according to|a recent (piece|report|study|survey)|recent (coverage|commentary|reports|headlines)|industry commentary|experts (say|warn|suggest)|dermatologists? (say|warn|suggest)|projected to grow|market (is )?projected)\b/i.test(post));
  const used = !!news && ((m ? m[1].toLowerCase() === 'yes' : false) || refersToNews);
  post = post.replace(/^#+\s.*\n+/, '').replace(/\*\*/g, '');
  return { post, used, model: raw.model };
}

async function draftWith(drafter, note, voice, news, { user: userOverride, allowed = '' } = {}) {
  const system = P.draftSystem(voice);
  const user = userOverride || P.draftUser(note, news);
  console.log(`draft with=${drafter.model || drafter.kind} voice_chars=${voice.length} news=${news ? 'yes' : 'no'}`);
  let d = parse(await draftOnce(drafter, system, user), news);
  let bad = unsupportedNumbers(d.post, `${note} ${allowed}`, news);
  if (bad.length) {
    console.warn(`draft had unsupported figures ${bad.join(', ')}; regenerating once`);
    d = parse(await draftOnce(drafter, system,
      `${user}\n\nYour previous draft included figures that are not in the note or the news item: ${bad.join(', ')}. Rewrite the post without them. Do not introduce any other numbers.`), news);
    bad = unsupportedNumbers(d.post, `${note} ${allowed}`, news);
  }
  let body = d.used ? `${d.post}\n\n${P.verifyBlock(news)}` : d.post;
  if (bad.length) body += `\n\n⚠ Figures not in your note: ${bad.join(', ')}. Check or delete them before publishing.`;
  return { body, model: d.model, used: d.used, unsupported: bad };
}

async function handleDecision(msg, chatId, word) {
  const replyTo = msg.reply_to_message?.message_id;
  if (!replyTo) return tg.send(chatId, 'I couldn\'t tell which draft you mean. Reply directly to the draft message with APPROVE or REJECT.', msg.message_id);
  const d = await db.draftByMessageId(replyTo);
  if (!d) return tg.send(chatId, 'I couldn\'t match that reply to a draft. Reply directly to one of the draft messages.', msg.message_id);
  const status = word === 'approve' ? 'approved' : 'rejected';
  if (d.status !== 'pending') return tg.send(chatId, `Already marked ${d.status}. No change made.`, msg.message_id);
  await db.updateDraft(d.id, { status, decided_at: new Date().toISOString() });
  return tg.send(chatId, status === 'approved'
    ? 'Marked approved. Publish it yourself on LinkedIn when ready.'
    : 'Marked rejected. The note and draft are kept for review.', msg.message_id);
}

// Feedback loop: any other reply to a pending draft is treated as Meera's feedback.
// The old version is kept (status 'revised'); the new version is a fresh pending draft.
async function handleFeedback(msg, chatId, draftRef, feedback) {
  const old = await db.draftFull(draftRef.id);
  if (old.status !== 'pending') {
    return tg.send(chatId, `This draft is already ${old.status}. Send a new note to start again.`, msg.message_id);
  }
  if (!(await db.claimPending(old.id, 'revised'))) return 'duplicate-feedback';   // Telegram retry
  try {
    const note = await db.noteById(old.note_id);
    const voice = await loadVoice();
    const news = old.news_headline ? { headline: old.news_headline, source: old.news_source, date: old.news_date,
      url: old.news_url, summary: old.news_headline } : null;
    const previousPost = old.body.split('─────────────────────────────────')[0].replace(/\n\n⚠ Figures not in your note.*$/s, '').trim();
    const drafter = drafters((process.env.DRAFT_MODEL_PROVIDER || 'gemini').toLowerCase())[0];
    console.log(`revising draft v${old.version} with feedback (${feedback.length} chars)`);
    const d = await draftWith(drafter, note.text, voice.text, news,
      { user: P.reviseUser(note.text, news, previousPost, feedback), allowed: feedback });
    const version = (old.version || 1) + 1;
    const row = await db.insertDraft({ note_id: old.note_id, parent_draft_id: old.id, version, feedback,
      body: d.body, model: d.model, status: 'pending',
      news_headline: d.used ? news.headline : null, news_source: d.used ? news.source : null,
      news_date: d.used ? news.date : null, news_url: d.used ? news.url : null });
    const quoted = feedback.length > 90 ? `${feedback.slice(0, 87)}...` : feedback;
    const header = `REVISED DRAFT v${version} · ${d.model}\nYour feedback: "${quoted}"\nReply APPROVE, REJECT, or reply with more feedback.`;
    const ids = await tg.sendLong(chatId, `${header}\n\n${d.body}\n\n${suggestSlot()}`, msg.message_id);
    await db.updateDraft(row.id, { telegram_message_ids: ids });
    return 'revised';
  } catch (e) {
    console.error('revision failed:', e.message);
    await db.updateDraft(old.id, { status: 'pending', decided_at: null }).catch(() => {});   // give it back
    await tg.send(chatId, `Something failed while revising. The previous draft is still pending. (${e.message.slice(0, 120)})`, msg.message_id).catch(() => {});
    return 'error';
  }
}

export async function processUpdate(update) {
  const msg = update.channel_post || update.message;
  if (!msg) return 'no-message';
  const chatId = msg.chat.id;
  if (String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) return 'foreign-chat';
  if (msg.from?.is_bot || msg.via_bot) return 'bot-message';

  if (msg.voice || msg.audio || msg.video_note) {
    const n = await db.insertNote({ telegram_update_id: update.update_id, telegram_message_id: msg.message_id,
      chat_id: chatId, text: null, status: 'error', score_reason: 'voice note, not supported' });
    if (n) await tg.send(chatId, 'Voice notes are not supported yet, send it as text.', msg.message_id);
    return 'voice';
  }

  const text = (msg.text || '').trim();
  if (!text) return 'no-text';
  if (OWN_PREFIXES.some((p) => text.startsWith(p))) return 'own-message';

  const decision = text.match(DECISION);
  if (decision) { await handleDecision(msg, chatId, decision[1].toLowerCase()); return 'decision'; }

  // A reply to one of the bot's drafts that is not APPROVE/REJECT is feedback on that draft.
  const replyTo = msg.reply_to_message?.message_id;
  if (replyTo) {
    const ref = await db.draftByMessageId(replyTo);
    if (ref) return handleFeedback(msg, chatId, ref, text);
  }

  const note = await db.insertNote({ telegram_update_id: update.update_id, telegram_message_id: msg.message_id,
    chat_id: chatId, text, status: 'received' });
  if (!note) return 'duplicate';

  let step = 'scoring';
  try {
    const threshold = Number(process.env.SCORE_THRESHOLD || 6);
    const s = await score(text);
    await db.updateNote(note.id, { score: s.score, score_reason: s.reason });
    console.log(`note ${note.id} scored ${s.score}: ${s.reason}`);
    if (s.score < threshold) {
      await db.updateNote(note.id, { status: 'rejected_low_score' });
      await tg.send(chatId, `Scored ${s.score}/10. ${s.reason} No draft made.`, msg.message_id);
      return 'rejected';
    }

    step = 'loading the voice profile';
    const voice = await loadVoice();
    if (!voice) throw new Error('no active voice_skill row and no voice-skill.txt');
    console.log(`voice source=${voice.source} chars=${voice.text.length}`);

    step = 'finding news';
    const { news, line } = await findNews(text);

    const mode = (process.env.DRAFT_MODEL_PROVIDER || 'gemini').toLowerCase();
    let delivered = 0;
    const failures = [];
    // Each drafter is isolated: in comparison mode one model failing must not sink the other's draft.
    for (const drafter of drafters(mode)) {
      const name = drafter.model || drafter.kind;
      try {
        step = `drafting with ${name}`;
        const d = await draftWith(drafter, text, voice.text, news);
        const row = await db.insertDraft({ note_id: note.id, body: d.body, model: d.model, status: 'pending',
          news_headline: d.used ? news.headline : null, news_source: d.used ? news.source : null,
          news_date: d.used ? news.date : null, news_url: d.used ? news.url : null });
        step = 'sending the draft';
        const header = `DRAFT · ${d.model} · scored ${s.score}/10\nReply APPROVE, REJECT, or reply with feedback to get a revised version.`;
        const footer = `${line ? `\n\n${line}` : ''}\n\n${suggestSlot()}`;
        const ids = await tg.sendLong(chatId, `${header}\n\n${d.body}${footer}`, msg.message_id);
        await db.updateDraft(row.id, { telegram_message_ids: ids });
        delivered++;
      } catch (e) {
        console.error(`drafter ${name} failed at ${step}:`, e.message);
        failures.push(`${name}: ${e.message.split('\n')[0].slice(0, 120)}`);
      }
    }
    if (!delivered) throw new Error(failures.join(' | '));
    if (failures.length) await tg.send(chatId, `Something failed while drafting with ${failures.join('; ')}. The other draft above is complete.`, msg.message_id);
    await db.updateNote(note.id, { status: 'drafted' });
    return 'drafted';
  } catch (e) {
    console.error(`pipeline failed at ${step}:`, e.message);
    await db.updateNote(note.id, { status: 'error' }).catch(() => {});
    await tg.send(chatId, `Something failed while ${step}. Your note is saved. (${e.message.slice(0, 150)})`, msg.message_id).catch(() => {});
    return 'error';
  }
}
