import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '戸別訪問PWA',
        short_name: 'VisitApp',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
        icons: [
          {
            src: '/icon.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,csv}']
      },
      srcDir: 'public',
      filename: 'sw.js'
    })
  ],
  resolve: {
    alias: {
      'leaflet': 'leaflet/dist/leaflet.js'
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: './index.html' // index.htmlをエントリーポイントに
      },
      output: {
        entryFileNames: 'main.js', // ハッシュなしでmain.js
        chunkFileNames: '[name].js',
        assetFileNames: ({ name }) => {
          if (name === 'styles.css') {
            return 'src/styles.css'; // /src/styles.cssに出力
          }
          return 'assets/[name].[ext]';
        }
      }
    }
  }
});