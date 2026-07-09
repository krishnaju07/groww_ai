import { api } from '../lib/api.js';

export const brokersService = {
  status: () => api.get('/brokers/status').then((r) => r.data),
  testGroww: () => api.post('/brokers/groww/test').then((r) => r.data),
  setActive: (activeBroker) => api.put('/brokers/active', { activeBroker }).then((r) => r.data),
};
