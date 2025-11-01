import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { fileURLToPath, URL } from 'url';
import pkg from 'git-describe';
const { gitDescribeSync } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  // .env ファイルから環境変数をロード
  const env = loadEnv(mode, process.cwd());

  // Vercelの環境変数を優先し、なければローカルのgit-describeを使用
  const branch = process.env.VERCEL_GIT_COMMIT_REF || (() => {
    try {
      return gitDescribeSync(__dirname).branch;
    } catch (e) {
      return 'unknown';
    }
  })();

  return {
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          admin: resolve(__dirname, 'admin.html'),
        },
      },
    },
    define: {
      'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV),
      'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(branch),
      'import.meta.env.VITE_BUILD_DATE': JSON.stringify(new Date().toISOString()),
    },
    plugins: [
      // HTML内の環境変数を置換するためのカスタムプラグイン
      {
        name: 'html-transform',
        transformIndexHtml(html) {
          const apiKey = env.VITE_GOOGLE_MAPS_API_KEY;
          const apiUrl = apiKey ? `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async` : '';
          return html.replace(
            /%VITE_GOOGLE_MAPS_API_URL%/g,
            apiUrl
          );
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
          name: '宮島口会衆 訪問活動サポート',
          short_name: '訪問サポート',
          description: '宮島口会衆の訪問活動をサポートするアプリ',
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
    ],
    base: './',
  };
});