import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser } from './map.js';
import { initGoogleDriveAPI, handleSignOut as originalHandleSignOut } from './google-drive.js';
import { MapManager } from './map-manager.js';
import { UIManager } from './ui.js';

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
      this._setupMap();
      // _setupAuthは onGoogleLibraryLoad から呼び出されるように変更
      this._setupEventListeners();

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
      // auth.jsへの依存を削除。ログイン状態はgoogle-drive.js内で完結させる。
      // オフラインフォールバックは削除
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
        },
      }
    );
  }

}

// Appインスタンスをグローバルスコープで作成
const app = new App();

// Googleのライブラリがロードされたときに呼び出されるグローバル関数
// この関数は index.html の script タグの data-onload 属性から呼び出される
window.onGoogleLibraryLoad = () => {
  app._setupAuth(); // 認証関連の初期化をトリガー
};

document.addEventListener('DOMContentLoaded', () => {
  // Googleライブラリのロードとは非同期に、Appのメイン初期化処理を実行
  app.initialize();
});
