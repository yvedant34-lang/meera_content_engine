// One-time: opens Telegram Web in a dedicated recorder profile so Vy can scan the QR code with her phone.
import { chromium } from 'playwright';
const ctx = await chromium.launchPersistentContext(new URL('./tg-profile', import.meta.url).pathname, {
  headless: false, viewport: { width: 540, height: 900 }, args: ['--window-position=80,40'],
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://web.telegram.org/a/');
console.log('Waiting for login (scan the QR code on your phone: Settings > Devices > Link Desktop Device)...');
const deadline = Date.now() + 5 * 60 * 1000;
while (Date.now() < deadline) {
  const loggedIn = await page.locator('#LeftColumn, .chat-list, [class*="ChatList"]').first().isVisible().catch(() => false);
  if (loggedIn) { console.log('LOGGED_IN'); await page.waitForTimeout(3000); break; }
  await page.waitForTimeout(2000);
}
await ctx.close();
