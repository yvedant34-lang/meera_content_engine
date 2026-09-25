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
