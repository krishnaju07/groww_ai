import { api } from '../lib/api.js';

export const aiService = {
  decide: (symbol) => api.post(`/ai/decide/${symbol}`).then((r) => r.data),
  decisions: (params = {}) => api.get('/ai/decisions', { params }).then((r) => r.data),
};
