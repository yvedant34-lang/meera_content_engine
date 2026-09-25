// Seeds voice-skill.txt into Supabase voice_skill as the new active version.
// Usage: node scripts/seed_voice.mjs   (run again whenever voice-skill.txt changes)
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const content = readFileSync(new URL('../voice-skill.txt', import.meta.url), 'utf8').trim();
if (content.length < 200) { console.error('voice-skill.txt looks too short; not seeding.'); process.exit(1); }

const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const base = `${env.SUPABASE_URL}/rest/v1/voice_skill`;

const latest = await (await fetch(`${base}?select=version,content&order=version.desc&limit=1`, { headers: h })).json();
if (latest[0]?.content?.trim() === content) { console.log(`Unchanged; v${latest[0].version} already holds this text.`); process.exit(0); }
const version = (latest[0]?.version || 0) + 1;

// Deactivate old rows (kept, never deleted), then insert the new active version.
await fetch(`${base}?active=eq.true`, { method: 'PATCH', headers: h, body: JSON.stringify({ active: false }) });
const r = await fetch(base, { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ version, content, active: true }) });
console.log(r.ok ? `Seeded voice_skill v${version} (${content.length} chars), active.` : `Failed: ${r.status} ${await r.text()}`);
