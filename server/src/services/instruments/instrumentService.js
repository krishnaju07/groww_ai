/** Read-side query helpers over the synced Instrument collection (see instrumentSync.js). */
import { Instrument } from '../../models/Instrument.js';

/** @param {string} underlyingSymbol e.g. 'NIFTY' @returns {Promise<Date[]>} ascending, only expiries today or later */
export async function getExpiries(underlyingSymbol) {
  const dates = await Instrument.find({
    underlyingSymbol: underlyingSymbol.toUpperCase(),
    segment: 'FNO',
    expiryDate: { $gte: startOfToday() },
  }).distinct('expiryDate');
  return dates.map((d) => new Date(d)).sort((a, b) => a - b);
}

/** @param {string} underlyingSymbol @returns {Promise<Date|null>} the nearest upcoming expiry */
export async function getNearestExpiry(underlyingSymbol) {
  const expiries = await getExpiries(underlyingSymbol);
  return expiries[0] ?? null;
}

/**
 * @param {string} underlyingSymbol @param {Date} expiryDate
 * @returns {Promise<{strike:number, ce:object|null, pe:object|null}[]>} ascending by strike
 */
export async function getOptionChain(underlyingSymbol, expiryDate) {
  const rows = await Instrument.find({
    underlyingSymbol: underlyingSymbol.toUpperCase(),
    segment: 'FNO',
    expiryDate: toDayRange(expiryDate),
  }).lean();

  const byStrike = new Map();
  for (const row of rows) {
    const entry = byStrike.get(row.strikePrice) ?? { strike: row.strikePrice, ce: null, pe: null };
    const contract = {
      tradingSymbol: row.tradingSymbol,
      growwSymbol: row.growwSymbol,
      lotSize: row.lotSize,
      tickSize: row.tickSize,
    };
    if (row.optionType === 'CE') entry.ce = contract;
    else if (row.optionType === 'PE') entry.pe = contract;
    byStrike.set(row.strikePrice, entry);
  }
  return [...byStrike.values()].sort((a, b) => a.strike - b.strike);
}

/** @param {string} tradingSymbol @returns {Promise<object|null>} */
export async function getInstrument(tradingSymbol) {
  return Instrument.findOne({ tradingSymbol, segment: 'FNO' }).lean();
}

/**
 * Searches the full real NSE equity universe (synced from Groww's instrument CSV —
 * see instrumentSync.js) by symbol prefix or name substring. This IS "all stocks" —
 * the browsable universe a user picks their personal watchlist from, distinct from
 * STOCK_UNIVERSE (just the default seed).
 * @param {string} query @param {number} [limit]
 * @returns {Promise<{symbol:string, name:string}[]>}
 */
export async function searchEquities(query, limit = 25) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rows = await Instrument.find({
    segment: 'CASH',
    instrumentType: 'EQ',
    $or: [{ tradingSymbol: new RegExp(`^${safe}`, 'i') }, { name: new RegExp(safe, 'i') }],
  })
    .limit(limit)
    .lean();
  // Symbol-prefix matches (a user typing a ticker) rank above name-substring matches.
  rows.sort((a, b) => {
    const aStarts = a.tradingSymbol.toUpperCase().startsWith(q.toUpperCase()) ? 0 : 1;
    const bStarts = b.tradingSymbol.toUpperCase().startsWith(q.toUpperCase()) ? 0 : 1;
    return aStarts - bStarts;
  });
  return rows.map((r) => ({ symbol: r.tradingSymbol, name: r.name }));
}

/** @param {string[]} symbols @returns {Promise<Record<string,{name:string}>>} */
export async function getEquityDetails(symbols) {
  if (!symbols.length) return {};
  const rows = await Instrument.find({ segment: 'CASH', instrumentType: 'EQ', tradingSymbol: { $in: symbols } })
    .select('tradingSymbol name')
    .lean();
  return Object.fromEntries(rows.map((r) => [r.tradingSymbol, { name: r.name }]));
}

/**
 * @param {string} underlyingSymbol @param {Date} expiryDate @param {number} spotPrice
 * @returns {Promise<number|null>} the strike nearest the current spot price (ATM)
 */
export async function getAtmStrike(underlyingSymbol, expiryDate, spotPrice) {
  const chain = await getOptionChain(underlyingSymbol, expiryDate);
  if (!chain.length) return null;
  let closest = chain[0].strike;
  let closestDiff = Math.abs(closest - spotPrice);
  for (const { strike } of chain) {
    const diff = Math.abs(strike - spotPrice);
    if (diff < closestDiff) {
      closest = strike;
      closestDiff = diff;
    }
  }
  return closest;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** @param {Date} date @returns {{$gte:Date, $lt:Date}} a same-calendar-day range, since expiryDate is stored at 00:00 IST */
function toDayRange(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { $gte: start, $lt: end };
}
