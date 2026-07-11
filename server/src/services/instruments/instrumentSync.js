/**
 * Downloads and caches Groww's public instrument master CSV — the only source of
 * option strike/expiry/lot-size truth for this platform (there is no dynamic
 * option-chain/search API; see GROWW_INSTRUMENTS_CSV_URL), and also the source of the
 * full real NSE equity universe (~2,300 mainboard stocks) for search/watchlist. Filtered
 * to (a) CE/PE option contracts for the configured OPTION_UNDERLYINGS, and (b) NSE
 * mainboard equities (`series === 'EQ'` — excludes bonds/SGBs/SME/T2T rows the CSV's
 * bare `instrument_type === 'EQ'` alone would otherwise pull in), to keep the local
 * Instrument collection to just what this platform can actually trade.
 */
import { GROWW_INSTRUMENTS_CSV_URL, OPTION_UNDERLYINGS } from '../../config/constants.js';
import { Instrument } from '../../models/Instrument.js';
import { parseCsv } from '../../utils/csv.js';

const UNDERLYING_SYMBOLS = new Set(OPTION_UNDERLYINGS.map((u) => u.growwUnderlyingSymbol));

/** @param {string} raw 'YYYY-MM-DD' @returns {Date|null} */
function parseExpiry(raw) {
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** @param {string} raw @returns {number|null} */
function parseNum(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && raw !== '' ? n : null;
}

/**
 * Downloads the CSV, filters to CE/PE rows for configured underlyings, and
 * upserts each into `Instrument` keyed by (tradingSymbol, segment).
 * @returns {Promise<{synced:number, skipped:number}>}
 */
export async function syncInstruments() {
  const res = await fetch(GROWW_INSTRUMENTS_CSV_URL);
  if (!res.ok) throw new Error(`Failed to download Groww instrument CSV: HTTP ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);

  const ops = [];
  let skipped = 0;

  let optionCount = 0;
  let equityCount = 0;

  for (const row of rows) {
    const segment = String(row.segment ?? '').toUpperCase();
    const exchange = String(row.exchange ?? '').toUpperCase();
    const instrumentTypeRaw = String(row.instrument_type ?? '').toUpperCase();
    const tradingSymbol = row.trading_symbol;

    if (!tradingSymbol) {
      skipped++;
      continue;
    }

    if (segment === 'FNO' && ['CE', 'PE'].includes(instrumentTypeRaw)) {
      const underlyingSymbol = String(row.underlying_symbol ?? '').toUpperCase();
      if (!UNDERLYING_SYMBOLS.has(underlyingSymbol)) {
        skipped++;
        continue;
      }
      ops.push({
        updateOne: {
          filter: { tradingSymbol, segment: 'FNO' },
          update: {
            $set: {
              exchange: row.exchange || 'NSE',
              tradingSymbol,
              growwSymbol: row.groww_symbol ?? '',
              name: row.name ?? '',
              instrumentType: 'OPT',
              segment: 'FNO',
              underlyingSymbol,
              expiryDate: parseExpiry(row.expiry_date),
              strikePrice: parseNum(row.strike_price),
              optionType: instrumentTypeRaw,
              lotSize: parseNum(row.lot_size),
              tickSize: parseNum(row.tick_size),
            },
          },
          upsert: true,
        },
      });
      optionCount++;
      continue;
    }

    // Real, tradeable NSE mainboard equities only — `series === 'EQ'` excludes bonds/SGBs/
    // SME-BE-ST rows that the CSV otherwise mixes into instrument_type === 'EQ'.
    if (segment === 'CASH' && exchange === 'NSE' && instrumentTypeRaw === 'EQ' && row.series === 'EQ') {
      ops.push({
        updateOne: {
          filter: { tradingSymbol, segment: 'CASH' },
          update: {
            $set: {
              exchange: 'NSE',
              tradingSymbol,
              growwSymbol: row.groww_symbol ?? '',
              name: row.name ?? '',
              instrumentType: 'EQ',
              segment: 'CASH',
              underlyingSymbol: '',
              expiryDate: null,
              strikePrice: null,
              optionType: null,
              lotSize: 1,
              tickSize: parseNum(row.tick_size),
            },
          },
          upsert: true,
        },
      });
      equityCount++;
      continue;
    }

    skipped++;
  }

  if (ops.length) {
    // bulkWrite has a practical batch-size ceiling — chunk defensively even though this
    // (a few thousand option rows + ~2,300 equities) is well within MongoDB's own
    // per-operation limits.
    const CHUNK = 1000;
    for (let i = 0; i < ops.length; i += CHUNK) {
      await Instrument.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
    }
  }

  console.log(`[instrumentSync] synced ${optionCount} option contracts + ${equityCount} equities (skipped ${skipped} non-matching rows)`);
  return { synced: ops.length, options: optionCount, equities: equityCount, skipped };
}

/** Called at boot — only syncs if the collection looks empty/stale, so a restart never blocks on a network call unnecessarily. */
export async function ensureInstrumentsSynced() {
  const count = await Instrument.countDocuments({});
  if (count > 0) return;
  try {
    await syncInstruments();
  } catch (err) {
    console.error('[instrumentSync] initial sync failed — option chain/equity search endpoints will be empty until this succeeds:', err.message);
  }
}
