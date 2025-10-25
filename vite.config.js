import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createHtmlPlugin } from 'vite-plugin-html';
import { gitDescribeSync } from 'git-describe';

export default defineConfig(({ mode }) => {
  // .env ファイルから環境変数をロード
  const env = loadEnv(mode, process.cwd());

  const gitInfo = gitDescribeSync(__dirname, {
    dirtyMark: false,
    dirtySemver: false,
  });

  return {
    define: {
      'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(gitInfo.branch || 'unknown'),
      'import.meta.env.VITE_BUILD_DATE': JSON.stringify(new Date().toISOString()),
    },
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/(pale|seamlessphoto)\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gsi-map-tiles',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
              },
            },
            {
              urlPattern: /^https:\/\/mt[0-9]\.google\.com\/vt\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-map-tiles',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
                cacheableResponse: { statuses: [0, 200] },
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
      }),
      createHtmlPlugin({
        minify: true,
        inject: {
          data: {
            VITE_GOOGLE_MAPS_API_URL: env.VITE_GOOGLE_MAPS_API_URL,
          },
        },
      }),
    ],
    base: './',
  };
});
      },
    },
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
          {
            // Google Mapsのタイルをキャッシュするための設定
            urlPattern: /^https:\/\/mt[0-9]\.google\.com\/vt\//,
            handler: 'CacheFirst', // キャッシュ優先戦略
            options: {
              cacheName: 'google-map-tiles',
              expiration: {
                maxEntries: 500, // キャッシュするタイルの最大数
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30日間キャッシュを保持
              },
              // CORS非対応のリクエスト（Opaque Response）もキャッシュ対象に含める
              cacheableResponse: { statuses: [0, 200] },
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