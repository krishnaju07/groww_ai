import { api } from '../lib/api.js';

export const reportsService = {
  period: (period = 'daily') => api.get('/reports', { params: { period } }).then((r) => r.data),
  learning: () => api.get('/reports/learning').then((r) => r.data),
};
