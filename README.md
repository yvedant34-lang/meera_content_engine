# meera_content_engine

Telegram content engine for Meera Pillai (Skinstinct). Notes dropped into her private Telegram channel become LinkedIn drafts in her voice. She reviews, edits and publishes them herself. Nothing is ever auto-posted.

Built for MESA AI and its Application, Cohort C4, Case 1.

## Pipeline
Telegram note → /api/webhook (Vercel) → Gemini Flash scores 0 to 10 → Google News RSS hook → drafting model (Gemini, then Claude) with voice-skill.txt → draft back in Telegram → APPROVE / REJECT stored in Supabase.

## Setup
1. Copy `.env.example` to `.env` and fill it in. Never commit `.env`.
2. Schema: `supabase/migrations/`.
3. Build instructions: `CLAUDE.md`.
