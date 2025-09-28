const CACHE_NAME = 'visit-pwa-cache-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/main.js',
        '/src/styles.css'
      ]);
    })
  );
});

// 更新検知
self.addEventListener('updatefound', () => {
  console.log('Service Worker: 更新検知');
  const newWorker = self.registration.installing;
  newWorker.onstatechange = () => {
    if (newWorker.state === 'installed') {
      if (navigator.serviceWorker.controller) {
        // クライアントに通知
        self.clients.matchAll().then(clients => {
          clients.forEach(client => client.postMessage({ type: 'UPDATE_AVAILABLE' }));
        });
      }
    }
  };
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('cyberjapandata.gsi.go.jp')) {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).then(fetchResponse => {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, fetchResponse.clone());
          });
          return fetchResponse;
        });
      })
    );
  }
});


self.addEventListener('activate', (event) => {
  console.log('Service Worker: アクティベーション UPDATE');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('古いキャッシュ削除:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
