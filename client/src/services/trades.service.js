import { api } from '../lib/api.js';

export const tradesService = {
  list: (limit = 50) => api.get('/trades', { params: { limit } }).then((r) => r.data),
};
