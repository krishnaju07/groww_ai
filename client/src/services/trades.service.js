import { apiGet, apiPost } from '../lib/api.js';

/**
 * @typedef {import('../types.js').Trade} Trade
 * @typedef {import('../types.js').TradeAction} TradeAction
 */

/**
 * Fetch trades, optionally filtered by type/status/limit.
 * @param {{ type?: 'manual'|'automatic'|'all', status?: 'OPEN'|'CLOSED'|'all', limit?: number }} [filters]
 * @returns {Promise<Trade[]>}
 */
export function getTrades(filters = {}) {
  return apiGet('/trades', { params: filters });
}

/**
 * Execute a manual paper trade.
 * @param {{ symbol: string, action: TradeAction, investmentAmount: number }} payload
 * @returns {Promise<Trade>}
 */
export function executeManualTrade({ symbol, action, investmentAmount }) {
  return apiPost('/trades/manual', { symbol, action, investmentAmount });
}
