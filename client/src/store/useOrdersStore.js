import { create } from 'zustand';
import { ordersService } from '../services/orders.service.js';

export const useOrdersStore = create((set, get) => ({
  orders: [],
  loading: false,
  _inFlight: false,

  async fetch() {
    if (get()._inFlight) return;
    set({ _inFlight: true, loading: !get().orders.length });
    try {
      const orders = await ordersService.list();
      set({ orders, loading: false });
    } finally {
      set({ _inFlight: false });
    }
  },

  async cancel(id) {
    await ordersService.cancel(id);
    await get().fetch();
  },
}));
