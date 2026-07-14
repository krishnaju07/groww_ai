import { api } from '../lib/api.js';

export const settingsService = {
  get: () => api.get('/settings').then((r) => r.data),
  update: (patch) => api.put('/settings', patch).then((r) => r.data),
  tradingMode: () => api.get('/settings/trading-mode').then((r) => r.data),
  updateTradingMode: (patch) => api.put('/settings/trading-mode', patch).then((r) => r.data),
  aiModelOptions: () => api.get('/settings/ai-model-options').then((r) => r.data),
  recordsSummary: (mode) => api.get(`/settings/records/${mode}`).then((r) => r.data),
  clearRecords: (mode, confirmPhrase) => api.post('/settings/records/clear', { mode, confirmPhrase }).then((r) => r.data),
  aiCallRecordsSummary: () => api.get('/settings/records/ai-calls').then((r) => r.data),
  clearAiCallRecords: () => api.post('/settings/records/ai-calls/clear').then((r) => r.data),
};
