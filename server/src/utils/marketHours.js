import { DEFAULT_USER_ID } from '../config/constants.js';
import { getSystemConfig } from '../services/config/systemConfig.js';

const IST_OFFSET_MIN = 5 * 60 + 30;
const MARKET_OPEN_MIN = 9 * 60 + 15; // 09:15 IST
const SQUARE_OFF_MIN = 15 * 60 + 15; // 15:15 IST — matches squareOffJob.js's cron cutoff
const MARKET_CLOSE_MIN = 15 * 60 + 30; // 15:30 IST
const OPENING_WINDOW_MIN = 30; // first 30m after open — often noisier/less reliable
const CLOSING_WINDOW_MIN = 45; // last 45m before square-off — less runway for a fresh entry

/**
 * @returns {Date} current instant shifted so its UTC-getter fields (getUTCHours etc.)
 * read as IST wall-clock time. `Date.getTime()` is already an absolute, timezone-agnostic
 * epoch — adding the server process's own `getTimezoneOffset()` on top of the IST shift
 * (as this used to do) is simply wrong; it only "worked" by accident on a server whose
 * local system timezone happened to be UTC (offset 0). On a server whose local timezone
 * is IST itself, that extra term exactly cancels the intended +5:30 shift, silently
 * reading raw UTC time as if it were IST — a real ~5.5 hour error that would have thrown
 * off every market-hours-gated feature (auto-trading, square-off, Position Guardian, the
 * new intraday entry cutoff) on exactly that kind of machine.
 */
function nowIst() {
  const now = new Date();
  return new Date(now.getTime() + IST_OFFSET_MIN * 60 * 1000);
}

/** @param {string} [userId] @returns {Promise<boolean>} true if NSE cash market is open (Mon-Fri 09:15-15:30 IST), unless systemConfig.ignoreMarketHours is on. */
export async function isMarketOpen(userId = DEFAULT_USER_ID) {
  const cfg = await getSystemConfig(userId);
  if (cfg.ignoreMarketHours) return true;
  const ist = nowIst();
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= MARKET_OPEN_MIN && minutes <= MARKET_CLOSE_MIN;
}

/**
 * Gives the AI decision engine something concrete to reason about instead of the
 * abstract "consider remaining time" instruction it had no actual data for. Every
 * position is force-closed at SQUARE_OFF_MIN (see squareOffJob.js) — a fresh BUY/SELL
 * with only a few minutes of runway left is a fundamentally different bet than one
 * made at 10 AM, even with identical indicators.
 * @returns {{minutesToSquareOff:number, sessionPhase:'pre-market'|'opening'|'mid-day'|'closing'|'after-square-off'}}
 */
export function getIntradaySessionContext() {
  const ist = nowIst();
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();

  if (minutes < MARKET_OPEN_MIN) {
    return { minutesToSquareOff: SQUARE_OFF_MIN - MARKET_OPEN_MIN, sessionPhase: 'pre-market' };
  }
  if (minutes >= SQUARE_OFF_MIN) {
    return { minutesToSquareOff: 0, sessionPhase: 'after-square-off' };
  }
  if (minutes - MARKET_OPEN_MIN < OPENING_WINDOW_MIN) {
    return { minutesToSquareOff: SQUARE_OFF_MIN - minutes, sessionPhase: 'opening' };
  }
  if (SQUARE_OFF_MIN - minutes < CLOSING_WINDOW_MIN) {
    return { minutesToSquareOff: SQUARE_OFF_MIN - minutes, sessionPhase: 'closing' };
  }
  return { minutesToSquareOff: SQUARE_OFF_MIN - minutes, sessionPhase: 'mid-day' };
}
