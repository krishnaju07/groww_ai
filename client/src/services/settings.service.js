import { api } from '../lib/api.js';

export const settingsService = {
  get: () => api.get('/settings').then((r) => r.data),
  update: (patch) => api.put('/settings', patch).then((r) => r.data),
  tradingMode: () => api.get('/settings/trading-mode').then((r) => r.data),
  updateTradingMode: (patch) => api.put('/settings/trading-mode', patch).then((r) => r.data),
};
