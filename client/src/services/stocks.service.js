import { api } from '../lib/api.js';

export const stocksService = {
  list: () => api.get('/stocks').then((r) => r.data),
  ltp: (symbol) => api.get(`/stocks/${symbol}/ltp`).then((r) => r.data),
  candles: (symbol, interval = '5m', limit = 100) =>
    api.get(`/stocks/${symbol}/candles`, { params: { interval, limit } }).then((r) => r.data),
};
