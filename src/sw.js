import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// Vite PWA Pluginがプリキャッシュ対象のリストを自動的に挿入します
precacheAndRoute(self.__WB_MANIFEST);

// クライアントを即座に制御下に置く
self.skipWaiting();
clientsClaim();

/**
 * クライアントにメッセージを送信するヘルパー関数
 * @param {object} message - 送信するメッセージオブジェクト
 */
const postMessageToClients = async (message) => {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => {
    client.postMessage(message);
  });
};

// Background Syncプラグインのインスタンスを作成
const bgSyncPlugin = new BackgroundSyncPlugin('drive-queue', {
  maxRetentionTime: 24 * 60, // 24時間
  onSync: async ({ queue }) => {
    await postMessageToClients({ type: 'SYNC_STARTED' });
    let successful = true;
    try {
      await queue.replayRequests();
      console.log('キューのリプレイが完了しました。');
    } catch (error) {
      console.error('キューのリプレイ中にエラーが発生しました:', error);
      successful = false;
    } finally {
      await postMessageToClients({ type: 'SYNC_COMPLETED', successful });
    }
  },
});

// Google Drive APIへのリクエストを監視するルートを登録
const driveApiRoute = 'https://www.googleapis.com/upload/drive/v3/files';
const driveApiDeleteRoute = 'https://www.googleapis.com/drive/v3/files';

registerRoute(
  ({ url }) => url.href.startsWith(driveApiRoute) || url.href.startsWith(driveApiDeleteRoute),
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'POST' // POST (作成)
);

registerRoute(
  ({ url }) => url.href.startsWith(driveApiRoute) || url.href.startsWith(driveApiDeleteRoute),
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'PATCH' // PATCH (更新)
);

registerRoute(
  ({ url }) => url.href.startsWith(driveApiDeleteRoute),
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'DELETE' // DELETE (削除)
);

// SPAのためのナビゲーションフォールバック
// どのURLにアクセスしてもindex.htmlを返すように設定
const handler = createHandlerBoundToURL('/index.html');
const navigationRoute = new NavigationRoute(handler);
registerRoute(navigationRoute);