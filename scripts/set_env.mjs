// Upserts (or deletes with --delete) Vercel env vars for Production + Preview, values read from args.
// Usage: node scripts/set_env.mjs KEY=value [KEY2=value2 ...]   |   node scripts/set_env.mjs --delete KEY [KEY2]
// For non-secret config only (model names, provider, threshold). Secrets go in via .env and the setup script.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const { projectId, orgId } = JSON.parse(readFileSync(new URL('../.vercel/project.json', import.meta.url), 'utf8'));
const api = (path, opts = {}) => fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${orgId}`, {
  ...opts, headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
}).then((r) => r.json());

const args = process.argv.slice(2);
if (args[0] === '--delete') {
  const all = (await api(`/v10/projects/${projectId}/env`)).envs;
  for (const key of args.slice(1)) {
    for (const e of all.filter((x) => x.key === key)) await api(`/v9/projects/${projectId}/env/${e.id}`, { method: 'DELETE' });
    console.log(`deleted ${key}`);
  }
} else {
  for (const pair of args) {
    const [key, ...rest] = pair.split('=');
    const r = await api(`/v10/projects/${projectId}/env?upsert=true`, { method: 'POST',
      body: JSON.stringify({ key, value: rest.join('='), type: 'encrypted', target: ['production', 'preview'] }) });
    console.log(r.error ? `${key}: ${r.error.message}` : `${key}=${rest.join('=')}`);
  }
}
