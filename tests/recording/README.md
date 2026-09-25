# Recording the demo
Run from a folder with `playwright` and `ffmpeg-static` installed (`npm i playwright ffmpeg-static && npx playwright install chromium`).
1. `node login.mjs` once: scan the QR code (Telegram > Settings > Devices > Link Desktop Device). Creates `tg-profile/` (never commit it: it is a logged-in session).
2. `node demo.mjs`: runs the scripted live demo in Telegram Web and records `raw/demo_raw.webm` + `timeline.json`.
3. `node edit.mjs out.mp4`: cuts bot waits (sped up, captioned on screen), typing at speed, reading at 1x. Fails if > 59.5 s.
