import { showModal, showToast } from './utils.js';
import { googleDriveService } from './google-drive-service.js';
import { UI_TEXT, DEFAULT_PANEL_HEIGHT, REPORT_TYPES, MANUAL_FILENAME } from './constants.js';

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
    this.manualButton = this._createManualButton(); // ボタンを動的に作成
    this.reportIssueButton = this._createReportIssueButton(); // ボタンを動的に作成
    this.helpButton = this._createHelpButton(); // ヘルプボタンを動的に作成
    this.adminPageLink = document.getElementById('admin-page-link');
    this.controlsContainer = document.getElementById('controls-container');
    this.mapContainer = document.getElementById('map');

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

  // --- 初期化関連 ---

  /**
   * 「マニュアル」ボタンを動的に作成してDOMに追加する
   * @private
   */
  _createManualButton() {
    const button = document.createElement('button');
    button.id = 'manual-button';
    button.className = 'control-button';
    button.title = 'マニュアルを開く';
    button.innerHTML = '<i class="fa-solid fa-circle-question"></i>';
    // 既存のバックアップボタンの前に挿入
    document.getElementById('backup-button')?.before(button);
    return button;
  }

  /**
   * 「問題を報告」ボタンを動的に作成してDOMに追加する
   * @private
   */
  _createReportIssueButton() {
    const button = document.createElement('button');
    button.id = 'report-issue-button';
    button.className = 'control-button';
    button.title = '問題を報告';
    button.innerHTML = '<i class="fa-solid fa-flag"></i>';
    // 既存のバックアップボタンの前に挿入
    document.getElementById('backup-button')?.before(button);
    return button;
  }

  /**
   * 「ヘルプ」ボタンを動的に作成してDOMに追加する
   * @private
   */
  _createHelpButton() {
    const button = document.createElement('div');
    button.id = 'help-button-container';
    button.className = 'control-button-container';
    button.innerHTML = `
      <button id="help-button" class="control-button" title="ヘルプ">
        <i class="fa-solid fa-question-circle"></i>
      </button>
      <span id="help-badge" class="notification-badge" style="display: none;"></span>
    `;
    document.getElementById('report-issue-button')?.before(button);
    return button;
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
    this.manualButton?.addEventListener('click', this._handleManualClick.bind(this));
    this.reportIssueButton?.addEventListener('click', this._handleReportIssueClick.bind(this));
    this.helpButton?.querySelector('#help-button')?.addEventListener('click', this._handleHelpClick.bind(this));

    // ウィンドウリサイズ時にコンテナ幅を調整
    // _adjustControlsContainerWidth が存在しない可能性があるのでチェック
    if (this.controlsContainer) window.addEventListener('resize', () => this._adjustControlsContainerWidth());
  }

  /**
   * 表示されているコントロールボタンの合計幅に合わせてコンテナの幅を調整する
   * @private
   */
  _adjustControlsContainerWidth() {
    if (!this.controlsContainer) return;

    let totalWidth = 0;
    const buttons = this.controlsContainer.querySelectorAll('.control-button');
    buttons.forEach(button => {
      // style.displayが'none'でない表示されているボタンのみを計算対象とする
      if (window.getComputedStyle(button).display !== 'none') {
        totalWidth += button.offsetWidth;
      }
    });
  }

  updateMarkerModeButton(isActive) {
    this.markerButton?.classList.toggle('active-green', isActive);
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

  async updateSignInStatus(isSignedIn, userInfo, isAdmin) {
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
      this.reportIssueButton,
      this.manualButton,
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
    // ボタンの表示状態が変わったので、幅を再計算する (メソッドが存在する場合のみ)
    if (this.controlsContainer) this._adjustControlsContainerWidth();
  }

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
      defaultValue: '',
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
      defaultValue: '',
    });

    if (result === null || result.trim() === '') return;

    let selectedAreas;
    if (result.trim().toLowerCase() === UI_TEXT.ALL_AREAS_KEYWORD) {
      selectedAreas = this.mapManager.getAvailableAreaNumbers();
    } else {
      selectedAreas = result.split(',').map(s => s.trim()).filter(s => s !== '');
    }

    if (selectedAreas.length === 0) {
      showToast(UI_TEXT.NO_TARGET_AREAS, 'info');
      return;
    }

    const boundaryLayers = selectedAreas.map(area => this.mapManager.getBoundaryLayerByArea(area)).filter(layer => layer !== null);

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
    const initialHeight = settings.exportPanelHeight || DEFAULT_PANEL_HEIGHT.EXPORT_PANEL;

    this.exportPanel.open(
      () => this.mapManager.getAvailableAreaNumbers(),
      (filters) => this.mapManager.exportMarkersToCsv(filters),
      newHeight => this.mapManager.saveUserSettings({ exportPanelHeight: newHeight }),
      initialHeight
    );
  }

  _handleBackupClick() {
    if (this.mapManager) {
      this.mapManager.backupAllData();
    }
  }

  async _handleManualClick() {
    this.toggleLoading(true, 'マニュアルを読み込み中...');
    try {
      const files = await googleDriveService.loadByPrefix(`${MANUAL_FILENAME}.json`);
      if (files.length > 0 && files[0].data.content) {
        // marked.jsを使用してMarkdownをHTMLに変換
        const contentHtml = marked.parse(files[0].data.content);
        await showModal(contentHtml, { type: 'alert', customClass: 'markdown-content' });
      } else {
        showToast('マニュアルが設定されていません。', 'info');
      }
    } catch (error) {
      console.error('マニュアルの読み込みに失敗しました:', error);
      showToast('マニュアルの読み込みに失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }

  async _handleReportIssueClick() {
    const reportTypeOptions = REPORT_TYPES.map(type => `<option value="${type}">${type}</option>`).join('');

    const modalHtml = `
      <div class="report-issue-modal">
        <p>${UI_TEXT.REPORT_ISSUE_MODAL_TITLE}</p>
        <div class="modal-field">
          <label for="report-type">${UI_TEXT.REPORT_ISSUE_TYPE_LABEL}</label>
          <select id="report-type">${reportTypeOptions}</select>
        </div>
        <div class="modal-field">
          <label for="report-content">${UI_TEXT.REPORT_ISSUE_CONTENT_LABEL}</label>
          <textarea id="report-content" rows="5" placeholder="${UI_TEXT.REPORT_ISSUE_CONTENT_PLACEHOLDER}"></textarea>
        </div>
      </div>
    `;

    const result = await showModal(modalHtml, { type: 'confirm' });

    if (result) {
      const type = document.getElementById('report-type').value;
      const content = document.getElementById('report-content').value;

      if (!content.trim()) {
        showToast(UI_TEXT.REPORT_ISSUE_EMPTY_CONTENT, 'warning');
        return;
      }

      this.toggleLoading(true, UI_TEXT.SENDING);
      await this.mapManager.reportIssue({ type, content });
      this.toggleLoading(false);
      showToast(UI_TEXT.REPORT_ISSUE_SUCCESS, 'success');
    }
  }

  async _handleHelpClick() {
    this.toggleLoading(true, 'マニュアルを読み込み中...');
    // バッジを非表示にする
    this.showHelpBadge(false);

    try {
      const manualData = await this.mapManager.getManual();
      if (manualData && manualData.content) {
        // MarkdownをHTMLに変換
        const contentHtml = marked.parse(manualData.content);
        // モーダルウィンドウのスタイルを調整
        const modalContent = `<div class="manual-modal-content">${contentHtml}</div>`;
        showModal(modalContent, { type: 'alert' });
        // マニュアルを読んだので、最終確認日時を更新する
        this.mapManager.saveUserSettings({ lastCheckedManualTimestamp: manualData.updatedAt });
      } else {
        showToast('マニュアルが見つかりませんでした。', 'info');
      }
    } catch (error) {
      console.error('マニュアルの表示に失敗しました:', error);
      showToast('マニュアルの表示に失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }
}
