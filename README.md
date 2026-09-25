# meera_content_engine

Telegram content engine for Meera Pillai (Skinstinct). Notes dropped into her private Telegram channel become LinkedIn drafts in her voice. She reviews, edits and publishes them herself. Nothing is ever auto-posted (The Cut).

Built for MESA AI and its Application, Cohort C4, Case 1.

## Pipeline
Telegram note → `/api/webhook` (Vercel, answers Telegram at once) → Gemini Flash scores 0 to 10 → below 6: "Scored X/10 … No draft made." → Gemini extracts a search phrase → Google News RSS (India, last 30 days) → drafting model (Gemini, or Claude from B1) with the voice skill → draft back in Telegram, verify block if news was used → reply APPROVE / REJECT → status saved in Supabase.

## What each file does
| File | One line |
|---|---|
| `api/webhook.js` | The only serverless function: checks the secret header and chat id, replies 200 at once, then runs the pipeline in the background. |
| `lib/pipeline.js` | The whole flow: dedupe, score, news, draft, send, save; plus APPROVE/REJECT, voice-note refusal and loop guards. |
| `lib/prompts.js` | Every prompt the models see: scoring rubric, keyword extraction, drafting rules, the verify block. |
| `lib/gemini.js` | Calls Gemini (scoring/keywords on 3.1-flash-lite, drafts on 3.8-flash) with a fallback chain when a model is overloaded or out of quota. |
| `lib/anthropic.js` | Optional: calls Claude (`claude-opus-5`) only if ANTHROPIC_API_KEY is set; otherwise all drafting stays on Gemini. |
| `lib/news.js` | Fetches and parses the top Google News RSS result. No key. |
| `lib/db.js` | Reads and writes Supabase over REST with the server key. Never deletes. |
| `lib/telegram.js` | Sends plain-text messages and splits long drafts at paragraph breaks under 4,096 chars. |
| `supabase/migrations/…_init.sql` | Tables `notes`, `drafts`, `voice_skill`; RLS on, no public access. |
| `scripts/set_webhook.mjs` | Registers the Vercel URL with Telegram and prints `getWebhookInfo`. |
| `scripts/seed_voice.mjs` | Loads `voice-skill.txt` into Supabase as the new active voice version. |
| `tests/run_local.mjs` | End-to-end test with real Gemini, Supabase and News; only Telegram is mocked. |
| `tests/fact_check.mjs` | Drafts one note and fails if the post contains a number not in the note or news. |
| `vercel.json` | Gives the function 300s (the Hobby plan maximum). |

## Commands
```
npm test                 # 14 local checks (test rows use chat_id -100999000)
npm run fact-check       # number-level check on one draft
npm run seed-voice       # after voice-skill.txt changes
npm run set-webhook -- https://<your-app>.vercel.app
```

## Setup
1. Copy `.env.example` to `.env` and fill it in. Never commit `.env`.
2. Build instructions: `CLAUDE.md`. Key inventory (no values): `KEYS.md`, local only.
