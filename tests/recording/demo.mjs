// Scripted, recorded live demo in Telegram Web (recorder profile). Real bot, real replies.
// Writes: video (webm) + timeline.json (segment timestamps for editing the waits out).
import { chromium } from 'playwright';
import { writeFileSync, readdirSync, renameSync } from 'node:fs';

const DIR = new URL('.', import.meta.url).pathname;
const W = 600, H = 1000;
const CHANNEL = 'https://web.telegram.org/a/#-1004457260963';
const NOTE_05 = "Clean beauty as a term. It means nothing regulatory and everything marketing. The problem is that the audience that finds 'clean beauty' meaningful is also an audience that's engaged and willing to pay for products they trust - which is exactly the audience I want. So there's this tension where the term is imprecise in a way that I find intellectually uncomfortable but commercially it's pointing at something real: customers want transparency and safety assurance. I just think the mechanism they've landed on - ingredient blacklists - is a blunt instrument that doesn't actually deliver what they want. A product can pass every clean beauty checklist and still have ineffective actives at sub-therapeutic concentrations. The checklist doesn't address formulation quality at all. I think I want to write about this but I've said some version of this before and I'm not sure what the new angle is.";
const NOTE_03 = "Something that frustrated me recently — and I want to write about it carefully because it's a sourcing issue. We were reviewing a potential new emollient ingredient from a supplier. The spec sheet listed it as cold-pressed. Cold-pressing is a temperature-controlled extraction process, below 49 degrees Celsius typically, that preserves fatty acid profiles and doesn't degrade heat-sensitive compounds. When I asked for the processing documentation, they eventually sent over a production log that showed temperatures between 70 and 85 degrees Celsius during extraction. That's not cold-pressing. That's standard heat processing. The cold-pressed claim on the spec sheet was either a labelling error or not. I don't know which. We didn't use the ingredient. But we would have, if I hadn't asked for the documentation.";
const FEEDBACK = 'Good start. Make it shorter: three paragraphs, and end with a question for the reader instead of advice.';

const ctx = await chromium.launchPersistentContext(DIR + 'tg-profile', {
  headless: false, viewport: { width: W, height: H }, args: ['--window-position=80,20'],
  recordVideo: { dir: DIR + 'raw', size: { width: W, height: H } },
});
const page = ctx.pages()[0] || await ctx.newPage();
const t0 = Date.now();
const tl = [];                                   // {t, kind, label}
const mark = (kind, label = '') => { tl.push({ t: (Date.now() - t0) / 1000, kind, label }); console.log(((Date.now() - t0) / 1000).toFixed(1), kind, label); };
const sleep = (ms) => page.waitForTimeout(ms);

async function caption(text, sub = '') {
  await page.evaluate(([t, s]) => {
    let el = document.getElementById('demo-cap');
    if (!el) {
      el = document.createElement('div'); el.id = 'demo-cap';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(17,24,39,.92);color:#fff;font:600 15px/1.35 -apple-system,Segoe UI,sans-serif;padding:9px 14px;pointer-events:none;border-bottom:2px solid #8b5cf6';
      document.body.appendChild(el);
    }
    el.innerHTML = t + (s ? `<div style="font-weight:400;font-size:12.5px;opacity:.8;margin-top:2px">${s}</div>` : '');
  }, [text, sub]);
}

const msgs = () => page.locator('.Message');
const countWith = (s) => page.locator('.Message', { hasText: s }).count();
async function waitForNew(substr, before, timeoutMs = 240000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if ((await countWith(substr)) > before) return page.locator('.Message', { hasText: substr }).last();
    await sleep(1500);
  }
  throw new Error('timeout waiting for ' + substr);
}
async function clearReply() {
  // Close any lingering "replying to" bar so a new note is a plain post, not a reply.
  for (let k = 0; k < 3; k++) {
    const bar = page.locator('.ComposerEmbeddedMessage.shown');
    if (!(await bar.count())) return;
    await bar.first().locator('button').first().click().catch(() => {});
    await sleep(500);
  }
}
async function send(text) {
  await clearReply();
  const box = page.locator('#editable-message-text');
  await box.click();
  await page.keyboard.type(text.slice(0, 60), { delay: 18 });   // visibly typed start
  await page.keyboard.insertText(text.slice(60));                // rest pasted
  await sleep(600);
  await page.keyboard.press('Enter');
}
async function replyTo(msgLocator, text) {
  await msgLocator.scrollIntoViewIfNeeded();
  await msgLocator.locator('.message-content').first().click({ button: 'right' });
  await page.locator('.MenuItem', { hasText: /^Reply$/ }).first().click();
  await sleep(400);
  await page.keyboard.type(text, { delay: 22 });
  await sleep(500);
  await page.keyboard.press('Enter');
}
async function readThrough(msgLocator, ms = 7000) {
  // Scroll the message list so the whole bubble passes through view, top to bottom.
  await msgLocator.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    await page.evaluate(() => { const l = document.querySelector('.MessageList'); if (l) l.scrollBy(0, 170); });
    await sleep(ms / steps);
  }
}

