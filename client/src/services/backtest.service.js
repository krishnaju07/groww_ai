import { apiGet, apiPost } from '../lib/api.js';

/**
 * @typedef {import('../types.js').BacktestParams} BacktestParams
 * @typedef {import('../types.js').BacktestResult} BacktestResult
 */

/**
 * Run a backtest over the given parameters.
 * @param {BacktestParams} params
 * @returns {Promise<BacktestResult>}
 */
export function runBacktest(params) {
  return apiPost('/backtest', params);
}

/**
 * Fetch a previously stored backtest result by id.
 * @param {string} id
 * @returns {Promise<BacktestResult>}
 */
export function getBacktestResult(id) {
  return apiGet(`/backtest/results/${id}`);
}
