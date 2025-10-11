import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser } from './map.js';
import { MapManager } from './map-manager.js';
import { MarkerManager } from './marker-manager.js'; // この行は直接使われないが、依存関係として明確化
import { BoundaryManager } from './boundary-manager.js'; // この行は直接使われないが、依存関係として明確化
import { ApartmentEditor } from './apartment-editor.js'; // この行は直接使われないが、依存関係として明確化
import { UserSettingsManager } from './user-settings-manager.js'; // この行は直接使われないが、依存関係として明確化
import { PopupContentFactory } from './popup-content-factory.js'; // この行は直接使われないが、依存関係として明確化
import { UIManager } from './ui.js';
import { ExportPanel } from './export-panel.js';
import { AuthController } from './auth.js';

/**
 * アプリケーションのメインクラス
 * 全体の初期化と各マネージャーの連携を管理する
 */
class App {
  constructor() {
    this.uiManager = new UIManager();
    this.mapManager = new MapManager(map, markerClusterGroup);
    this.exportPanel = new ExportPanel();
    this.authController = new AuthController(this.uiManager, this._onSignedIn.bind(this));
  }

  /**
   * アプリケーションのメイン処理を開始する
   */
  async run() {
    // 認証より先に地図のセットアップを完了させる
    this._setupMap();
    this._setupEventListeners();
    this.uiManager.updateFollowingStatus(true); // 初期状態は追従モード

    // 認証の初期化を開始し、完了を待つ
    await this.authController.initialize();
  }

  /**
   * 地図関連の初期設定を行う
   * @private
   */
  _setupMap() {
    const { baseLayers } = initializeMap(
      (e) => { // onMapClick
        if (this.mapManager.isMarkerEditMode) {
          this.mapManager.addNewMarker(e.latlng);
        }
      },
      { // callbacks
        onFollowingStatusChange: (isFollowing) => this.uiManager.updateFollowingStatus(isFollowing),
        onBaseLayerChange: (layerName) => {
          this.mapManager.saveUserSettings({ selectedTileLayer: layerName });
        }
      }
    );
    this.mapManager.setBaseLayers(baseLayers);
  }

  /**
   * サインインが成功したときに呼び出されるコールバック
   * @private
   */
  async _onSignedIn() {
    // 1. マーカーと境界線を読み込む
    await Promise.all([
      this.mapManager.renderMarkersFromDrive(),
      this.mapManager.loadAllBoundaries()
    ]);

    // 2. ユーザー設定（フィルター、タイルレイヤー）を読み込み、地図に適用する
    await this.mapManager.loadUserSettings();
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
      this.exportPanel, // exportPanel
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
