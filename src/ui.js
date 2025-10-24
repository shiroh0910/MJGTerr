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
    this.mapContainer = document.getElementById('map');
    this.adminCloseButton = document.getElementById('admin-close-button');
    this.adminPageContainer = document.getElementById('admin-page');
    this.controlsContainer = document.getElementById('controls-container');
    this.topBar = document.getElementById('top-bar');
    this.currentAddressDisplay = document.getElementById('current-address-display');
    this.appVersionDisplay = document.getElementById('app-version-display');
    // 管理者ページ内の要素
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadUsersButton = document.getElementById('load-users-button');
    this.userListContainer = document.getElementById('user-list-container');
    this.adminUsersTextarea = document.getElementById('admin-users-textarea');
    this.saveAdminsButton = document.getElementById('save-admins-button');
    this.restoreFileInput = document.getElementById('restore-file-input');
    this.restoreButton = document.getElementById('restore-button');
    this.announcementTextarea = document.getElementById('announcement-textarea');
    this.saveAnnouncementButton = document.getElementById('save-announcement-button');

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
      .marker-translucent {
        opacity: 0.8; /* 80%の不透明度。0.0 (透明) から 1.0 (不透明) の間で調整してください */
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
    this.loadUsersButton?.addEventListener('click', this._handleLoadUsersClick.bind(this));
    this.saveAdminsButton?.addEventListener('click', this._handleSaveAdminsClick.bind(this));
    this.restoreFileInput?.addEventListener('change', this._handleFileSelect.bind(this));
    this.restoreButton?.addEventListener('click', this._handleRestoreClick.bind(this));
    this.saveAnnouncementButton?.addEventListener('click', this._handleSaveAnnouncementClick.bind(this));
    this.adminCloseButton?.addEventListener('click', () => {
      // UIを直接操作するのではなく、URLのハッシュを変更して
      // hashchangeイベントを発火させることで、ルーティング機構に処理を委ねる
      window.location.hash = '/';
    });
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
    // ユーザープロファイルのバッジを常に非表示にする
    this.userProfileContainer.style.display = 'none';

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

    // 地図関連のUIを非表示にする
    if (this.topBar) this.topBar.style.display = 'none';
    if (this.currentAddressDisplay) this.currentAddressDisplay.style.display = 'none';
    if (this.adminPageLink) this.adminPageLink.style.display = 'none';
    if (this.appVersionDisplay) this.appVersionDisplay.style.display = 'none';

    // 管理者ページ表示時に現在の管理者リストを読み込む
    this._loadAdminUsersToTextarea();
    this._loadAnnouncementToTextarea();
  }

  /**
   * メインの地図ページを表示する
   */
  showMapPage() {
    this.mapContainer.style.display = 'block';
    this.adminPageContainer.style.display = 'none';

    // 地図関連のUIを表示に戻す
    if (this.topBar) this.topBar.style.display = 'flex';
    if (this.currentAddressDisplay) this.currentAddressDisplay.style.display = 'block';
    // 管理者の場合のみ管理者ページへのリンクを再表示
    if (this.adminPageLink && googleDriveService.isAdmin()) {
      this.adminPageLink.style.display = 'flex';
    }
    if (this.appVersionDisplay) this.appVersionDisplay.style.display = 'block';

    // 地図のサイズが変更された可能性があるため、再描画を促す
    if (this.mapManager && this.mapManager.map) this.mapManager.map.invalidateSize();
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

  async _handleLoadUsersClick() {
    this.toggleLoading(true, 'ユーザーリストを取得中...');
    try {
      const users = await googleDriveService.getAllUsers();
      this._renderUserList(users);
      showToast(`${users.length}人のユーザーが見つかりました。`, 'success');
    } catch (error) {
      showToast('ユーザーリストの取得に失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }

  _renderUserList(users) {
    if (!this.userListContainer) return;

    if (users.length === 0) {
      this.userListContainer.innerHTML = '<p>ユーザーが見つかりませんでした。</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'user-list-table';
    table.innerHTML = '<thead><tr><th>メールアドレス</th><th>最終利用日時</th></tr></thead>';
    const tbody = document.createElement('tbody');

    users.forEach(user => {
      const tr = document.createElement('tr');
      tr.dataset.email = user.email; // クリック時にメールアドレスを特定するため
      tr.innerHTML = `<td>${user.email}</td><td>${user.lastLogin}</td>`;
      tr.addEventListener('click', (e) => this._handleUserClick(e));
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    this.userListContainer.innerHTML = ''; // コンテナをクリア
    this.userListContainer.appendChild(table);
  }

  async _handleUserClick(event) {
    const email = event.currentTarget.dataset.email;
    if (!email) return;

    const filename = `${USER_SETTINGS_PREFIX}${email.replace(/[@.]/g, '_')}.json`;
    this.toggleLoading(true, '設定ファイルを取得中...');
    try {
      const files = await googleDriveService.loadByPrefix(filename);
      if (files.length > 0) {
        const settingsContent = `<pre>${JSON.stringify(files[0].data, null, 2)}</pre>`;
        showModal(settingsContent, { type: 'alert' });
      } else {
        showToast('設定ファイルが見つかりませんでした。', 'warning');
      }
    } catch (error) {
      showToast('設定ファイルの取得に失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }

  async _loadAdminUsersToTextarea() {
    if (!this.adminUsersTextarea) return;
    this.toggleLoading(true, '管理者リストを読み込み中...');
    try {
      const adminFiles = await googleDriveService.loadByPrefix(`${ADMIN_USERS_FILENAME}.json`);
      if (adminFiles.length > 0 && Array.isArray(adminFiles[0].data.admins)) {
        this.adminUsersTextarea.value = adminFiles[0].data.admins.join('\n');
      } else {
        this.adminUsersTextarea.value = ''; // ファイルがない場合は空にする
      }
    } catch (error) {
      showToast('管理者リストの読み込みに失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }

  async _handleSaveAdminsClick() {
    if (!this.adminUsersTextarea) return;

    const confirmed = await showModal('管理者リストを保存しますか？<br>この操作により、一部のユーザーの権限が変更される可能性があります。');
    if (!confirmed) return;

    const emails = this.adminUsersTextarea.value
      .split('\n')
      .map(email => email.trim())
      .filter(email => email.length > 0);

    const dataToSave = { admins: emails };

    this.toggleLoading(true, '管理者リストを保存中...');
    try {
      await googleDriveService.save(ADMIN_USERS_FILENAME, dataToSave);
      await googleDriveService.reloadAdminUsers(); // 保存後、アプリ内の権限情報を更新
      showToast('管理者リストを保存しました。', 'success');
    } catch (error) {
      showToast('管理者リストの保存に失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }

  _handleFileSelect(event) {
    if (!this.restoreButton) return;
    // ファイルが選択されていれば復元ボタンを有効化、されていなければ無効化
    this.restoreButton.disabled = !event.target.files || event.target.files.length === 0;
  }

  async _handleRestoreClick() {
    if (!this.restoreFileInput || !this.restoreFileInput.files || this.restoreFileInput.files.length === 0) {
      showToast('復元するファイルを選択してください。', 'warning');
      return;
    }
    await this.mapManager.restoreAllData(this.restoreFileInput.files[0]);
  }

  async _loadAnnouncementToTextarea() {
    if (!this.announcementTextarea) return;
    this.toggleLoading(true, 'お知らせを読み込み中...');
    try {
      const files = await googleDriveService.loadByPrefix(`${ANNOUNCEMENTS_FILENAME}.json`);
      if (files.length > 0 && files[0].data.content) {
        this.announcementTextarea.value = files[0].data.content;
      } else {
        this.announcementTextarea.value = '';
      }
    } catch (error) {
      showToast('お知らせの読み込みに失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }

  async _handleSaveAnnouncementClick() {
    if (!this.announcementTextarea) return;

    const confirmed = await showModal('お知らせを全ユーザーに通知しますか？');
    if (!confirmed) return;

    const content = this.announcementTextarea.value.trim();
    const dataToSave = {
      // IDとして現在時刻のISO文字列を使用し、更新のたびに新しいIDを付与
      id: new Date().toISOString(),
      content: content,
    };

    this.toggleLoading(true, 'お知らせを保存中...');
    try {
      await googleDriveService.save(ANNOUNCEMENTS_FILENAME, dataToSave);
      showToast('お知らせを保存しました。', 'success');
    } catch (error) {
      showToast('お知らせの保存に失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }
}
