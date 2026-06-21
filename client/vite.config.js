import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the GrowwAI client.
// React plugin + dev server on port 5173 (matches server CLIENT_ORIGIN default).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
