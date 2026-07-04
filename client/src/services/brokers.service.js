import { api } from '../lib/api.js';

export const brokersService = {
  status: () => api.get('/brokers/status').then((r) => r.data),
  testGroww: () => api.post('/brokers/groww/test').then((r) => r.data),
  connectAngelOne: (creds) => api.post('/brokers/angelone/connect', creds).then((r) => r.data),
  disconnectAngelOne: () => api.post('/brokers/angelone/disconnect').then((r) => r.data),
  zerodhaLoginUrl: () => api.get('/brokers/zerodha/login-url').then((r) => r.data),
  disconnectZerodha: () => api.post('/brokers/zerodha/disconnect').then((r) => r.data),
  setActive: (activeBroker) => api.put('/brokers/active', { activeBroker }).then((r) => r.data),
};
