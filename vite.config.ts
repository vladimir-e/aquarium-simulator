import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/ui',
  server: {
    host: true,
    port: 3000,
    allowedHosts: ['macbook.local'],
  },
  build: {
    outDir: '../../dist-ui',
    emptyOutDir: true,
  },
});
