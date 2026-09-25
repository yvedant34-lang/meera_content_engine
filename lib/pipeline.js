// The whole pipeline: note in -> score -> news -> draft -> Telegram + Supabase. APPROVE/REJECT handling.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as tg from './telegram.js';
import * as db from './db.js';
import { gemini, geminiCall, GEMINI_DRAFT_MODEL } from './gemini.js';
import { claude } from './anthropic.js';
import { topNews } from './news.js';
import * as P from './prompts.js';

const OWN_PREFIXES = ['DRAFT', 'Scored ', 'Marked approved', 'Marked rejected', 'Already marked',
  'Voice notes are not supported', 'I couldn', 'Something failed', '─────', 'No news', 'News feed'];
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
    return news ? { news, phrase } : { news: null, line: `No news found for "${phrase}"; drafted without news.` };
  } catch (e) {
    console.error('news failed:', e.message);
    return { news: null, line: 'News feed unavailable; drafted without news.' };
  }
}

async function draftWith(provider, note, voice, news) {
  const system = P.draftSystem(voice);
  const user = P.draftUser(note, news);
  console.log(`draft provider=${provider} voice_chars=${voice.length} news=${news ? 'yes' : 'no'}`);
  const raw = provider === 'anthropic'
    ? await claude({ system, user })
    : await geminiCall({ model: GEMINI_DRAFT_MODEL, system, user, timeoutMs: 90000 }).then((g) => ({ text: g.value, model: g.model }));
  const m = raw.text.match(/\n?\s*NEWS_USED:\s*(yes|no)\s*$/i);
  let post = (m ? raw.text.slice(0, m.index) : raw.text).trim();
  // Safety net: if the marker is missing but the post names the publication, treat news as used.
  const used = !!news && (m ? m[1].toLowerCase() === 'yes' : post.toLowerCase().includes(news.source.toLowerCase()));
  post = post.replace(/^#+\s.*\n+/, '').replace(/\*\*/g, '');
  return { body: used ? `${post}\n\n${P.verifyBlock(news)}` : post, model: raw.model, used };
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
    const providers = mode === 'both' ? ['gemini', 'anthropic'] : [mode === 'anthropic' ? 'anthropic' : 'gemini'];
    for (const provider of providers) {
      step = `drafting with ${provider}`;
      const d = await draftWith(provider, text, voice.text, news);
      const row = await db.insertDraft({ note_id: note.id, body: d.body, model: d.model, status: 'pending',
        news_headline: d.used ? news.headline : null, news_source: d.used ? news.source : null,
        news_date: d.used ? news.date : null, news_url: d.used ? news.url : null });
      step = 'sending the draft';
      const header = `DRAFT · ${d.model} · scored ${s.score}/10\nReply APPROVE or REJECT to this message.`;
      const footer = line ? `\n\n${line}` : '';
      const ids = await tg.sendLong(chatId, `${header}\n\n${d.body}${footer}`, msg.message_id);
      await db.updateDraft(row.id, { telegram_message_ids: ids });
    }
    await db.updateNote(note.id, { status: 'drafted' });
    return 'drafted';
  } catch (e) {
    console.error(`pipeline failed at ${step}:`, e.message);
    await db.updateNote(note.id, { status: 'error' }).catch(() => {});
    await tg.send(chatId, `Something failed while ${step}. Your note is saved. (${e.message.slice(0, 150)})`, msg.message_id).catch(() => {});
    return 'error';
  }
}
