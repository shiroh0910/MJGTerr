import { showModal, showToast } from './utils.js';
import { UI_TEXT } from './constants.js';

export class UIManager {
  constructor() {
    // UI要素の参照
    this.markerButton = document.getElementById('edit-mode-button');
    this.boundaryButton = document.getElementById('boundary-draw-button');
    this.finishDrawingButton = document.getElementById('finish-drawing-button');
    this.centerMapButton = document.getElementById('center-map-button');
    this.filterByAreaButton = document.getElementById('filter-by-area-button');
    this.resetMarkersButton = document.getElementById('reset-markers-in-area-button');
    this.exportButton = document.getElementById('export-button');
    this.backupButton = document.getElementById('backup-button');
    this.userProfileContainer = document.getElementById('user-profile-container');
    this.userProfilePic = document.getElementById('user-profile-pic');
    this.userProfileName = document.getElementById('user-profile-name');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.mapContainer = document.getElementById('map');
    this.adminPageContainer = document.getElementById('admin-page');

    // 各コントローラー/マネージャーを保持するプロパティ
    this.mapManager = null;
    this.mapController = null;
    this.exportPanel = null;
    this.authController = null;

    // 初期状態では編集関連のボタンをすべて無効化しておく
    this.updateSignInStatus(false, null, false);

    // このボタンは他のマネージャーに依存しないため、ここで設定
    this.centerMapButton?.addEventListener('click', () => this._handleCenterMapClick());
  }

  /**
   * UIイベントリスナーを初期化し、各マネージャーと連携させる
   * @param {import('./map-manager.js').MapManager} mapManager
   * @param {{ centerMapToCurrentUser: () => void }} mapController
   * @param {import('./export-panel.js').ExportPanel} exportPanel
   * @param {import('./auth.js').AuthController} authController
   */
  initializeEventListeners(mapManager, mapController, exportPanel, authController) {
    this.mapManager = mapManager;
    this.mapController = mapController;
    this.exportPanel = exportPanel;
    this.authController = authController;

    this.markerButton.addEventListener('click', this._handleMarkerButtonClick.bind(this));
    this.boundaryButton.addEventListener('click', this._handleBoundaryButtonClick.bind(this));
    this.finishDrawingButton.addEventListener('click', this._handleFinishDrawingClick.bind(this));
    this.filterByAreaButton.addEventListener('click', this._handleFilterByAreaClick.bind(this));
    this.resetMarkersButton.addEventListener('click', this._handleResetMarkersClick.bind(this));
    this.exportButton?.addEventListener('click', this._handleExportClick.bind(this));
    this.backupButton?.addEventListener('click', this._handleBackupClick.bind(this));
  }

  updateMarkerModeButton(isActive) {
    this.markerButton.classList.toggle('active-green', isActive);
  }

  updateBoundaryModeButton(isActive) {
    this.boundaryButton.classList.toggle('active-green', isActive);
    this.finishDrawingButton.style.display = isActive ? 'block' : 'none';
  }

  updateFollowingStatus(isFollowing) {
    this.centerMapButton.classList.toggle('active', isFollowing);
  }

  updateSignInStatus(isSignedIn, userInfo, isAdmin) {
    this.userProfileContainer.style.display = isSignedIn && userInfo ? 'flex' : 'none';
    if (isSignedIn && userInfo) {
      this.userProfilePic.src = userInfo.picture;
      this.userProfileName.textContent = userInfo.name;
    }

    // 管理者専用ボタン
    const adminButtons = [
      this.markerButton,
      this.boundaryButton,
      this.exportButton,
      this.backupButton,
    ];

    // 全ユーザー向けボタン (ログイン時)
    const userButtons = [
      this.filterByAreaButton,
      this.resetMarkersButton,
    ];

    if (isSignedIn) {
      // 管理者ボタンはisAdminフラグに応じて表示/非表示
      adminButtons.forEach(button => button && (button.style.display = isAdmin ? 'block' : 'none'));
      // 一般ユーザーボタンは表示
      userButtons.forEach(button => button && (button.style.display = 'block'));
    } else {
      // ログアウト時はすべての機能ボタンを非表示
      [...adminButtons, ...userButtons].forEach(button => button && (button.style.display = 'none'));
    }
  }

  /**
   * ローディングオーバーレイの表示/非表示を切り替える
   * @param {boolean} show 表示する場合はtrue
   * @param {string} text 表示するテキスト
   */
  toggleLoading(show, text = '読み込み中...') {
    if (!this.loadingOverlay) return;

    const loadingText = this.loadingOverlay.querySelector('#loading-text');
    if (loadingText) loadingText.textContent = text;
    this.loadingOverlay.style.display = show ? 'flex' : 'none';
  }

  /**
   * 管理者ページを表示する
   */
  showAdminPage() {
    this.mapContainer.style.display = 'none';
    this.adminPageContainer.style.display = 'block';
  }

