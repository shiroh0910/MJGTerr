import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser, setGeolocationFallback } from './map.js';
import { MapManager } from './map-manager.js';
import { MarkerManager } from './marker-manager.js'; // この行は直接使われないが、依存関係として明確化
import { BoundaryManager } from './boundary-manager.js'; // この行は直接使われないが、依存関係として明確化
import { ApartmentEditor } from './apartment-editor.js'; // この行は直接使われないが、依存関係として明確化
import { UserSettingsManager } from './user-settings-manager.js'; // この行は直接使われないが、依存関係として明確化
import { PopupContentFactory } from './popup-content-factory.js'; // この行は直接使われないが、依存関係として明確化
import { UIManager } from './ui.js';
import { showModal } from './utils.js';
import { googleDriveService } from './google-drive-service.js';
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
    // 1. まずスピナーを表示して、アプリの準備中であることを示す
    this.uiManager.toggleLoading(true, 'アプリケーションを準備しています...');
    // UIの更新（スピナー表示）を待ってから後続の処理を開始する
    await new Promise(resolve => requestAnimationFrame(resolve));

    // 2. 地図をセットアップして表示する
    this._setupMap();
    this._setupEventListeners();
    this._displayVersionInfo();

    // 3. Google Identity Service (GIS) クライアントの準備を待つ
    await googleDriveService.waitForGsiClient();

    // 4. GISの準備ができてから認証フローを開始する
    // これにより、地図表示がブロックされない
    this.authController.initialize(); // この中で非同期に認証が進む
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
    this.uiManager.updateFollowingStatus(true); // 地図のセットアップ後に追従モードをON
  }

  /**
   * サインインが成功したときに呼び出されるコールバック
   * @private
   */
  async _onSignedIn() {
    this.uiManager.toggleLoading(true, '区域データを読み込んでいます...');
    try {
      // 1. 区域データを先に読み込んで表示する
      await this.mapManager.loadAllBoundaries();
      // 2. マーカーデータを読み込む
      this.uiManager.toggleLoading(true, 'マーカーを読み込んでいます...');
      await this.mapManager.renderMarkersFromDrive();

      // 3. ユーザー設定（フィルター、タイルレイヤー）を読み込み、地図に適用する
      const settings = await this.mapManager.loadUserSettings();

      // 4. 保存された地図の視点があれば、フォールバックとして設定する
      if (settings && settings.lastMapCenter && settings.lastMapZoom) {
        setGeolocationFallback(settings.lastMapCenter, settings.lastMapZoom);
      }
    } catch (error) {
      console.error('データの初期読み込みに失敗しました:', error);
      showToast('データの読み込みに失敗しました。', 'error');
    } finally {
      this.uiManager.toggleLoading(false);
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
    // バージョン表示用の要素を動的に作成
    const versionDisplay = document.createElement('div');
    versionDisplay.id = 'app-version-display';
    document.body.appendChild(versionDisplay);

    const branch = import.meta.env.VITE_GIT_BRANCH;
    const buildDate = import.meta.env.VITE_BUILD_DATE;

    if (branch === 'main' || branch === 'master' || branch === 'develop') {
      versionDisplay.textContent = `Release: ${buildDate.slice(0, 10)}`;
    } else {
      versionDisplay.textContent = `Branch: ${branch}`;
    }

    versionDisplay.addEventListener('click', () => {
      const buildInfo = `Branch: ${branch}<br>Build Date: ${buildDate}`;
      showModal(buildInfo, { type: 'alert' });
    });
  }
}

// アプリケーションを即時起動
const app = new App();
app.run();
