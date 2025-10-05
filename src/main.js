import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser } from './map.js';
import { initGoogleDriveAPI, handleSignOut as originalHandleSignOut, promptSignIn, isAuthenticated } from './google-drive.js';
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
    try {
      this._setupMap();

      // Googleライブラリがロード済みであれば、認証処理を開始
      if (this.isGoogleLibraryLoaded) {
        await this._setupAuth();
      }

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

    // 認証初期化後、少し待ってもログイン状態にならない場合はサインインを促す
    setTimeout(() => {
      if (!this.isSignedIn) {
        promptSignIn();
      }
    }, 1500); // 1.5秒後にチェック
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
          // Googleのサインアウト処理を実行
          originalHandleSignOut();
        },
        requestSignIn: promptSignIn,
        isAuthenticated: isAuthenticated,
      }
    );
  }

}

// Appインスタンスをグローバルスコープで作成
const app = new App();

window.onGoogleLibraryLoad = async () => {
  app.isGoogleLibraryLoaded = true;
  // Appの初期化が既に実行済みの場合に備えて、認証処理を試みる
  // 通常は app.initialize() の中で呼ばれる
  // 認証フローが完了してから、Appのメイン初期化を行うように変更
  await app._setupAuth();
  app.initialize();
};

document.addEventListener('DOMContentLoaded', () => {
  // 初期化は onGoogleLibraryLoad に任せる
});
