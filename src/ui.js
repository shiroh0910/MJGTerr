import { showModal, showToast } from './utils.js';

export class UIManager {
  constructor() {
    // UI要素の参照
    this.markerButton = document.getElementById('edit-mode-button');
    this.boundaryButton = document.getElementById('boundary-draw-button');
    this.finishDrawingButton = document.getElementById('finish-drawing-button');
    this.centerMapButton = document.getElementById('center-map-button');
    this.signInButtonContainer = document.getElementById('sign-in-button-container');
    this.signOutButton = document.getElementById('sign-out-button');
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
  }

  /**
   * UIイベントリスナーを初期化し、各マネージャーと連携させる
   * @param {import('./map-manager.js').MapManager} mapManager
   * @param {object} mapController - { centerMapToCurrentUser }
   * @param {object} authController - { handleSignIn, handleSignOut }
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

    this.centerMapButton.addEventListener('click', this.mapController.centerMapToCurrentUser);
    this.signOutButton.addEventListener('click', this.authController.handleSignOut);
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
    this.signInButtonContainer.style.display = isSignedIn ? 'none' : 'block';
    this.signOutButton.style.display = isSignedIn ? 'block' : 'none';
    this.userProfileContainer.style.display = isSignedIn && userInfo ? 'flex' : 'none';
    if (isSignedIn && userInfo) {
      this.userProfilePic.src = userInfo.picture;
      this.userProfileName.textContent = userInfo.name;
    }

    // ログイン状態に応じて機能ボタンの有効/無効を切り替える
    const buttonsToToggle = [
      this.markerButton, this.boundaryButton, this.filterByAreaButton, this.resetMarkersButton
    ];
    buttonsToToggle.forEach(button => {
      button.disabled = !isSignedIn;
    });
  }

  // --- プライベートなイベントハンドラ ---

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
    const areaNumber = await showModal('絞り込む区域番号を入力してください (空欄で解除):', { type: 'prompt', defaultValue: '' });
    if (areaNumber === null) return;

    if (areaNumber) {
      const boundaryLayer = this.mapManager.getBoundaryLayerByArea(areaNumber);
      if (boundaryLayer) {
        this.mapManager.map.fitBounds(boundaryLayer.getBounds());
        this.mapManager.filterBoundariesByArea(areaNumber);
        this.mapManager.filterMarkersByPolygon(boundaryLayer);
      } else {
        showToast(`区域番号「${areaNumber}」は見つかりませんでした。`, 'error');
      }
    } else {
      this.mapManager.filterBoundariesByArea(null);
      this.mapManager.filterMarkersByPolygon(null);
    }
  }

  async _handleResetMarkersClick() {
    const areaNumber = await showModal('未訪問にする区域番号を入力してください:', { type: 'prompt' });
    if (areaNumber === null || areaNumber === '') return;

    const boundaryLayer = this.mapManager.getBoundaryLayerByArea(areaNumber);
    if (!boundaryLayer) {
      showToast(`区域番号「${areaNumber}」は見つかりませんでした。`, 'error');
      return;
    }

    const confirmed = await showModal(`区域「${areaNumber}」内にあるすべての家を「未訪問」状態にしますか？\nこの操作は元に戻せません。`);
    if (confirmed) {
      try {
        await this.mapManager.resetMarkersInPolygon(boundaryLayer);
        showToast(`区域「${areaNumber}」内のマーカーをリセットしました。`, 'success');
      } catch (error) {
        console.error('マーカーのリセット中にエラーが発生しました:', error);
        showToast('マーカーのリセットに失敗しました。', 'error');
      }
    }
  }
}
