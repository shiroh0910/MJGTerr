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
    this.themeToggleButton = document.getElementById('theme-toggle-button');

    // 各コントローラー/マネージャーを保持するプロパティ
    this.mapManager = null;
    this.mapController = null;
    this.authController = null;
    this.themeController = null; // テーマ変更を通知するためのコントローラ

    // 初期状態では編集関連のボタンをすべて無効化しておく
    this.updateSignInStatus(false, null);

    // このボタンは他のマネージャーに依存しないため、ここで設定
    this.centerMapButton.addEventListener('click', () => this._handleCenterMapClick());

    // テーマの初期化
    this._initializeTheme();
  }

  /**
   * UIイベントリスナーを初期化し、各マネージャーと連携させる
   * @param {import('./map-manager.js').MapManager} mapManager
   * @param {{ centerMapToCurrentUser: () => void }} mapController
   * @param {import('./auth.js').AuthController} authController
   * @param {{ onThemeChange: (theme: 'light' | 'dark') => void }} themeController
   */
  initializeEventListeners(mapManager, mapController, authController, themeController) {
    this.mapManager = mapManager;
    this.mapController = mapController;
    this.authController = authController;
    this.themeController = themeController;

    this.markerButton.addEventListener('click', this._handleMarkerButtonClick.bind(this));
    this.boundaryButton.addEventListener('click', this._handleBoundaryButtonClick.bind(this));
    this.finishDrawingButton.addEventListener('click', this._handleFinishDrawingClick.bind(this));
    this.filterByAreaButton.addEventListener('click', this._handleFilterByAreaClick.bind(this));
    this.resetMarkersButton.addEventListener('click', this._handleResetMarkersClick.bind(this));
    this.themeToggleButton.addEventListener('click', this._handleThemeToggleClick.bind(this));
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
      this.resetMarkersButton
    ];
    buttonsToToggle.forEach(button => {
      // ログイン状態がUIに反映されない問題の回避策として、常にボタンを有効化する
      button.disabled = false;
    });
  }

  // --- プライベートなイベントハンドラ ---

  _initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
      this._applyTheme(savedTheme);
    } else {
      this._applyTheme(prefersDark ? 'dark' : 'light');
    }

    // OSのテーマ変更を監視
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      // ユーザーが手動でテーマを設定していない場合のみ、OSに追従する
      if (!localStorage.getItem('theme')) {
        this._applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  _handleThemeToggleClick() {
    const currentTheme = document.body.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme); // ユーザーの選択を保存
    this._applyTheme(newTheme);
  }

  _applyTheme(theme) {
    document.body.dataset.theme = theme;
    const icon = this.themeToggleButton.querySelector('i');
    icon.classList.toggle('fa-sun', theme === 'light');
    icon.classList.toggle('fa-moon', theme === 'dark');
    this.themeController?.onThemeChange(theme);
  }

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
