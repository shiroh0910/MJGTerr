import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';

// ビルド時のGitブランチ名とビルド日時を取得
let branch = 'unknown';
try {
  // Vercelの環境変数を優先的に使用し、なければローカルのgitコマンドを実行
  if (process.env.VERCEL_GIT_COMMIT_REF) {
    branch = process.env.VERCEL_GIT_COMMIT_REF;
  } else {
    branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  }
} catch (e) {
  console.warn('Could not get git branch, using "unknown".');
}
const buildDate = new Date().toISOString();

// https://vitejs.dev/config/
export default defineConfig({
  // アプリケーション内で環境変数として参照できるようにする
  define: {
    'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(branch),
    'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDate),
  },
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