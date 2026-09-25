---
name: meera_voice
description: How Meera Pillai writes; use for any drafting or draft review in this project
---

# Meera Pillai's voice

The single source of truth is `voice-skill.txt` in the project root. Read it in full before drafting or reviewing any draft. Do not copy its text anywhere else.

- At runtime the app reads the active row of the Supabase `voice_skill` table, seeded from that file with `npm run seed-voice`. After editing `voice-skill.txt`, run the seed again so the live bot uses the new version.
- Drafts are British English.
- Quoted lines in the voice profile are style examples, not content to reuse.
