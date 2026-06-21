import axios from 'axios';

/**
 * Shared axios instance for the GrowwAI API.
 * baseURL comes from Vite env (VITE_API_BASE_URL, e.g. http://localhost:4000/api).
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Response interceptor.
 * - On success, the server wraps payloads as `{ success: true, data }`.
 *   We unwrap and resolve with just `data`.
 * - On a logical failure (`{ success: false, error, code }`) or an HTTP/network
 *   error, we throw an `Error(message)` carrying a `.code` for callers.
 */
api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      if (body.success) {
        return body.data;
      }
      const err = new Error(body.error || 'Request failed');
      err.code = body.code || 'INTERNAL';
      return Promise.reject(err);
    }
    // No envelope — return raw body as-is.
    return body;
  },
  (error) => {
    const body = error.response && error.response.data;
    const message =
      (body && (body.error || body.message)) ||
      error.message ||
      'Network error';
    const err = new Error(message);
    err.code = (body && body.code) || 'INTERNAL';
    return Promise.reject(err);
  }
);

/**
 * GET helper. Resolves to the unwrapped `data`.
 * @param {string} url
 * @param {Object} [config] axios request config (e.g. `{ params }`)
 * @returns {Promise<any>}
 */
export function apiGet(url, config) {
  return api.get(url, config);
}

/**
 * POST helper. Resolves to the unwrapped `data`.
 * @param {string} url
 * @param {any} [body]
 * @param {Object} [config]
 * @returns {Promise<any>}
 */
export function apiPost(url, body, config) {
  return api.post(url, body, config);
}

/**
 * PUT helper. Resolves to the unwrapped `data`.
 * @param {string} url
 * @param {any} [body]
 * @param {Object} [config]
 * @returns {Promise<any>}
 */
export function apiPut(url, body, config) {
  return api.put(url, body, config);
}

export default api;
