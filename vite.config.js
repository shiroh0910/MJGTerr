import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: '.', // プロジェクトのルートを明示的に設定
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // ビルド時に生成されるすべてのアセットをキャッシュ対象にする
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      manifest: {
        name: '訪問管理PWA',
        short_name: '訪問管理',
        description: '訪問先を地図上で管理するPWA',
        theme_color: '#ffffff',
        icons: [
          // ここにアプリアイコンのパスを指定します
          // { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          // { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
});