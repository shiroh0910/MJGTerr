import { showModal, showToast } from './utils.js';
import { googleDriveService } from './google-drive-service.js';
import { UI_TEXT, USER_SETTINGS_PREFIX, ADMIN_USERS_FILENAME, ANNOUNCEMENTS_FILENAME } from './constants.js';

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
    this.adminPageLink = document.getElementById('admin-page-link');
    this.controlsContainer = document.getElementById('controls-container');
    this.topBar = document.getElementById('top-bar');
    this.currentAddressDisplay = document.getElementById('current-address-display');
    this.appVersionDisplay = document.getElementById('app-version-display');

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
   * UIの初期スタイルを設定する
   */
  applyInitialStyles() {
    this.controlsContainer.style.display = 'grid';
    this.controlsContainer.style.gridTemplateColumns = 'repeat(4, auto)';

    // マーカーを半透明にするスタイルを動的に追加
    const style = document.createElement('style');
    style.textContent = `
      /* .marker-translucent クラスを持つ要素の '子' である .marker-icon-background にスタイルを適用 */
      .marker-translucent .marker-icon-background {
        opacity: 0.8; /* 不透明度を80%に設定。0.0 (透明) から 1.0 (不透明) の間で調整してください */
        transition: opacity 0.2s ease-in-out; /* 透明度が変化する際にアニメーションを追加 */
      }
    `;
    document.head.appendChild(style);
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

    // 初期スタイルを適用
    this.applyInitialStyles();

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
  
  updateFilterButton(isActive) {
    this.filterByAreaButton.classList.toggle('active', isActive);
  }

  updateFollowingStatus(isFollowing) {
    this.centerMapButton.classList.toggle('active', isFollowing);
  }

  async updateSignInStatus(isSignedIn, userInfo) {
    // ユーザープロファイルのバッジを常に非表示にする
    this.userProfileContainer.style.display = 'none';

    const isAdmin = await googleDriveService.isAdmin();
    // 管理者ページへのリンク表示制御
    if (this.adminPageLink) {
      this.adminPageLink.style.display = isSignedIn && isAdmin ? 'flex' : 'none';
    }

    // 管理者専用ボタン
    const adminButtons = [
      this.boundaryButton,
      this.exportButton,
      this.backupButton,
    ];

    // 全ユーザー向けボタン (ログイン時)
    const userButtons = [
      this.markerButton,
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
   * ローディング状態をコンソールに出力する（地図ページ用）
   * @param {boolean} show 
   * @param {string} text 
   */
  toggleLoading(show, text = '読み込み中...') {
    // 地図ページには全画面のローディング表示はないため、コンソールログで状態を追跡する
    console.log(`Loading: ${show}, Message: ${text}`);
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
    // 連動してOFFになる場合があるため、境界線描画ボタンの状態も更新
    this.updateBoundaryModeButton(this.mapManager.isBoundaryDrawMode);
    this._updateTopBarEditMode();
  }

  _handleBoundaryButtonClick() {
    const isActive = this.mapManager.toggleBoundaryDrawMode();
    this.updateBoundaryModeButton(isActive);
    // 連動してOFFになる場合があるため、マーカー編集ボタンの状態も更新
    this.updateMarkerModeButton(this.mapManager.isMarkerEditMode);
    this._updateTopBarEditMode();
  }

  async _handleFinishDrawingClick() {
    const success = await this.mapManager.finishDrawing();
    if (success) {
      const isActive = this.mapManager.toggleBoundaryDrawMode(); // モードをOFFに切り替え
      this.updateBoundaryModeButton(isActive);
      this._updateTopBarEditMode();
    }
  }

  /**
   * いずれかの編集モードが有効な場合、トップバーにクラスを適用する
   * @private
   */
  _updateTopBarEditMode() {
    const isMarkerMode = this.mapManager.isMarkerEditMode;
    const isBoundaryMode = this.mapManager.isBoundaryDrawMode;

    // 地図コンテナのカーソル用クラスを更新
    this.mapContainer.classList.toggle('marker-edit-mode', isMarkerMode);
    this.mapContainer.classList.toggle('boundary-draw-mode', isBoundaryMode);

    // マーカー編集モードの時だけボタンエリアのスタイルを更新
    this.controlsContainer.classList.toggle('marker-edit-mode-active', isMarkerMode);

    // 区域作成モードの時だけボタンエリアのスタイルを更新
    this.controlsContainer.classList.toggle('boundary-draw-mode-active', isBoundaryMode);
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
