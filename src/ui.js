import { showModal, showToast } from './utils.js';

export class UIManager {
  constructor() {
    // UI要素の参照
    this.markerButton = document.getElementById('edit-mode-button');
    this.boundaryButton = document.getElementById('boundary-draw-button');
    this.finishDrawingButton = document.getElementById('finish-drawing-button');
    this.centerMapButton = document.getElementById('center-map-button');
    this.filterByAreaButton = document.getElementById('filter-by-area-button');
    this.resetMarkersButton = document.getElementById('reset-markers-in-area-button');
    this.userProfileContainer = document.getElementById('user-profile-container');
    this.userProfilePic = document.getElementById('user-profile-pic');
    this.userProfileName = document.getElementById('user-profile-name');

    // 各コントローラー/マネージャーを保持するプロパティ
    this.mapManager = null;
    this.mapController = null;
    this.authController = null;

    // 初期状態では編集関連のボタンをすべて無効化しておく
    this.updateSignInStatus(false, null);

    // このボタンは他のマネージャーに依存しないため、ここで設定
    this.centerMapButton?.addEventListener('click', () => this._handleCenterMapClick());
  }

  /**
   * UIイベントリスナーを初期化し、各マネージャーと連携させる
   * @param {import('./map-manager.js').MapManager} mapManager
   * @param {{ centerMapToCurrentUser: () => void }} mapController
   * @param {import('./auth.js').AuthController} authController
   */
  initializeEventListeners(mapManager, mapController, authController) {
    this.mapManager = mapManager;
    this.mapController = mapController;
    this.authController = authController;

    this.markerButton.addEventListener('click', this._handleMarkerButtonClick.bind(this));
    this.boundaryButton.addEventListener('click', this._handleBoundaryButtonClick.bind(this));
    this.finishDrawingButton.addEventListener('click', this._handleFinishDrawingClick.bind(this));
    this.filterByAreaButton.addEventListener('click', this._handleFilterByAreaClick.bind(this));
    this.resetMarkersButton.addEventListener('click', this._handleResetMarkersClick.bind(this));
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

  updateSignInStatus(isSignedIn, userInfo) {
    this.userProfileContainer.style.display = isSignedIn && userInfo ? 'flex' : 'none';
    if (isSignedIn && userInfo) {
      this.userProfilePic.src = userInfo.picture;
      this.userProfileName.textContent = userInfo.name;
    }

    // ログイン状態に応じて機能ボタンの有効/無効を切り替える
    // 「現在地に戻る」ボタンは常に有効
    const buttonsToToggle = [
      this.markerButton,
      this.boundaryButton,
      this.filterByAreaButton,
      this.resetMarkersButton,
    ];
    buttonsToToggle.forEach(button => {
      // ログイン状態がUIに反映されない問題の回避策として、常にボタンを有効化する
      if (button) button.disabled = false;
    });
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
}
