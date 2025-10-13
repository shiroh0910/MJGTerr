import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser, setGeolocationFallback } from './map.js';
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
    this._displayVersionInfo();

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
    const settings = await this.mapManager.loadUserSettings();

    // 3. 保存された地図の視点があれば、フォールバックとして設定する
    if (settings && settings.lastMapCenter && settings.lastMapZoom) {
      setGeolocationFallback(settings.lastMapCenter, settings.lastMapZoom);
      // 現在地追従中でなければ、保存された視点に地図を移動
      // isFollowingUser は map.js 内で管理されているため、ここでは map.setView を直接呼ばない
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
      this.exportPanel, // exportPanel
      this.authController
    );
  }

  /**
   * ビルド情報を画面に表示する
   * @private
   */
  _displayVersionInfo() {
    // Leafletのコントロールコンテナを取得
    const leafletControlContainer = document.querySelector('.leaflet-bottom.leaflet-left');
    if (!leafletControlContainer) return;

    // バージョン表示用の要素を動的に作成
    const versionDisplay = document.createElement('div');
    versionDisplay.id = 'app-version-display';
    leafletControlContainer.appendChild(versionDisplay);
    if (!versionDisplay) return;

    const branch = import.meta.env.VITE_GIT_BRANCH;
    const buildDate = import.meta.env.VITE_BUILD_DATE;

    if (branch === 'main' || branch === 'master' || branch === 'develop') {
      // mainまたはdevelopブランチの場合は、リリース日（ビルド日）を表示
      versionDisplay.textContent = `Release: ${buildDate.slice(0, 10)}`;
    } else {
      // それ以外のブランチの場合は、ブランチ名を表示
      versionDisplay.textContent = `Branch: ${branch}`;
    }

    // クリックイベントを追加
    versionDisplay.addEventListener('click', () => {
      const buildInfo = `Branch: ${branch}\nBuild Date: ${buildDate}`;
      alert(buildInfo);
    });
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