  /**
   * メインの地図ページを表示する
   */
  showMapPage() {
    this.mapContainer.style.display = 'block';
    this.adminPageContainer.style.display = 'none';
    // 地図のサイズが変更された可能性があるため、再描画を促す
    if (this.mapManager) this.mapManager.map.invalidateSize();
  }

  // --- プライベートなイベントハンドラ ---

  _handleCenterMapClick() {
    if (this.mapController) {
      // mapControllerのメソッドを直接呼び出す
      this.mapController.centerMapToCurrentUser();
    }
  }

  _handleMarkerButtonClick() {
    const isActive = this.mapManager.toggleMarkerEditMode();
    this.updateMarkerModeButton(isActive);
    this.updateBoundaryModeButton(this.mapManager.isBoundaryDrawMode); // 連動してOFFになる場合があるため
  }

  _handleBoundaryButtonClick() {
    const isActive = this.mapManager.toggleBoundaryDrawMode();
    this.updateBoundaryModeButton(isActive);
    this.updateMarkerModeButton(this.mapManager.isMarkerEditMode); // 連動してOFFになる場合があるため
  }

  async _handleFinishDrawingClick() {
    const success = await this.mapManager.finishDrawing();
    if (success) {
      const isActive = this.mapManager.toggleBoundaryDrawMode(); // モードをOFFに切り替え
      this.updateBoundaryModeButton(isActive);
    }
  }

  async _handleFilterByAreaClick() {
    const availableAreas = this.mapManager.getAvailableAreaNumbers();
    if (availableAreas.length === 0) {
      showToast(UI_TEXT.NO_AVAILABLE_AREAS, 'info');
      return;
    }

    const result = await showModal(UI_TEXT.PROMPT_FILTER_AREAS, {
      type: 'prompt',
      defaultValue: ''
    });

    // キャンセルされた場合は何もしない
    if (result === null) return;

    const selectedAreas = result.split(',').map(s => s.trim()).filter(s => s !== '');

    if (selectedAreas.length > 0) {
      // 区域が存在するかどうかのチェックはapplyAreaFilter内で行われる
      const validAreas = selectedAreas.filter(area => this.mapManager.getBoundaryLayerByArea(area));
      if (validAreas.length === 0) {
        showToast(UI_TEXT.NO_AREAS_FOUND, 'warning');
        // 有効な区域が一つもない場合は、何もせずに終了する（現在のフィルター状態を維持）
        return;
      }
      // 有効な区域が1つでもあれば、その区域でフィルターを適用し、設定を保存する
      this.mapManager.applyAreaFilter(validAreas);
      this.mapManager.saveUserSettings({ filteredAreaNumbers: validAreas });
    } else {
      // 「絞り込みを解除」が選択された場合
      this.mapManager.applyAreaFilter(null);
      this.mapManager.saveUserSettings({ filteredAreaNumbers: [] });
    }
  }

  async _handleResetMarkersClick() {
    const result = await showModal(UI_TEXT.PROMPT_RESET_AREAS, {
      type: 'prompt',
      defaultValue: ''
    });

    if (result === null || result.trim() === '') return;

    let selectedAreas;
    if (result.trim().toLowerCase() === 'all') {
      selectedAreas = this.mapManager.getAvailableAreaNumbers();
    } else {
      selectedAreas = result.split(',').map(s => s.trim()).filter(s => s !== '');
    }

    if (selectedAreas.length === 0) {
      showToast(UI_TEXT.NO_TARGET_AREAS, 'info');
      return;
    }

    const boundaryLayers = selectedAreas
      .map(area => this.mapManager.getBoundaryLayerByArea(area))
      .filter(layer => layer !== null);

    if (boundaryLayers.length === 0) {
      showToast(UI_TEXT.NO_AREAS_FOUND, 'warning');
      return;
    }

    const confirmed = await showModal(`${UI_TEXT.RESET_CONFIRM_PREFIX}${selectedAreas.join(', ')}${UI_TEXT.RESET_CONFIRM_SUFFIX}`);
    if (confirmed) {
      try {
        await this.mapManager.resetMarkersInBoundaries(boundaryLayers);
        showToast(`${UI_TEXT.RESET_SUCCESS_PREFIX}${selectedAreas.join(', ')}${UI_TEXT.RESET_SUCCESS_SUFFIX}`, 'success');
      } catch (error) {
        showToast(UI_TEXT.RESET_MARKERS_ERROR, 'error');
      }
    }
  }

  _handleExportClick() {
    const settings = this.mapManager.getUserSettings();
    const initialHeight = settings.exportPanelHeight || 33.33; // デフォルトは33.33vh

    this.exportPanel.open(
      () => this.mapManager.getAvailableAreaNumbers(),
      (filters) => this.mapManager.exportMarkersToCsv(filters),
      (newHeight) => {
        this.mapManager.saveUserSettings({ exportPanelHeight: newHeight });
      },
      initialHeight
    );
  }

  _handleBackupClick() {
    if (this.mapManager) {
      this.mapManager.backupAllData();
    }
  }
}
