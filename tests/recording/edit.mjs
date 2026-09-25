// Cuts the raw recording to <= 60 s using timeline.json: waits sped up hard, typing 1.5x, reading 1x.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const DIR = new URL('.', import.meta.url).pathname;
const RAW = DIR + 'raw/demo_raw.webm';
const OUT = process.argv[2] || DIR + 'meera_bot_demo.mp4';
const tl = JSON.parse(readFileSync(DIR + 'timeline.json', 'utf8'));
const at = (kind, label = '') => tl.find((x) => x.kind === kind && (!label || x.label === label)).t;

// Offset between timeline clock and video clock: video ends right after the 'end' mark.
let info = '';
try { execFileSync(ffmpeg, ['-i', RAW], { stdio: 'pipe' }); } catch (e) { info = e.stderr.toString(); }
const m = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
const dur = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : NaN;
const off = Number.isFinite(dur) ? Math.max(0, dur - at('end') - 0.25) : 0.5;
console.log(`raw duration ${dur.toFixed(2)}s, clock offset ${off.toFixed(2)}s`);

// [start, end, targetSeconds or speed]  (times on the timeline clock)
const seg = [];
const keep = (s, e, speed = 1) => seg.push({ s, e, speed });
const squeeze = (s, e, target) => seg.push({ s, e, speed: Math.max(1, (e - s) / target) });

keep(at('intro') + 0.3, at('step', 'note05') - 0.2);                    // title card ~3s
squeeze(at('step', 'note05'), at('wait_start', 'draft05'), 2.6);      // typing note 05
squeeze(at('wait_start', 'draft05'), at('wait_end', 'draft05'), 1.5); // bot working (trimmed)
keep(at('wait_end', 'draft05'), at('read_end', 'draft05'));           // read draft 1 (1x)
squeeze(at('step', 'feedback'), at('wait_start', 'v2'), 3.2);         // typing feedback
squeeze(at('wait_start', 'v2'), at('wait_end', 'v2'), 1.2);           // bot revising (trimmed)
keep(at('wait_end', 'v2'), at('read_end', 'v2'));                     // read v2 (1x)
squeeze(at('step', 'approve'), at('wait_end', 'approve'), 1.6);       // APPROVE reply
keep(at('wait_end', 'approve'), at('wait_end', 'approve') + 2.4);     // confirmation visible
squeeze(at('step', 'note03'), at('wait_start', 'draft03'), 2.2);      // typing note 03
squeeze(at('wait_start', 'draft03'), at('wait_end', 'draft03'), 1.5); // bot working (trimmed)
keep(at('wait_end', 'draft03'), at('read_end', 'draft03'));           // read draft 3
squeeze(at('read_end', 'draft03'), at('wait_end', 'reject'), 1.6);    // REJECT reply
keep(at('wait_end', 'reject'), at('wait_end', 'reject') + 2.2);       // confirmation visible
keep(at('outro'), at('end') - 0.3);                                    // end card

const total = seg.reduce((a, x) => a + (x.e - x.s) / x.speed, 0);
console.log(`edited length ≈ ${total.toFixed(1)}s from ${seg.length} segments`);
if (total > 59.5) { console.error('TOO LONG'); process.exit(1); }

const parts = seg.map((x, i) =>
  `[0:v]trim=start=${(x.s + off).toFixed(3)}:end=${(x.e + off).toFixed(3)},setpts=(PTS-STARTPTS)/${x.speed.toFixed(4)},fps=30[v${i}]`);
const filter = parts.join(';') + ';' + seg.map((_, i) => `[v${i}]`).join('') + `concat=n=${seg.length}:v=1:a=0,format=yuv420p[out]`;
execFileSync(ffmpeg, ['-y', '-i', RAW, '-filter_complex', filter, '-map', '[out]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
console.log('WROTE', OUT);
