import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser, setGeolocationFallback } from './map.js';
import { MapManager } from './map-manager.js';
import { MarkerManager } from './marker-manager.js'; 
import { BoundaryManager } from './boundary-manager.js';
import { ApartmentEditor } from './apartment-editor.js';
import { UserSettingsManager } from './user-settings-manager.js';
import { PopupContentFactory } from './popup-content-factory.js';
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

    this.mapController = new MapController(
      (e) => this._onMapClick(e),
      (isFollowing) => this.uiManager.updateFollowingStatus(isFollowing),
      (address) => this.uiManager.updateAddressDisplay(address)
    );
    this.mapManager = new MapManager(this.mapController.map, markerClusterGroup);
    this.markerManager = this.mapManager.markerManager; // ショートカット
    this.boundaryManager = this.mapManager.boundaryManager; // ショートカット
  }

  /**
   * アプリケーションのメイン処理を開始する
   */
  async run() {
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
    const { baseLayers } = this.mapController.initialize((layerName) => {
      this.mapManager.saveUserSettings({ selectedTileLayer: layerName });
    });
    this.mapManager.setBaseLayers(baseLayers);
    this.uiManager.updateFollowingStatus(true); // 地図のセットアップ後に追従モードをON
  }

  /**
   * 地図クリック時のイベントハンドラ
   * @param {L.LeafletMouseEvent} e
   */
  _onMapClick(e) {
    if (this.mapManager.isMarkerEditMode) {
      this.mapManager.addNewMarker(e.latlng);
    }
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
    const controls = this.uiManager.elements;
    controls.centerMapButton.addEventListener('click', () => this._handleCenterMapClick());
    controls.markerButton.addEventListener('click', () => this._handleMarkerButtonClick());
    controls.boundaryButton.addEventListener('click', () => this._handleBoundaryButtonClick());
    controls.finishDrawingButton.addEventListener('click', () => this._handleFinishDrawingClick());
    controls.filterByAreaButton.addEventListener('click', () => this._handleFilterByAreaClick());
    controls.resetMarkersButton.addEventListener('click', () => this._handleResetMarkersClick());
    controls.exportButton.addEventListener('click', () => this._handleExportClick());
  }

  // --- イベントハンドラ ---

  _handleCenterMapClick() {
    this.mapController.centerMapToCurrentUser();
    this.uiManager.updateFollowingStatus(true);
  }

  _handleMarkerButtonClick() {
    const isActive = this.mapManager.toggleMarkerEditMode();
    this.uiManager.updateMarkerModeButton(this.mapManager.isMarkerEditMode);
    this.uiManager.updateBoundaryModeButton(this.mapManager.isBoundaryDrawMode);
  }

  _handleBoundaryButtonClick() {
    const isActive = this.mapManager.toggleBoundaryDrawMode();
    this.uiManager.updateBoundaryModeButton(isActive);
    this.uiManager.updateMarkerModeButton(this.mapManager.isMarkerEditMode);
  }

  async _handleFinishDrawingClick() {
    const success = await this.boundaryManager.finishDrawing();
    if (success) {
      const isActive = this.mapManager.toggleBoundaryDrawMode();
      this.uiManager.updateBoundaryModeButton(isActive);
    }
  }

  async _handleFilterByAreaClick() {
    const availableAreas = this.boundaryManager.getAvailableAreaNumbers();
    if (availableAreas.length === 0) {
      showToast(UI_TEXT.NO_AVAILABLE_AREAS, 'info');
      return;
    }

    const result = await showModal(UI_TEXT.PROMPT_FILTER_AREAS, {
      type: 'prompt',
      defaultValue: ''
    });

    if (result === null) return;

    const selectedAreas = result.split(',').map(s => s.trim()).filter(s => s !== '');

    this._applyAreaFilter(selectedAreas);
    this.mapManager.saveUserSettings({ filteredAreaNumbers: selectedAreas });
  }

  async _handleResetMarkersClick() {
    const result = await showModal(UI_TEXT.PROMPT_RESET_AREAS, {
      type: 'prompt',
      defaultValue: ''
    });

    if (result === null || result.trim() === '') return;

    let selectedAreas;
    if (result.trim().toLowerCase() === 'all') {
      selectedAreas = this.boundaryManager.getAvailableAreaNumbers();
    } else {
      selectedAreas = result.split(',').map(s => s.trim()).filter(s => s !== '');
    }

    if (selectedAreas.length === 0) {
      showToast(UI_TEXT.NO_TARGET_AREAS, 'info');
      return;
    }

    const boundaryLayers = selectedAreas
      .map(area => this.boundaryManager.getLayerByArea(area))
      .filter(layer => layer !== null);

    if (boundaryLayers.length === 0) {
      showToast(UI_TEXT.NO_AREAS_FOUND, 'warning');
      return;
    }

    const confirmed = await showModal(`${UI_TEXT.RESET_CONFIRM_PREFIX}${selectedAreas.join(', ')}${UI_TEXT.RESET_CONFIRM_SUFFIX}`);
    if (confirmed) {
      try {
        await this.markerManager.resetInBoundaries(boundaryLayers);
        showToast(`${UI_TEXT.RESET_SUCCESS_PREFIX}${selectedAreas.join(', ')}${UI_TEXT.RESET_SUCCESS_SUFFIX}`, 'success');
      } catch (error) {
        showToast(UI_TEXT.RESET_MARKERS_ERROR, 'error');
      }
    }
  }

  _handleExportClick() {
    const settings = this.mapManager.userSettingsManager.settings || {};
    const initialHeight = settings.exportPanelHeight || 33.33;

    this.exportPanel.open(
      () => this.boundaryManager.getAvailableAreaNumbers(),
      (filters) => this.mapManager.exportMarkersToCsv(filters),
      (newHeight) => this.mapManager.saveUserSettings({ exportPanelHeight: newHeight }),
      initialHeight
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
