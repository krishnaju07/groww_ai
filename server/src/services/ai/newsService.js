/**
 * Free news headlines (Google News RSS, no API key/cost) fed to the AI decision engine
 * so it can weigh today's actual events (earnings, regulatory action, management news)
 * instead of trading on technicals alone in an information vacuum. Deliberately does NOT
 * run its own sentiment scoring — raw headlines are handed to the LLM, which is better
 * at judging nuance/context than a keyword-based scorer would be. Cached per-query since
 * this is called every 30s (autoTradingService tick) / 5min (aiScanJob) per symbol and
 * hammering Google News that often would be both wasteful and likely to get rate-limited.
 */
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map(); // query -> {headlines, fetchedAt}

const ENTITY_MAP = { amp: '&', quot: '"', '#39': "'", apos: "'", lt: '<', gt: '>', nbsp: ' ' };

/** @param {string} text @returns {string} decodes the handful of HTML entities Google News RSS titles actually use */
function decodeEntities(text) {
  return text.replace(/&(#?\w+);/g, (m, code) => ENTITY_MAP[code] ?? m);
}

/** @param {string} xml @param {number} limit @returns {{title:string, publishedAt:Date|null}[]} */
function parseRssItems(xml, limit) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while (items.length < limit && (match = itemRegex.exec(xml))) {
    const block = match[1];
    const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1];
    if (!rawTitle) continue;
    const title = decodeEntities(rawTitle.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim());
    const pubDateRaw = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ?? [])[1];
    items.push({ title, publishedAt: pubDateRaw ? new Date(pubDateRaw) : null });
  }
  return items;
}

/** @param {string} query @param {number} limit @returns {Promise<{title:string, publishedAt:Date|null}[]>} */
async function fetchHeadlines(query, limit) {
  const cached = cache.get(query);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.headlines;

  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const headlines = parseRssItems(xml, limit);
    cache.set(query, { headlines, fetchedAt: Date.now() });
    return headlines;
  } catch (err) {
    console.error(`[newsService] fetch failed for "${query}":`, err.message);
    // Fail open with whatever's cached (even if stale) rather than blocking the whole
    // decision context on a news-fetch hiccup — no news is far less harmful than no decision.
    return cached?.headlines ?? [];
  }
}

/**
 * @param {string} symbol @param {string} companyName
 * @returns {Promise<string[]>} up to 3 stock-specific + 2 broad-market headlines, newest first, as plain sentences for the prompt
 */
export async function getNewsForSymbol(symbol, companyName) {
  const [stockNews, marketNews] = await Promise.all([
    fetchHeadlines(`"${companyName}" stock NSE`, 3),
    fetchHeadlines('Nifty 50 Sensex India stock market', 2),
  ]);
  return [...stockNews, ...marketNews].map((h) => h.title);
}
