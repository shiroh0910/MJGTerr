import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser } from './map.js';
import { initGoogleDriveAPI, handleSignIn, handleSignOut } from './google-drive.js';
import { MapManager } from './map-manager.js';
import { UIManager } from './ui.js';
import { getAllMarkers, getAllBoundaries } from './db.js';

// --- アプリケーションの初期化 ---

// DOMの読み込みが完了したら、APIの初期化とイベントリスナーの設定を行う
document.addEventListener('DOMContentLoaded', () => {
  try {
    const uiManager = new UIManager();

    const onSignedIn = () => {
      // サインイン後、Driveから最新データを取得
      mapManager.renderMarkersFromDrive();
      mapManager.loadAllBoundaries();
    };

    const onAuthStatusChange = (isSignedIn, userInfo) => {
      uiManager.updateSignInStatus(isSignedIn, userInfo);
      if (!isSignedIn) {
        // サインアウト時はDBのデータで再描画
        loadDataFromDB();
      }
    };

    // 地図クリック時の処理
    const onMapClick = (e) => {
      // マーカー編集モードが有効な場合のみマーカーを追加
      if (mapManager && mapManager.isMarkerEditMode) {
        mapManager.addNewMarker(e.latlng);
      }
    };

    // 地図の初期化（UI更新コールバックを渡す）
    initializeMap(onMapClick, (isFollowing) => uiManager.updateFollowingStatus(isFollowing));

    // Google Drive APIの初期化
    initGoogleDriveAPI(onSignedIn, onAuthStatusChange).catch(console.error);

    // MapManagerのインスタンス化
    const mapManager = new MapManager(map, markerClusterGroup);

    // まずDBからデータを読み込んで表示
    const loadDataFromDB = async () => {
      const markers = await getAllMarkers();
      mapManager.renderMarkers(markers);
      const boundaries = await getAllBoundaries();
      mapManager.renderBoundaries(boundaries);
    };
    loadDataFromDB();

    // UIイベントリスナーの初期化
    uiManager.initializeEventListeners(
      mapManager,
      {
        centerMapToCurrentUser: () => {
          centerMapToCurrentUser();
          uiManager.updateFollowingStatus(true); // 追従状態をUIに反映
        }
      },
      { handleSignIn: () => handleSignIn(onSignedIn), handleSignOut }
    );

    // 初期状態のボタン表示を更新
    uiManager.updateFollowingStatus(true); // 初期状態は追従モード

    // Service Workerからのメッセージをリッスン
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data) {
          switch (event.data.type) {
            case 'SYNC_STARTED':
              uiManager.updateSyncStatus('syncing');
              break;
            case 'SYNC_COMPLETED':
              uiManager.updateSyncStatus(event.data.successful ? 'synced' : 'error');
              break;
          }
        }
      });
    }

  } catch (error) {
    console.error('DOMContentLoadedエラー:', JSON.stringify(error, null, 2));
  }
});
