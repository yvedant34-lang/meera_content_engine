// Google News RSS search (India edition, English). Free, no key. Returns the top item or null.
const decode = (s = '') =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]).trim() : '';
};
const stripHtml = (s) => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function formatDate(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d)) return pubDate || '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function parseTopItem(xml) {
  const item = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!item) return null;
  const x = item[1];
  const source = tag(x, 'source');
  let headline = tag(x, 'title');
  if (source && headline.endsWith(` - ${source}`)) headline = headline.slice(0, -(source.length + 3));
  const summary = stripHtml(tag(x, 'description')).replace(source, '').trim().slice(0, 240);
  return { headline, source, date: formatDate(tag(x, 'pubDate')), url: tag(x, 'link'), summary: summary || headline };
}

async function search(q) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 meera-content-engine' } });
  if (!r.ok) throw new Error(`news feed HTTP ${r.status}`);
  return parseTopItem(await r.text());
}

// Prefer the last 30 days so the hook is timely; widen only if nothing recent matches.
export async function topNews(phrase) {
  return (await search(`${phrase} when:30d`)) || (await search(phrase));
}
