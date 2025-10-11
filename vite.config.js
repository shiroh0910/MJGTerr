import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  // ビルド成果物のパスを相対パスに設定する
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // 地図タイルをキャッシュするための設定を追加
        runtimeCaching: [
          {
            // 淡色地図と航空写真の両方にマッチするように正規表現を更新
            urlPattern: /^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/(pale|seamlessphoto)\//,
            handler: 'CacheFirst', // キャッシュ優先戦略
            options: {
              cacheName: 'gsi-map-tiles',
              expiration: {
                maxEntries: 500, // キャッシュするタイルの最大数
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30日間キャッシュを保持
              },
            },
          },
        ],
      },
      manifest: {
        name: '訪問活動サポート',
        short_name: '訪問サポート',
        description: '訪問活動をサポートするためのPWA',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
});