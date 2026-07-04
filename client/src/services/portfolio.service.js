import { api } from '../lib/api.js';

export const portfolioService = {
  get: () => api.get('/portfolio').then((r) => r.data),
};
