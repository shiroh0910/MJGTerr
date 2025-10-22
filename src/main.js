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
    this.mapManager = new MapManager(map, markerClusterGroup, this.uiManager);
    this.exportPanel = new ExportPanel();
    this.authController = new AuthController(this.uiManager, this._onSignedIn.bind(this));
  }

  /**
   * アプリケーションのメイン処理を開始する
   */
  async run() {
    // アプリケーション起動時に地図を一度だけセットアップする
    this._setupMap();
    this._setupEventListeners();
    this._setupRouting();
    this._displayVersionInfo();
    await this.authController.initialize();
  }

  /**
   * 地図関連の初期設定を行う
   * @private
   */
  _setupMap() {
    const { baseLayers } = initializeMap( // initializeMapに初期レイヤー名を渡す
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
    let settings = {};
    try {
      // 1. ユーザー設定を先に読み込む
      settings = await this.mapManager.loadUserSettings();

      // 2. 読み込んだ設定でタイルレイヤーを切り替える
      const initialLayerName = settings?.selectedTileLayer || "淡色地図";
      if (this.mapManager.baseLayers[initialLayerName]) {
        this.mapManager.baseLayers[initialLayerName].addTo(map);
      }

      // 3. 区域データを読み込んで表示する
      await this.mapManager.loadAllBoundaries();
      // 4. マーカーデータを読み込む
      this.uiManager.toggleLoading(true, 'マーカーを読み込んでいます...');
      await this.mapManager.renderMarkersFromDrive();

      // 5. フィルター設定を適用
      if (settings && settings.filteredAreaNumbers) {
        this.mapManager.applyAreaFilter(settings.filteredAreaNumbers);
      }

      // 6. 保存された地図の視点があれば、フォールバックとして設定する
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
   * クライアントサイドルーティングを設定する
   * @private
   */
  _setupRouting() {
    const handleRouteChange = () => {
      const hash = window.location.hash.slice(1); // 先頭の'#'を除去

      // /admin ルートの処理
      if (hash === '/admin') {
        // 認証済みかつ管理者であるかチェック
        if (googleDriveService.isAuthenticated() && googleDriveService.isAdmin()) {
          this.uiManager.showAdminPage();
        } else {
          // 管理者でない場合はトップページにリダイレクト
          showToast('管理者権限がありません。', 'warning');
          window.location.hash = '/';
        }
      } else {
        // その他のルート（デフォルトルート含む）
        this.uiManager.showMapPage();
      }
    };

    // hashchangeイベントでルート変更を検知
    window.addEventListener('hashchange', handleRouteChange);

    // 初期読み込み時にもルート処理を実行
    // 認証状態が確定してから実行しないとisAdminが正しく判定できないため、
    // auth-status-changeイベントを一度だけリッスンする
    document.addEventListener('auth-status-change', handleRouteChange, { once: true });
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

// Google Identity Services がロードされたらアプリを起動する
// この関数はグローバルスコープにないと index.html から呼び出せない
window.onGsiLoad = function() {
  const app = new App();
  app.run();
};
