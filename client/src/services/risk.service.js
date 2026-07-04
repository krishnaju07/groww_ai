import { api } from '../lib/api.js';

export const riskService = {
  getConfig: () => api.get('/risk/config').then((r) => r.data),
  updateConfig: (patch) => api.put('/risk/config', patch).then((r) => r.data),
  meter: () => api.get('/risk/meter').then((r) => r.data),
  events: (limit = 100) => api.get('/risk/events', { params: { limit } }).then((r) => r.data),
  trip: (reason) => api.post('/risk/kill-switch/trip', { reason }).then((r) => r.data),
  reset: () => api.post('/risk/kill-switch/reset').then((r) => r.data),
};
