import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// /api is proxied to the Node backend, so the browser talks to one origin (no CORS, images just work)
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: process.env.API_URL || 'http://localhost:4000', changeOrigin: true } } },
  preview: { port: 5173, proxy: { '/api': { target: process.env.API_URL || 'http://localhost:4000', changeOrigin: true } } },
});
