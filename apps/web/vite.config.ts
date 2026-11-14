import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] }, // one React instance (AG Grid was pre-bundled with its own copy)
  optimizeDeps: { include: ['ag-grid-react', 'ag-grid-community'] },
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:8787', rewrite: (p) => p.replace(/^\/api/, '') } } },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
