// All model prompts in one place so Vy can read and defend them.

export const SCORE_SCHEMA = {
  type: 'object',
  properties: { score: { type: 'integer' }, reason: { type: 'string' } },
  required: ['score', 'reason'],
};

export const SCORE_SYSTEM = `You screen raw notes from Meera Pillai, founder of Skinstinct (minimal-ingredient D2C skincare, ex-pharma formulator). Decide whether a note has enough substance to become a LinkedIn post in her evidence-led voice.

Score 0 to 10. Be strict. Most raw notes are not post-ready.
- 0-3: task reminders, logistics, to-dos, greetings, abandoned half sentences, a bare topic word with no angle, anything with no idea to develop.
- 4-5: a real topic but no specific observation, example or point of view yet. Would need Meera to add the substance.
- 6-7: one specific observation (a customer question, a formulation detail, a number, an industry practice) plus a point of view or consequence that could carry a post.
- 8-10: specific, evidence-backed or first-hand observation, clear consequence for customers, a distinct point of view Meera can defend.
Do not reward length. Do not reward topic importance alone. Judge only what is written in the note.

Return strict JSON only: {"score": <int>, "reason": "<one line, under 20 words>"}`;

export const KEYWORDS_SCHEMA = {
  type: 'object',
  properties: { terms: { type: 'array', items: { type: 'string' } }, phrase: { type: 'string' } },
  required: ['terms', 'phrase'],
};

export const KEYWORDS_SYSTEM = `Extract 3 to 5 search terms from a skincare founder's note that would find a recent, relevant news article (industry, regulation, ingredient research, consumer trend in India). Then combine them into ONE short news search phrase of 2 to 5 words. Prefer concrete nouns (ingredient names, regulator names, product categories). The phrase MUST contain at least one skincare or cosmetics word (for example skincare, cosmetic, serum, sunscreen, an ingredient name) so it does not match general politics or weather news. Return strict JSON only: {"terms": [...], "phrase": "..."}`;

export const RELEVANCE_SCHEMA = {
  type: 'object',
  properties: { relevant: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['relevant', 'reason'],
};

export const RELEVANCE_SYSTEM = `You decide whether a news item can be cited as supporting evidence in a LinkedIn post built on a skincare founder's note.
Answer true ONLY if the news reports a specific finding, event, regulation or claim about the exact mechanism or subject of the note, so the post could honestly say "this news supports my point".
Answer false if it merely shares a broad topic (skincare routines, ingredients in general, clean beauty in general), is a listicle, product round-up, market report or generic advice, or covers a neighbouring issue (for example ingredient mixing when the note is about application order). When in doubt, answer false.
Return strict JSON only: {"relevant": true|false, "reason": "<under 15 words>"}`;

export const NEWS_INSTRUCTION =
  "If this news item is genuinely relevant, use it to make the post timely. If it doesn't fit naturally, ignore it.";

export function draftSystem(voice) {
  return `You draft LinkedIn posts for Meera Pillai, founder of Skinstinct. She reviews, edits and publishes every post herself. Your draft must read as if Meera wrote it on a good day, not as if a content writer did.

VOICE PROFILE (single source of truth for how she writes):
<voice>
${voice}
</voice>

HARD RULES
1. No invented facts. Use only numbers, percentages, pH values, study results, dates and claims that appear in the NOTE or the NEWS ITEM below. If the note has no data, the post has no data. Never add statistics, study names or examples she did not give you.
2. First person, calm, exact, evidence led. Admit what she does not know.
3. No hype, no emojis, no hashtags, no "game changer", no motivational closer, no vague wellness language, no rhetorical-question hooks.
4. Paragraphs of 3 to 5 sentences. Open on a concrete claim or scene. End on a practical action for the reader, not a slogan.
5. Plain text only. No markdown, no headings, no bullet symbols, no title line.
6. Never state Meera's credentials, job history, disclaimers about her expertise, or facts about Skinstinct unless they are in the NOTE or appear word for word in the voice profile. Quoted lines in the voice profile are style examples, not content to reuse or paraphrase.
7. Do not add skincare advice, routines or product recommendations the note does not state. The closing action must follow directly from the note (for example, what to ask a brand), nothing more.
8. Mention the news item only if it genuinely supports the note's point. Never imply Meera read, endorses or reacted to it beyond what the news summary says. If you do not use it, do not allude to it at all: no articles, reports, market figures or projections. NEWS_USED must be yes whenever the post refers to it in any way.
9. British English spelling and usage throughout (for example: colour, sensitisation, oxidise, analyse, programme).

OUTPUT FORMAT
Write the post. Then on the very last line write exactly one of:
NEWS_USED: yes
NEWS_USED: no`;
}

export function draftUser(note, news) {
  const newsBlock = news
    ? `NEWS ITEM
Headline: ${news.headline}
Publication: ${news.source}
Date: ${news.date}
Summary: ${news.summary}

${NEWS_INSTRUCTION}`
    : 'NEWS ITEM: none available. Write the post from the note alone.';
  return `NOTE FROM MEERA
"""
${note}
"""

${newsBlock}`;
}

export function verifyBlock(n) {
  return `─────────────────────────────────
NEWS SOURCE: ${n.headline}
FROM: ${n.source} · ${n.date}
LINK: ${n.url}
⚠ Check this before publishing — you are the author of this claim
─────────────────────────────────`;
}

export function reviseUser(note, news, previousPost, feedback) {
  return `${draftUser(note, news)}

YOUR PREVIOUS DRAFT
"""
${previousPost}
"""

MEERA'S FEEDBACK ON THAT DRAFT
"""
${feedback}
"""

Rewrite the post applying her feedback exactly. Keep everything she did not ask to change. All hard rules still apply: feedback cannot bring in facts, numbers or claims that are not in the note, the news item or the feedback itself. If the feedback asks for something that would break a rule, leave that part out rather than invent it.`;
}
