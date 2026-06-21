import { create } from 'zustand';

/**
 * Toast store: a transient stack of notifications rendered by ToastContainer.
 * Each pushed toast auto-dismisses after ~4500ms (the store owns the timeout).
 *
 * @typedef {'success'|'error'|'info'|'auto'} ToastType
 *
 * @typedef {Object} Toast
 * @property {string} id
 * @property {ToastType} type
 * @property {string} title
 * @property {string} [message]
 *
 * @typedef {Object} ToastState
 * @property {Toast[]} toasts
 * @property {(toast: { type: ToastType, title: string, message?: string }) => string} push
 * @property {(id: string) => void} dismiss
 */

/** How long a toast stays on screen before auto-dismissing. */
const AUTO_DISMISS_MS = 4500;

/**
 * Module-level monotonic counter for stable, unique toast ids. We intentionally
 * do NOT rely on Date.now()/Math.random() uniqueness alone.
 */
let counter = 0;

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<ToastState>>} */
const useToastStore = create((set, get) => ({
  toasts: [],

  push({ type, title, message }) {
    const id = String(++counter);
    set((s) => ({
      toasts: [...s.toasts, { id, type, title, message }],
    }));
    // Schedule auto-dismiss; dismiss() is a no-op if already removed manually.
    setTimeout(() => {
      get().dismiss(id);
    }, AUTO_DISMISS_MS);
    return id;
  },

  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/**
 * Convenience helper so non-component code (services, hooks) can fire toasts
 * without subscribing to the store.
 */
export const toast = {
  success: (title, message) =>
    useToastStore.getState().push({ type: 'success', title, message }),
  error: (title, message) =>
    useToastStore.getState().push({ type: 'error', title, message }),
  info: (title, message) =>
    useToastStore.getState().push({ type: 'info', title, message }),
  auto: (title, message) =>
    useToastStore.getState().push({ type: 'auto', title, message }),
};

export default useToastStore;