try {
  await page.goto(CHANNEL);
  await page.waitForSelector('#editable-message-text', { timeout: 30000 });
  await sleep(1500);
  mark('intro');
  await caption('Meera Content Engine · live Telegram demo', 'Real bot on Vercel · Gemini · Supabase. Meera reviews everything; nothing is auto-posted.');
  await sleep(3500);

  // 1. Note 05 in
  mark('step', 'note05');
  await caption('1 · Meera drops a raw note into her channel', 'Test note 05: clean beauty');
  let before = await countWith('DRAFT ·');
  await send(NOTE_05);
  await sleep(1500);
  mark('wait_start', 'draft05');
  await caption('⏩ Bot is scoring, finding news, drafting…', 'Waiting time trimmed in this video');
  const d05 = await waitForNew('DRAFT ·', before);
  mark('wait_end', 'draft05');
  await sleep(1200);
  await caption('2 · Draft arrives in her voice', 'Score · news SOURCE with verify block · suggested posting slot');
  mark('read_start', 'draft05');
  await readThrough(d05, 9000);
  mark('read_end', 'draft05');

  // 2. Feedback -> v2
  mark('step', 'feedback');
  await caption('3 · Meera replies with feedback instead of approving', FEEDBACK);
  before = await countWith('REVISED DRAFT');
  await replyTo(d05, FEEDBACK);
  await sleep(1200);
  mark('wait_start', 'v2');
  await caption('⏩ Bot revises the draft from her feedback…', 'Waiting time trimmed in this video');
  const v2 = await waitForNew('REVISED DRAFT', before);
  mark('wait_end', 'v2');
  await sleep(1200);
  await caption('4 · Revised v2: shorter, ends on a question', 'Old version kept in Supabase as "revised"');
  mark('read_start', 'v2');
  await readThrough(v2, 8000);
  mark('read_end', 'v2');

  // 3. Approve v2
  mark('step', 'approve');
  await caption('5 · Meera approves v2', 'APPROVE only changes a status. It never posts.');
  before = await countWith('Marked approved');
  await replyTo(v2, 'APPROVE');
  mark('wait_start', 'approve');
  const ap = await waitForNew('Marked approved', before, 60000);
  mark('wait_end', 'approve');
  await ap.scrollIntoViewIfNeeded();
  await sleep(3500);

  // 4. Note 03 -> draft -> reject
  mark('step', 'note03');
  await caption('6 · Second note: test note 03 (cold-pressed sourcing)', 'Figures 49 / 70 / 85 °C must survive exactly');
  before = await countWith('DRAFT ·');
  await send(NOTE_03);
  await sleep(1500);
  mark('wait_start', 'draft03');
  await caption('⏩ Bot is scoring, finding news, drafting…', 'Waiting time trimmed in this video');
  const d03 = await waitForNew('DRAFT ·', before);
  mark('wait_end', 'draft03');
  await sleep(1200);
  await caption('7 · Draft for note 03', 'Numbers kept exactly · no invented facts');
  mark('read_start', 'draft03');
  await readThrough(d03, 6000);
  mark('read_end', 'draft03');
  await caption('8 · Meera rejects this one', 'Rejected drafts are kept, never deleted');
  before = await countWith('Marked rejected');
  await replyTo(d03, 'REJECT');
  mark('wait_start', 'reject');
  const rj = await waitForNew('Marked rejected', before, 60000);
  mark('wait_end', 'reject');
  await rj.scrollIntoViewIfNeeded();
  await sleep(3000);

  await caption('Done · every note, draft, feedback and decision is stored in Supabase', 'Meera stays the author: she edits and publishes on LinkedIn herself');
  mark('outro');
  await sleep(4000);
  mark('end');
} catch (e) {
  mark('error', e.message);
  await sleep(2000);
} finally {
  const video = page.video();
  await ctx.close();
  const path = await video.path();
  renameSync(path, DIR + 'raw/demo_raw.webm');
  writeFileSync(DIR + 'timeline.json', JSON.stringify(tl, null, 2));
  console.log('VIDEO', DIR + 'raw/demo_raw.webm');
}
