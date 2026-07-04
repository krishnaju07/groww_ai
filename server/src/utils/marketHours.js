import { env } from '../config/env.js';

const IST_OFFSET_MIN = 5 * 60 + 30;

/** @returns {Date} current time shifted to IST wall-clock (still a Date, just offset for field reads). */
function nowIst() {
  const now = new Date();
  return new Date(now.getTime() + IST_OFFSET_MIN * 60 * 1000 + now.getTimezoneOffset() * 60 * 1000);
}

/** @returns {boolean} true if NSE cash market is open (Mon-Fri 09:15-15:30 IST), unless IGNORE_MARKET_HOURS=true. */
export function isMarketOpen() {
  if (env.IGNORE_MARKET_HOURS) return true;
  const ist = nowIst();
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}
