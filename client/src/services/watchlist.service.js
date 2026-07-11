import { api } from '../lib/api.js';

export const watchlistService = {
  get: () => api.get('/watchlist').then((r) => r.data),
  addEquity: (symbol) => api.post('/watchlist/equities', { symbol }).then((r) => r.data),
  removeEquity: (symbol) => api.delete(`/watchlist/equities/${symbol}`).then((r) => r.data),
  addOption: (symbol) => api.post('/watchlist/options', { symbol }).then((r) => r.data),
  removeOption: (symbol) => api.delete(`/watchlist/options/${symbol}`).then((r) => r.data),
};
