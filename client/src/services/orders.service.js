import { api } from '../lib/api.js';

export const ordersService = {
  list: () => api.get('/orders').then((r) => r.data),
  place: (order) => api.post('/orders', order).then((r) => r.data),
  cancel: (id) => api.post(`/orders/${id}/cancel`).then((r) => r.data),
};
