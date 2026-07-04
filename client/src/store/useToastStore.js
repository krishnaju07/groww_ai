import { create } from 'zustand';

let seq = 0;

export const useToastStore = create((set) => ({
  toasts: [],
  push(toast) {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { id, ...toast }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  success: (message) => useToastStore.getState().push({ message, tone: 'accent' }),
  error: (message) => useToastStore.getState().push({ message, tone: 'danger' }),
  info: (message) => useToastStore.getState().push({ message, tone: 'info' }),
};
