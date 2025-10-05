import { defineConfig } from 'vite';

export default defineConfig({
  root: '.', // プロジェクトのルートを明示的に設定
  publicDir: 'public', // publicディレクトリの場所を明示的に設定
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