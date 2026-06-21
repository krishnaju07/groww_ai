import { apiGet } from '../lib/api.js';

/**
 * @typedef {import('../types.js').DashboardData} DashboardData
 */

/**
 * Fetch the aggregated dashboard payload.
 * @returns {Promise<DashboardData>}
 */
export function getDashboard() {
  return apiGet('/dashboard');
}
