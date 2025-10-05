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
    this.isGoogleLibraryLoaded = false; // Googleライブラリのロード状態を追跡するフラグ
  }

  /**
   * アプリケーションを初期化する
   */
  async initialize() {
    try {
      this._setupMap();
      this._setupEventListeners();

      // 初期状態のUIを更新
      this.uiManager.updateFollowingStatus(true); // 初期状態は追従モード

      // Googleライブラリがロード済みであれば、認証処理を開始
      // if (this.isGoogleLibraryLoaded) {
      //   await this._setupAuth();
      // }
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
      // this.uiManager.updateSignInStatus(isSignedIn, userInfo);
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
      }
    );
  }

}

// Appインスタンスをグローバルスコープで作成
const app = new App();

// Googleライブラリのロード完了時に呼び出されるグローバル関数
window.onGoogleLibraryLoad = async () => {
  app.isGoogleLibraryLoaded = true;
  // Appの初期化が完了していれば、認証処理を開始
  // まだなら、initialize() の最後で呼ばれる
  // if (app.uiManager && app.mapManager) {
  //   await app._setupAuth();
  // }
};

document.addEventListener('DOMContentLoaded', () => {
  app.initialize();
});
