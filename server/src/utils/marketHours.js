/**
 * Indian equity market hours check (NSE/BSE regular session).
 * Open Monday–Friday, 09:15–15:30 IST. IST = UTC + 5:30, with no DST,
 * so we derive IST wall-clock time directly from the UTC timestamp — no deps,
 * independent of the host machine's local timezone.
 *
 * @param {Date} [now=new Date()] reference instant (defaults to current time)
 * @returns {boolean} true when the market is currently open
 */
export function isMarketOpen(now = new Date()) {
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // +5:30
  const ist = new Date(now.getTime() + IST_OFFSET_MS);

  // Use UTC getters on the shifted date so we read IST wall-clock values.
  const day = ist.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;

  const minutesOfDay = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const open = 9 * 60 + 15; // 09:15 -> 555
  const close = 15 * 60 + 30; // 15:30 -> 930

  return minutesOfDay >= open && minutesOfDay <= close;
}

export default isMarketOpen;
