import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser } from './map.js';
import { MapManager } from './map-manager.js';
import { BoundaryManager } from './boundary-manager.js'; // この行は直接使われないが、依存関係として明確化
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
  async run() {
    this._setupMap();
    this._setupEventListeners();
    this.uiManager.updateFollowingStatus(true); // 初期状態は追従モード

    // 認証の初期化を待機
    await this.authController.initialize();
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
  async _onSignedIn() {
    // 1. 最初に設定を非同期で読み込み開始
    const settingsPromise = this.mapManager.loadUserSettings();

    // 2. 次にマーカーと境界線を読み込み、描画が完了するのを待つ
    await Promise.all([
      this.mapManager.renderMarkersFromDrive(),
      this.mapManager.loadAllBoundaries()
    ]);

    // 3. 最後に、設定の読み込みを待ってから、フィルターを適用する
    const settings = await settingsPromise;
    if (settings && settings.filteredAreaNumbers) {
      this.mapManager.applyAreaFilter(settings.filteredAreaNumbers);
    }
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
      this.authController // authController
    );
  }

}

let gapiLoaded = false;
let gsiLoaded = false;

function startAppIfReady() {
  // 両方のライブラリがロードされたらアプリを起動
  if (gapiLoaded && gsiLoaded) {
    const app = new App();
    app.run();
  }
}

window.onGapiLoad = () => {
  gapiLoaded = true;
  startAppIfReady();
};

window.onGsiLoad = () => {
  gsiLoaded = true;
  startAppIfReady();
};
