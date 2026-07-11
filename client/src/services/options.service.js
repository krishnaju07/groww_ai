import { api } from '../lib/api.js';

export const optionsService = {
  underlyings: () => api.get('/options/underlyings').then((r) => r.data),
  expiries: (underlying) => api.get('/options/expiries', { params: { underlying } }).then((r) => r.data),
  chain: (underlying, expiry) => api.get('/options/chain', { params: { underlying, expiry } }).then((r) => r.data),
};
