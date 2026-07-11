/**
 * Free news headlines (Google News RSS, no API key/cost) fed to the AI decision engine
 * so it can weigh today's actual events (earnings, regulatory action, management news)
 * instead of trading on technicals alone in an information vacuum. Deliberately does NOT
 * run its own sentiment scoring — raw headlines are handed to the LLM, which is better
 * at judging nuance/context than a keyword-based scorer would be. Cached per-query since
 * this is called every 30s (autoTradingService tick) / 5min (aiScanJob) per symbol and
 * hammering Google News that often would be both wasteful and likely to get rate-limited.
 *
 * Recency is enforced two ways: Google's own `when:Xh` search operator (so it doesn't
 * even return week-old evergreen articles in the first place) AND a post-fetch filter
 * on the parsed `pubDate` (defense in depth — `when:` narrows what's searched, not a
 * hard guarantee every result satisfies it). Both the max age and headline count are
 * live-configurable from Settings (UserSettings.systemConfig.newsMaxAgeHours/newsHeadlineCount).
 */
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map(); // `${query}:${maxAgeHours}` -> {headlines, fetchedAt}

const ENTITY_MAP = { amp: '&', quot: '"', '#39': "'", apos: "'", lt: '<', gt: '>', nbsp: ' ' };

/** @param {string} text @returns {string} decodes the handful of HTML entities Google News RSS titles actually use */
function decodeEntities(text) {
  return text.replace(/&(#?\w+);/g, (m, code) => ENTITY_MAP[code] ?? m);
}

/** @param {string} xml @returns {{title:string, publishedAt:Date|null}[]} every item in the feed, unfiltered/unlimited */
function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml))) {
    const block = match[1];
    const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1];
    if (!rawTitle) continue;
    const title = decodeEntities(rawTitle.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim());
    const pubDateRaw = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ?? [])[1];
    items.push({ title, publishedAt: pubDateRaw ? new Date(pubDateRaw) : null });
  }
  return items;
}

/**
 * @param {string} query @param {number} limit @param {number} maxAgeHours
 * @returns {Promise<{title:string, publishedAt:Date|null}[]>} newest first, capped to `limit`
 */
async function fetchHeadlines(query, limit, maxAgeHours) {
  const cacheKey = `${query}:${maxAgeHours}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.headlines;

  try {
    // Google's `when:` search operator takes a unit-suffixed integer (h=hours, d=days) —
    // round up to whole hours so a 1.5h window still actually excludes >1h-old results
    // rather than silently widening to 2h.
    const whenClause = `when:${Math.max(1, Math.ceil(maxAgeHours))}h`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} ${whenClause}`)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const headlines = parseRssItems(xml)
      // Defense in depth — `when:` narrows Google's own search, but doesn't guarantee
      // every returned item's parsed pubDate actually satisfies it. An item with no
      // parseable pubDate is kept rather than dropped (better to show it unverified-fresh
      // than to silently lose a real headline to an RSS quirk).
      .filter((h) => !h.publishedAt || h.publishedAt.getTime() >= cutoff)
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      .slice(0, limit);
    cache.set(cacheKey, { headlines, fetchedAt: Date.now() });
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
 * @param {{headlineCount?:number, maxAgeHours?:number}} [opts] from UserSettings.systemConfig
 * @returns {Promise<string[]>} stock-specific + 2 broad-market headlines, newest first, as plain sentences for the prompt
 */
export async function getNewsForSymbol(symbol, companyName, opts = {}) {
  const headlineCount = opts.headlineCount ?? 3;
  const maxAgeHours = opts.maxAgeHours ?? 24;
  const [stockNews, marketNews] = await Promise.all([
    fetchHeadlines(`"${companyName}" stock NSE`, headlineCount, maxAgeHours),
    // "today" nudges Google's ranking toward same-day market-wide coverage rather than
    // evergreen "what is Nifty/Sensex" explainer content that would otherwise rank well
    // for the bare index names.
    fetchHeadlines('Nifty Sensex India stock market today', 2, maxAgeHours),
  ]);
  return [...stockNews, ...marketNews].map((h) => h.title);
}
