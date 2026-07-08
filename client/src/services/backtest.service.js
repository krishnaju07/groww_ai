import { api } from '../lib/api.js';

export const backtestService = {
  run: (payload) => api.post('/backtest/run', payload).then((r) => r.data),
  list: () => api.get('/backtest').then((r) => r.data),
  get: (id) => api.get(`/backtest/${id}`).then((r) => r.data),
};
