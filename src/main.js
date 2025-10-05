import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser } from './map.js';
import { initGoogleDriveAPI, handleSignOut as originalHandleSignOut } from './google-drive.js';
import { MapManager } from './map-manager.js';
import { UIManager } from './ui.js';
import { getAllMarkers, getAllBoundaries } from './db.js';
import { login, logout } from './auth.js';

/**
 * アプリケーションのメインクラス
 * 全体の初期化と各マネージャーの連携を管理する
 */
class App {
  constructor() {
    this.uiManager = new UIManager();
    this.mapManager = new MapManager(map, markerClusterGroup);
  }

  /**
   * アプリケーションを初期化する
   */
  async initialize() {
    try {
      this.uiManager.initializeOnlineStatus();
      this._setupMap();
      await this._loadInitialDataFromDB();
      await this._setupAuth();
      this._setupEventListeners();
      this._setupServiceWorkerListener();

      // 初期状態のUIを更新
      this.uiManager.updateFollowingStatus(true); // 初期状態は追従モード
    } catch (error) {
      console.error('アプリケーションの初期化に失敗しました:', error);
    }
  }

  /**
   * 地図関連の初期設定を行う
   * @private
   */
  _setupMap() {
    const onMapClick = (e) => {
      if (this.mapManager.isMarkerEditMode) {
        this.mapManager.addNewMarker(e.latlng);
      }
    };
    initializeMap(onMapClick, (isFollowing) => this.uiManager.updateFollowingStatus(isFollowing));
  }

  /**
   * 認証関連の初期設定を行う
   * @private
   */
  async _setupAuth() {
    const onSignedIn = () => {
      this.mapManager.renderMarkersFromDrive();
      this.mapManager.loadAllBoundaries();
    };

    const onAuthStatusChange = (isSignedIn, userInfo) => {
      this.uiManager.updateSignInStatus(isSignedIn, userInfo);
      if (isSignedIn && userInfo.token) {
        login(userInfo.token); // ログイン状態をlocalStorageに保存
      } else {
        logout(); // ログアウト状態をlocalStorageから削除
      }
      if (!isSignedIn) {
        this._loadInitialDataFromDB(); // サインアウト時はDBのデータで再描画
      }
    };

    await initGoogleDriveAPI(onSignedIn, onAuthStatusChange);
  }

  /**
   * UIのイベントリスナーを初期化する
   * @private
   */
  _setupEventListeners() {
    this.uiManager.initializeEventListeners(
      this.mapManager,
      { // mapController
        centerMapToCurrentUser: () => {
          centerMapToCurrentUser();
          this.uiManager.updateFollowingStatus(true);
        }
      },
      { // authController
        handleSignOut: () => {
          // Googleのサインアウト処理と、ローカルのログアウト処理を両方実行
          originalHandleSignOut();
          logout();
        },
      }
    );
  }

  /**
   * Service Workerからのメッセージリスナーを設定する
   * @private
   */
  _setupServiceWorkerListener() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data) {
          switch (event.data.type) {
            case 'SYNC_STARTED':
              uiManager.updateSyncStatus('syncing');
              break;
            case 'SYNC_COMPLETED':
              this.uiManager.updateSyncStatus(event.data.successful ? 'synced' : 'error', event.data.successful ? '同期が完了しました' : '同期に失敗しました');
              if (event.data.successful) {
                this.mapManager.renderMarkersFromDrive();
              }
              break;
          }
        }
      });
    }
  }

  /**
   * IndexedDBから初期データを読み込んで地図に描画する
   * @private
   */
  async _loadInitialDataFromDB() {
    const markers = await getAllMarkers();
    this.mapManager.renderMarkers(markers);
    const boundaries = await getAllBoundaries();
    this.mapManager.renderBoundaries(boundaries);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App().initialize();
});
