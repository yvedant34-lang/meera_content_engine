# Live demo evidence — 25 Sep 2026

Bot `@skinstinct_meera_notes_bot` · private channel "Meera Notes" (`-1004457260963`) · `https://meera-content-engine-phi.vercel.app/api/webhook` · all runs in production, times IST.

| Checkpoint (CLAUDE.md) | What was sent | What came back | Supabase |
|---|---|---|---|
| 0.8 Webhook | `npm run set-webhook` | `"ok": true`, no `last_error_message`, pending 0 | – |
| L3·2 / L3·3 Note in, draft back | "Two wholesale buyers asked for our stability data…" (14:04) | Draft in the same channel, British English, voice source `supabase v1` (1,759 chars logged) | note `drafted`, draft `pending` |
| B1·1 Scoring, pass | same note | Scored 9/10, draft made | score 9 |
| B1·1 Scoring, fail | "call packaging vendor re: pump samples thurs" · "the thing about retinol is" | "Scored 0/10 … No draft made." · "Scored 2/10 … No draft made." | `rejected_low_score`, kept |
| B1·2 News angle | "Third customer this month… pH" (13:31) | Draft with verify block: headline, publication · date, link, ⚠ line | `news_source` stored |
| B1·2 News ignored | wholesale note (14:04) | Irrelevant item ignored, so no verify block | `news_source` null |
| B1·3 APPROVE | reply APPROVE to a draft | "Marked approved. Publish it yourself on LinkedIn when ready." | `approved` + `decided_at` |
| B1·3 REJECT | reply REJECT to a draft (14:11) | "Marked rejected. The note and draft are kept for review." | `rejected`, row kept |
| APPROVE not as a reply | "Approve" typed on its own | "I couldn't tell which draft you mean…" | no change |
| Constraint 9, voice | signed voice update (`tests/probe_live.mjs`) | "Voice notes are not supported yet, send it as text." | one `error` row |
| Constraint 5, duplicate | same update_id sent twice | one reply only | one row |
| Constraint 4, security | foreign chat · wrong secret · no secret | 200 ignored · 401 · 401 | no rows |
| Constraint 8, loops | update from a bot | ignored | no row |
| Model comparison | `DRAFT_MODEL_PROVIDER=both`, same wholesale note (14:09) | Two separate drafts, each approvable; one approved, one rejected | two draft rows |

## Honest caveats
- The comparison ran on the free Gemini tier after the daily quotas for `gemini-3.8-flash` (20/day) and `gemini-3.5-flash` were used up, so both drafts fell back to `gemini-3.1-flash-lite`. The mechanism works; a meaningful quality comparison needs quota (tomorrow, or billing on AI Studio).
- Drafts are review-ready, not publish-ready. Weak news items (market-size reports) still get used, and the verify block is the guard.
- Production runs `DRAFT_MODEL_PROVIDER=gemini` (single draft) again after the demo.

## Seed-note test run — Notes 02–05 (25 Sep, 14:50–15:05 IST)

Each note was posted to the live channel and checked with `node tests/check_note.mjs "<first words>"` (10 rule checks per note) plus a human read of the draft.

| Note | Score | Result | Checks | Human read |
|---|---|---|---|---|
| 02 Layering order | 9/10 | Drafted | 10/10 | **Bug found:** draft alluded to a news item ("Articles regarding…") while reporting it unused, so no verify block. Fixed (see below); re-run clean. |
| 03 Cold-pressed sourcing | 9/10 | Drafted | 10/10 | Best draft. 49/70/85 °C kept exactly, her uncertainty kept. Minor: "Last week" invented for "recently". |
| 04 Barrier types | 8/10 | Drafted | 10/10 | Faithful, adds nothing. Scored higher than expected for a trailing note; defensible, as the angle is clear. |
| 05 Clean beauty | 8/10 | Drafted | 10/10 | **Bug found:** market-size press release used as "news" filler. Fixed; re-run clean. Note: Meera says she has no new angle yet, and the scorer does not weigh that. |

Fixes deployed during the run (commits fc7d784, 5328a4a):
1. News filter: scan the top 10 Google News items, skip market-research releases, listicles and wire services.
2. Relevance gate: Gemini flash-lite judges whether the news can be cited as evidence for the note's exact point (4/4 on labelled cases); irrelevant news never reaches the drafting model.
3. Wider backstop: any reference to articles, commentary, experts or projections forces the verify block.

Known limits: drafts today came mostly from `gemini-3.1-flash-lite` (free-tier quotas for 3.8/3.5-flash used up), about 60–95 s per note; small inventions ("Last week", "I have seen this many times") still need Meera's edit; one Americanism ("toward") slipped past the spelling check.

## Recorded demo — 25 Sep, 15:31 IST (`demo_video/meera_bot_demo.mp4`, 53.8 s, not in git)
Scripted with `tests/recording/`, live bot, real replies. Note 05 → draft with news source (EU anti-greenwashing directive, Personal Care Insights, 22 Sept 2026) + verify block + posting slot → feedback ("shorter, three paragraphs, end with a question") → REVISED DRAFT v2 (231 → 165 words, source kept) → APPROVE. Note 03 → draft (49/70/85 °C exact) → REJECT. Bot waits sped up and captioned. New in this build: feedback revisions (old versions kept as `revised`), Tue–Thu 8:30–9:30 IST posting-slot suggestion (general guidance, labelled as such), sharper news search + relevance gate.
