import { showModal, showToast } from './utils.js';

export class UIManager {
  constructor() {
    // 各コントローラー/マネージャーを保持するプロパティ
    this.mapManager = null;
    this.mapController = null;
    this.exportPanel = null;
    this.authController = null;
    this.elements = {}; // UI要素を保持するオブジェクト

    // 初期状態では編集関連のボタンをすべて無効化しておく
    this.updateSignInStatus(false, null);

    // このボタンは他のマネージャーに依存しないため、ここで設定
    this.centerMapButton.addEventListener('click', () => this._handleCenterMapClick());
  }

  /**
   * UIイベントリスナーを初期化し、各マネージャーと連携させる
   * @param {import('./map-manager.js').MapManager} mapManager
   * @param {{ centerMapToCurrentUser: () => void }} mapController
   * @param {import('./export-panel.js').ExportPanel} exportPanel
   * @param {import('./auth.js').AuthController} authController
   */
  initializeEventListeners(mapManager, mapController, exportPanel, authController) {
    // DOM要素の参照をこのタイミングで取得する
    this.elements = {
      markerButton: document.getElementById('edit-mode-button'),
      boundaryButton: document.getElementById('boundary-draw-button'),
      finishDrawingButton: document.getElementById('finish-drawing-button'),
      centerMapButton: document.getElementById('center-map-button'),
      filterByAreaButton: document.getElementById('filter-by-area-button'),
      resetMarkersButton: document.getElementById('reset-markers-in-area-button'),
      exportButton: document.getElementById('export-button'),
      userProfileContainer: document.getElementById('user-profile-container'),
      userProfilePic: document.getElementById('user-profile-pic'),
      userProfileName: document.getElementById('user-profile-name'),
    };

    this.mapManager = mapManager;
    this.mapController = mapController;
    this.exportPanel = exportPanel;
    this.authController = authController;

    this.elements.markerButton.addEventListener('click', this._handleMarkerButtonClick.bind(this));
    this.elements.boundaryButton.addEventListener('click', this._handleBoundaryButtonClick.bind(this));
    this.elements.finishDrawingButton.addEventListener('click', this._handleFinishDrawingClick.bind(this));
    this.elements.filterByAreaButton.addEventListener('click', this._handleFilterByAreaClick.bind(this));
    this.elements.resetMarkersButton.addEventListener('click', this._handleResetMarkersClick.bind(this));
    this.elements.exportButton.addEventListener('click', this._handleExportClick.bind(this));
  }

  updateMarkerModeButton(isActive) {
    this.elements.markerButton?.classList.toggle('active-green', isActive);
  }

  updateBoundaryModeButton(isActive) {
    this.elements.boundaryButton?.classList.toggle('active-green', isActive);
    if (this.elements.finishDrawingButton) this.elements.finishDrawingButton.style.display = isActive ? 'block' : 'none';
  }

  updateFollowingStatus(isFollowing) {
    this.elements.centerMapButton?.classList.toggle('active', isFollowing);
  }

  updateSignInStatus(isSignedIn, userInfo) {
    if (this.elements.userProfileContainer) {
      this.elements.userProfileContainer.style.display = isSignedIn && userInfo ? 'flex' : 'none';
    }
    if (isSignedIn && userInfo) {
      if (this.elements.userProfilePic) this.elements.userProfilePic.src = userInfo.picture;
      if (this.elements.userProfileName) this.elements.userProfileName.textContent = userInfo.name;
    }

    // ログイン状態に応じて機能ボタンの有効/無効を切り替える
    // 「現在地に戻る」ボタンは常に有効
    const buttonsToToggle = [
      this.elements.markerButton, this.elements.boundaryButton,
      this.elements.filterByAreaButton, this.elements.resetMarkersButton,
      this.elements.exportButton,
    ];
    buttonsToToggle.forEach(button => {
      // ログイン状態がUIに反映されない問題の回避策として、常にボタンを有効化する
      button.disabled = false;
    });
  }

  // --- プライベートなイベントハンドラ ---

  _handleCenterMapClick() {
    // mapControllerのメソッドを直接呼び出す
    this.mapController.centerMapToCurrentUser();
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
      showToast('利用可能な区域がありません。', 'info');
      return;
    }

    const result = await showModal('表示する区域番号をカンマ区切りで入力してください (例: 1,2,5)。\n空欄でOKを押すと絞り込みを解除します。', {
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
        showToast('入力された区域番号が見つかりませんでした。', 'warning');
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
    const result = await showModal('未訪問にする区域番号をカンマ区切りで入力してください (例: 1,2,5)。\n`all` と入力すると全区域が対象になります。', {
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
      showToast('対象の区域がありません。', 'info');
      return;
    }

    const boundaryLayers = selectedAreas
      .map(area => this.mapManager.getBoundaryLayerByArea(area))
      .filter(layer => layer !== null);

    if (boundaryLayers.length === 0) {
      showToast('有効な区域番号が見つかりませんでした。', 'warning');
      return;
    }

    const confirmed = await showModal(`区域「${selectedAreas.join(', ')}」内にあるすべての家を「未訪問」状態にしますか？\nこの操作は元に戻せません。`);
    if (confirmed) {
      try {
        await this.mapManager.resetMarkersInBoundaries(boundaryLayers);
        showToast(`区域「${selectedAreas.join(', ')}」内のマーカーをリセットしました。`, 'success');
      } catch (error) {
        showToast('マーカーのリセットに失敗しました。', 'error');
      }
    }
  }

  _handleExportClick() {
    console.log('[UI] エクスポートボタンがクリックされました。パネルを開きます。');
    this.exportPanel.open(
      () => this.mapManager.getAvailableAreaNumbers(),
      (filters) => this.mapManager.exportMarkersToCsv(filters)
    );
  }
}
