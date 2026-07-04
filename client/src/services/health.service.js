import { api } from '../lib/api.js';

export const healthService = {
  get: () => api.get('/health').then((r) => r.data),
};
