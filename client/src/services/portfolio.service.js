import { apiGet } from '../lib/api.js';

/**
 * @typedef {import('../types.js').PortfolioResponse} PortfolioResponse
 */

/**
 * Fetch the current portfolio summary + open positions.
 * @returns {Promise<PortfolioResponse>}
 */
export function getPortfolio() {
  return apiGet('/portfolio');
}
