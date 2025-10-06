import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser } from './map.js';
import { initGoogleDriveAPI, handleSignOut as originalHandleSignOut, requestAccessToken, isAuthenticated } from './google-drive.js';
import { MapManager } from './map-manager.js';
import { UIManager } from './ui.js';
import { showToast } from './utils.js';

/**
 * アプリケーションのメインクラス
 * 全体の初期化と各マネージャーの連携を管理する
 */
class App {
  constructor() {
    this.uiManager = new UIManager();
    this.mapManager = new MapManager(map, markerClusterGroup);
    this.isGoogleLibraryLoaded = false; // Googleライブラリのロード状態を追跡するフラグ
    this.isSignedIn = false; // ログイン状態を追跡するフラグ
  }

  /**
   * アプリケーションを初期化する
   */
  async initialize() {
    this._setupMap();
    this._setupEventListeners();
    this.uiManager.updateFollowingStatus(true); // 初期状態は追従モード
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
      this.isSignedIn = isSignedIn; // ログイン状態を更新
      // デバッグ用にトースト通知を追加
      if (isSignedIn) {
        showToast(`ようこそ、${userInfo.name}さん`, 'success');
      } else {
        showToast('Googleアカウントからログアウトしました。', 'info');
        // ログアウト時のみメッセージを表示
        if (this.isSignedIn) { // このチェックは、初期化時の不要なメッセージを防ぐ
          showToast('Googleアカウントからログアウトしました。', 'info');
        }
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
        requestSignIn: requestAccessToken,
        isAuthenticated: isAuthenticated,
      }
    );
  }

}

// Appインスタンスをグローバルスコープで作成
const app = new App();

window.onGoogleLibraryLoad = async () => {
  // 1. まず認証フローを開始し、完了を待つ
  await app._setupAuth();
  // 2. 認証フロー完了後、アプリケーションのメイン初期化を行う
  app.initialize();
};

document.addEventListener('DOMContentLoaded', () => {
  // 初期化は onGoogleLibraryLoad に任せる
});
