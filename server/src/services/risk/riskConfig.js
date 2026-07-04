import { RiskConfig } from '../../models/RiskConfig.js';
import { DEFAULT_RISK_CONFIG } from '../../config/constants.js';

/** @param {string} userId @returns {Promise<import('../../models/RiskConfig.js').RiskConfig>} */
export async function getRiskConfig(userId) {
  const cfg = await RiskConfig.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, ...DEFAULT_RISK_CONFIG } },
    { upsert: true, new: true },
  );
  return cfg;
}

/**
 * @param {string} userId
 * @param {Partial<{maxLossPerDay:number, maxLossPerTrade:number, maxTradesPerDay:number, maxCapitalPerTradePercent:number}>} patch
 */
export async function updateRiskConfig(userId, patch) {
  const allowed = ['maxLossPerDay', 'maxLossPerTrade', 'maxTradesPerDay', 'maxCapitalPerTradePercent'];
  const safePatch = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  return RiskConfig.findOneAndUpdate({ userId }, safePatch, { upsert: true, new: true });
}
