// Suggests a posting slot. A suggestion only: the bot never posts or schedules (The Cut).
// Rule: next Tuesday, Wednesday or Thursday, 8:30 to 9:30 am IST, at least 12 hours away.
// Basis: general LinkedIn guidance for professional audiences (mid-week, before work),
// not Skinstinct's own analytics, and the line says so.
const DAYS = new Set([2, 3, 4]); // Tue, Wed, Thu
const IST_MS = 5.5 * 3600 * 1000;

export function suggestSlot(now = new Date()) {
  const ist = new Date(now.getTime() + IST_MS);            // shift so getUTC* reads IST wall-clock
  for (let add = 0; add < 8; add++) {
    const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + add, 8, 30));
    const hoursAway = (d.getTime() - ist.getTime()) / 3600000;
    if (DAYS.has(d.getUTCDay()) && hoursAway >= 12) {
      const label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
      return `Suggested posting slot: ${label}, 8:30 to 9:30 am IST. Based on general LinkedIn guidance for professional audiences (mid-week, before work), not Skinstinct's own data. You publish it yourself.`;
    }
  }
  return '';
}
