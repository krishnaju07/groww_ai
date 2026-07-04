import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.error || err.message || 'Request failed';
    const code = err.response?.data?.code;
    const wrapped = new Error(message);
    wrapped.code = code;
    wrapped.status = err.response?.status;
    return Promise.reject(wrapped);
  },
);
