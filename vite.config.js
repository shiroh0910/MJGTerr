import { defineConfig } from 'vite';

export default defineConfig({
  root: '.', // 
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  preview: {
    headers: {
      'Cross-origin-Opener-Policy': 'same-origin-allow-popups',
    },
  }
});