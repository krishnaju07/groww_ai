import { create } from 'zustand';
import { brokersService } from '../services/brokers.service.js';

export const useBrokerStore = create((set, get) => ({
  status: null,
  loading: false,

  async fetch() {
    set({ loading: !get().status });
    const status = await brokersService.status();
    set({ status, loading: false });
  },
}));
