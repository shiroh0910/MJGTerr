import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser, setMapTheme } from './map.js';
import { MapManager } from './map-manager.js';
import { UIManager } from './ui.js';
import { AuthController } from './auth.js';

/**
 * アプリケーションのメインクラス
 * 全体の初期化と各マネージャーの連携を管理する
 */
class App {
  constructor() {
    this.uiManager = new UIManager();
    this.mapManager = new MapManager(map, markerClusterGroup);
    this.authController = new AuthController(this.uiManager, this._onSignedIn.bind(this));
  }

  /**
   * アプリケーションのメイン処理を開始する
   */
  run() {
    this._setupMap();
    this._setupEventListeners();
    this.uiManager.updateFollowingStatus(true); // 初期状態は追従モード

    this.authController.initialize().catch(error => {
      console.error("Authentication setup failed:", error);
    });
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
   * サインインが成功したときに呼び出されるコールバック
   * @private
   */
  _onSignedIn() {
    this.mapManager.renderMarkersFromDrive();
    this.mapManager.loadAllBoundaries();
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
      this.authController, // authController
      { // themeController
        onThemeChange: (theme) => {
          setMapTheme(theme);
        }
      }
    );
  }

}

document.addEventListener('DOMContentLoaded', () => {
  // DOMの準備ができてからアプリケーションを初期化する
  const app = new App();

  // Google APIライブラリのロード完了を待ってからアプリを実行する
  window.onGoogleLibraryLoad = () => {
    app.run();
  };
});
