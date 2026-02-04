import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'game',
  resolve: {
    alias: {
      '@simulation': path.resolve(__dirname, 'src/simulation'),
    },
  },
  server: {
    host: true,
    port: 3001,
    allowedHosts: ['macbook.local'],
  },
  build: {
    outDir: '../dist-game',
    emptyOutDir: true,
  },
});
