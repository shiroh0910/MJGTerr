import { showModal, showToast } from './utils.js';

export class UIManager {
  constructor() {
    // UI要素の参照
    this.markerButton = document.getElementById('edit-mode-button');
    this.boundaryButton = document.getElementById('boundary-draw-button');
    this.finishDrawingButton = document.getElementById('finish-drawing-button');
    this.centerMapButton = document.getElementById('center-map-button');
    this.signInButton = document.getElementById('sign-in-button');
    this.signOutButton = document.getElementById('sign-out-button');
    this.filterByAreaButton = document.getElementById('filter-by-area-button');
    this.resetMarkersButton = document.getElementById('reset-markers-in-area-button');
    this.userProfileContainer = document.getElementById('user-profile-container');
    this.userProfilePic = document.getElementById('user-profile-pic');
    this.userProfileName = document.getElementById('user-profile-name');
    this.syncStatusContainer = document.getElementById('sync-status-container');
    this.syncStatusIcon = document.getElementById('sync-status-icon');
    this.syncStatusText = document.getElementById('sync-status-text');
  }

  /**
   * UIイベントリスナーを初期化し、各マネージャーと連携させる
   * @param {import('./map-manager.js').MapManager} mapManager
   * @param {object} mapController - { centerMapToCurrentUser }
   * @param {object} authController - { handleSignIn, handleSignOut }
   */
  initializeEventListeners(mapManager, mapController, authController) {
    this.markerButton.addEventListener('click', () => {
      const isActive = mapManager.toggleMarkerEditMode();
      this.updateMarkerModeButton(isActive);
      this.updateBoundaryModeButton(mapManager.isBoundaryDrawMode); // 連動してOFFになる場合があるため
    });

    this.boundaryButton.addEventListener('click', () => {
      const isActive = mapManager.toggleBoundaryDrawMode();
      this.updateBoundaryModeButton(isActive);
      this.updateMarkerModeButton(mapManager.isMarkerEditMode); // 連動してOFFになる場合があるため
    });

    this.finishDrawingButton.addEventListener('click', async () => {
      const success = await mapManager.finishDrawing();
      if (success) {
        const isActive = mapManager.toggleBoundaryDrawMode(); // モードをOFFに切り替え
        this.updateBoundaryModeButton(isActive);
      }
    });

    this.filterByAreaButton.addEventListener('click', async () => {
      const areaNumber = await showModal('絞り込む区域番号を入力してください (空欄で解除):', { type: 'prompt', defaultValue: '' });
      if (areaNumber === null) return;

      if (areaNumber) {
        const boundaryLayer = mapManager.getBoundaryLayerByArea(areaNumber);
        if (boundaryLayer) {
          mapManager.map.fitBounds(boundaryLayer.getBounds());
          mapManager.filterBoundariesByArea(areaNumber);
          mapManager.filterMarkersByPolygon(boundaryLayer);
        } else {
          showToast(`区域番号「${areaNumber}」は見つかりませんでした。`, 'error');
        }
      } else {
        mapManager.filterBoundariesByArea(null);
        mapManager.filterMarkersByPolygon(null);
      }
    });

    this.resetMarkersButton.addEventListener('click', async () => {
      const areaNumber = await showModal('未訪問にする区域番号を入力してください:', { type: 'prompt' });
      if (areaNumber === null || areaNumber === '') return;

      const boundaryLayer = mapManager.getBoundaryLayerByArea(areaNumber);
      if (!boundaryLayer) {
        showToast(`区域番号「${areaNumber}」は見つかりませんでした。`, 'error');
        return;
      }

      const confirmed = await showModal(`区域「${areaNumber}」内にあるすべての家を「未訪問」状態にしますか？\nこの操作は元に戻せません。`);
      if (confirmed) {
        try {
          await mapManager.resetMarkersInPolygon(boundaryLayer);
          showToast(`区域「${areaNumber}」内のマーカーをリセットしました。`, 'success');
        } catch (error) {
          console.error('マーカーのリセット中にエラーが発生しました:', error);
          showToast('マーカーのリセットに失敗しました。', 'error');
        }
      }
    });

    this.centerMapButton.addEventListener('click', mapController.centerMapToCurrentUser);
    this.signInButton.addEventListener('click', authController.handleSignIn);
    this.signOutButton.addEventListener('click', authController.handleSignOut);
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
    this.signInButton.style.display = isSignedIn ? 'none' : 'block';
    this.userProfileContainer.style.display = isSignedIn && userInfo ? 'flex' : 'none';
    if (isSignedIn && userInfo) {
      this.userProfilePic.src = userInfo.picture;
      this.userProfileName.textContent = userInfo.name;
    }
  }

  /**
   * 同期ステータスUIを更新する
   * @param {'syncing' | 'synced' | 'error' | 'offline'} status
   * @param {string} [message]
   */
  updateSyncStatus(status, message = '') {
    if (!this.syncStatusContainer) return;

    this.syncStatusContainer.style.display = 'flex';
    this.syncStatusIcon.className = 'fa-solid'; // Reset classes

    switch (status) {
      case 'syncing':
        this.syncStatusIcon.classList.add('fa-arrows-rotate', 'fa-spin');
        this.syncStatusText.textContent = message || '同期中...';
        break;
      case 'synced':
        this.syncStatusIcon.classList.add('fa-check');
        this.syncStatusText.textContent = message || '同期完了';
        // 少し経ってから非表示にする
        setTimeout(() => { this.syncStatusContainer.style.display = 'none'; }, 2000);
        break;
      case 'error':
        this.syncStatusIcon.classList.add('fa-triangle-exclamation');
        this.syncStatusText.textContent = message || '同期エラー';
        break;
      case 'offline':
        this.syncStatusIcon.classList.add('fa-cloud-arrow-up');
        this.syncStatusText.textContent = message || 'オフライン';
        break;
    }
  }
}
