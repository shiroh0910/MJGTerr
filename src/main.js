import { MapController, markerClusterGroup } from './map.js';
import { MapManager } from './map-manager.js';
import { MarkerManager } from './marker-manager.js'; 
import { BoundaryManager } from './boundary-manager.js';
import { ApartmentEditor } from './apartment-editor.js';
import { UserSettingsManager } from './user-settings-manager.js';
import { PopupContentFactory } from './popup-content-factory.js';
import { UIManager } from './ui.js';
import { showModal, showToast } from './utils.js';
import { UI_TEXT } from './constants.js';
import { ExportPanel } from './export-panel.js';
import { AuthController } from './auth.js';

/**
 * アプリケーションのメインクラス
 * 全体の初期化と各マネージャーの連携を管理する
 */
class App {
  constructor() {
    this.uiManager = new UIManager();
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
    // 認証より先に地図のセットアップを完了させる
    this.uiManager.initialize();
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
    const { baseLayers } = this.mapController.initialize((layerName) => {
      this.mapManager.saveUserSettings({ selectedTileLayer: layerName });
    });
    this.mapManager.setBaseLayers(baseLayers);
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
    const settingsPromise = this.mapManager.userSettingsManager.load();

    // 1. マーカーと境界線を読み込む
    await Promise.all([
      this.markerManager.renderAllFromDrive(),
      this.boundaryManager.loadAll()
    ]);

    // 2. ユーザー設定（フィルター、タイルレイヤー）を読み込み、地図に適用する
    const settings = await settingsPromise;
    if (settings && settings.filteredAreaNumbers) {
      this._applyAreaFilter(settings.filteredAreaNumbers);
    }
    const initialLayerName = settings?.selectedTileLayer || "淡色地図";
    const initialLayer = this.mapManager.baseLayers[initialLayerName] || this.mapManager.baseLayers["淡色地図"];
    if (initialLayer) {
      initialLayer.addTo(this.mapController.map);
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

  _applyAreaFilter(areaNumbers) {
    if (!areaNumbers || areaNumbers.length === 0) {
      this.boundaryManager.filterByArea(null);
      this.markerManager.filterByBoundaries(null);
      return;
    }

    const boundaryLayers = areaNumbers
      .map(area => this.boundaryManager.getLayerByArea(area))
      .filter(layer => layer !== null);

    if (boundaryLayers.length > 0) {
      const group = new L.FeatureGroup(boundaryLayers);
      this.mapController.map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 18 });
    }
    this.boundaryManager.filterByArea(areaNumbers);
    this.markerManager.filterByBoundaries(boundaryLayers);
  }
}

let gapiLoaded = false;
let gsiLoaded = false;

function startAppIfReady() {
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
