import { api } from '../lib/api.js';

export const dashboardService = {
  summary: () => api.get('/dashboard/summary').then((r) => r.data),
  watchlist: () => api.get('/dashboard/watchlist').then((r) => r.data),
  equityCurve: () => api.get('/dashboard/equity-curve').then((r) => r.data),
};
