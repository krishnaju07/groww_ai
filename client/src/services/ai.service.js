import { api } from '../lib/api.js';

export const aiService = {
  decide: (symbol) => api.post(`/ai/decide/${symbol}`).then((r) => r.data),
  decideOptions: (underlying) => api.post(`/ai/decide-options/${underlying}`).then((r) => r.data),
  decisions: (params = {}) => api.get('/ai/decisions', { params }).then((r) => r.data),
  signals: () => api.get('/ai/signals').then((r) => r.data),
  stats: () => api.get('/ai/stats').then((r) => r.data),
  regime: () => api.get('/ai/regime').then((r) => r.data),
};
