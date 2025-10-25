import { googleDriveService } from './google-drive-service.js';
import { showModal, showToast } from './utils.js';
import { USER_SETTINGS_PREFIX, ADMIN_USERS_FILENAME, ANNOUNCEMENTS_FILENAME, APP_SETTINGS_FILENAME, DEFAULT_VISIT_STATUSES } from './constants.js';

/**
 * 管理者ページのUI要素とイベントハンドラを管理するクラス
 */
class AdminUIManager {
  constructor() {
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadUsersButton = document.getElementById('load-users-button');
    this.userListContainer = document.getElementById('user-list-container');
    this.adminUsersTextarea = document.getElementById('admin-users-textarea');
    this.saveAdminsButton = document.getElementById('save-admins-button');
    this.restoreFileInput = document.getElementById('restore-file-input');
    this.restoreButton = document.getElementById('restore-button');
    this.announcementTextarea = document.getElementById('announcement-textarea');
    this.saveAnnouncementButton = document.getElementById('save-announcement-button');
    this.markerOpacityInput = document.getElementById('marker-opacity-input');
    this.markerSizeInput = document.getElementById('marker-size-input');
    this.saveMarkerSettingsButton = document.getElementById('save-marker-settings-button');
    this.statusSettingsContainer = document.getElementById('status-settings-container');
    this.addStatusButton = document.getElementById('add-status-button');
    this.saveStatusSettingsButton = document.getElementById('save-status-settings-button');
  }

  toggleLoading(show, text = '読み込み中...') {
    if (!this.loadingOverlay) return;
    const loadingText = this.loadingOverlay.querySelector('#loading-text');
    if (loadingText) loadingText.textContent = text;
    this.loadingOverlay.style.display = show ? 'flex' : 'none';
  }

  async handleLoadUsersClick() {
    this.toggleLoading(true, 'ユーザーリストを取得中...');
    try {
      const users = await googleDriveService.getAllUsers();
      this.renderUserList(users);
      showToast(`${users.length}人のユーザーが見つかりました。`, 'success');
    } catch (error) {
      showToast('ユーザーリストの取得に失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }

  renderUserList(users) {
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
      tr.innerHTML = `<td>${user.email}</td><td>${user.lastLogin}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    this.userListContainer.innerHTML = '';
    this.userListContainer.appendChild(table);
  }

  async loadAdminUsersToTextarea() {
    if (!this.adminUsersTextarea) return;
    this.toggleLoading(true, '管理者リストを読み込み中...');
    try {
      const adminFiles = await googleDriveService.loadByPrefix(`${ADMIN_USERS_FILENAME}.json`);
      if (adminFiles.length > 0 && Array.isArray(adminFiles[0].data.admins)) {
        this.adminUsersTextarea.value = adminFiles[0].data.admins.join('\n');
      } else {
        this.adminUsersTextarea.value = '';
      }
    } catch (error) {
      showToast('管理者リストの読み込みに失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }

  async handleSaveAdminsClick() {
    if (!this.adminUsersTextarea) return;
    const confirmed = await showModal('管理者リストを保存しますか？<br>この操作により、一部のユーザーの権限が変更される可能性があります。');
    if (!confirmed) return;

    const emails = this.adminUsersTextarea.value.split('\n').map(email => email.trim()).filter(email => email.length > 0);
    const dataToSave = { admins: emails };

    this.toggleLoading(true, '管理者リストを保存中...');
    try {
      await googleDriveService.save(ADMIN_USERS_FILENAME, dataToSave);
      await googleDriveService.reloadAdminUsers();
      showToast('管理者リストを保存しました。', 'success');
    } catch (error) {
      showToast('管理者リストの保存に失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }

  async loadAnnouncementToTextarea() {
    if (!this.announcementTextarea) return;
    this.toggleLoading(true, 'お知らせを読み込み中...');
    try {
      const files = await googleDriveService.loadByPrefix(ANNOUNCEMENTS_FILENAME);
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

  async handleSaveAnnouncementClick() {
    if (!this.announcementTextarea) return;
    const confirmed = await showModal('お知らせを全ユーザーに通知しますか？');
    if (!confirmed) return;

    const content = this.announcementTextarea.value.trim();
    const dataToSave = { id: new Date().toISOString(), content: content };

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

  handleFileSelect(event) {
    if (!this.restoreButton) return;
    this.restoreButton.disabled = !event.target.files || event.target.files.length === 0;
  }

  async handleRestoreClick() {
    if (!this.restoreFileInput || !this.restoreFileInput.files || this.restoreFileInput.files.length === 0) {
      return showToast('復元するファイルを選択してください。', 'warning');
    }
    const zipFile = this.restoreFileInput.files[0];
    const confirmed = await showModal('本当にデータを復元しますか？<br>現在のGoogle Drive上のデータはすべて上書きされます。この操作は元に戻せません。');
    if (!confirmed) return;

    this.toggleLoading(true, 'ZIPファイルを解凍中...');
    try {
      const zip = await window.JSZip.loadAsync(zipFile);
      const filesToUpload = [];
      zip.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir && relativePath.endsWith('.json')) {
          filesToUpload.push(async () => {
            const content = await zipEntry.async('string');
            const data = JSON.parse(content);
            const filename = relativePath.replace('.json', '');
            await googleDriveService.save(filename, data);
          });
        }
      });

      const totalFiles = filesToUpload.length;
      let uploadedCount = 0;
      const concurrencyLimit = 5;

      const executeUploads = async (tasks) => {
        const promises = tasks.map(task => task().then(() => {
          uploadedCount++;
          this.toggleLoading(true, `ファイルをアップロード中... (${uploadedCount}/${totalFiles})`);
        }));
        await Promise.all(promises);
      };

      this.toggleLoading(true, `ファイルをアップロード中... (0/${totalFiles})`);
      for (let i = 0; i < totalFiles; i += concurrencyLimit) {
        const chunk = filesToUpload.slice(i, i + concurrencyLimit);
        await executeUploads(chunk);
      }

      await showModal('データの復元が完了しました。ページをリロードします。', { type: 'alert' });
      window.location.reload();
    } catch (error) {
      showToast('データの復元に失敗しました。', 'error');
      console.error('復元処理エラー:', error);
      this.toggleLoading(false);
    }
  }
}

/**
 * 管理者ページ専用のロジックを管理するクラス
 */
class AdminApp {
  constructor() {
    this.uiManager = new AdminUIManager();
    this.appSettings = {};

    // 認証状態の変更を監視
    document.addEventListener('auth-status-change', (e) => {
      this._handleAuthStatusChange(e.detail.isSignedIn, e.detail.userInfo);
    });

    // Google Drive Serviceの初期化
    googleDriveService.initialize();
  }

  /**
   * 認証状態の変更をハンドリングする
   * @param {boolean} isSignedIn
   * @param {object|null} userInfo
   * @private
   */
  _handleAuthStatusChange(isSignedIn, userInfo) {
    if (isSignedIn && googleDriveService.isAdmin()) {
      // ログイン済みかつ管理者の場合、イベントリスナーをセットアップ
      this._setupEventListeners();
      // ページ読み込み時に各種データをロード
      this._loadInitialData();
    } else if (isSignedIn) {
      // 管理者でない場合は地図ページにリダイレクト
      showToast('管理者権限がありません。', 'warning');
      setTimeout(() => window.location.href = '/', 2000);
    } else {
      // 未ログインの場合はログインを促す
      this.uiManager.toggleLoading(false);
      showModal('管理者ページにアクセスするには、Googleアカウントでログインしてください。', { type: 'alert' })
        .then(() => {
          window.location.href = '/'; // OKを押したら地図ページに戻る
        });
    }
  }

  /**
   * 管理者ページのイベントリスナーをセットアップする
   * @private
   */
  _setupEventListeners() {
    this.uiManager.loadUsersButton?.addEventListener('click', () => this.uiManager.handleLoadUsersClick());
    this.uiManager.saveAdminsButton?.addEventListener('click', () => this.uiManager.handleSaveAdminsClick());
    this.uiManager.restoreFileInput?.addEventListener('change', (e) => this.uiManager.handleFileSelect(e));
    this.uiManager.restoreButton?.addEventListener('click', () => this.uiManager.handleRestoreClick());
    this.uiManager.saveAnnouncementButton?.addEventListener('click', () => this.uiManager.handleSaveAnnouncementClick());
    this.uiManager.saveMarkerSettingsButton?.addEventListener('click', () => this._handleSaveMarkerSettingsClick());
    this.uiManager.addStatusButton?.addEventListener('click', () => this._addStatusSettingRow());
    this.uiManager.saveStatusSettingsButton?.addEventListener('click', () => this._handleSaveStatusSettingsClick());
  }

  /**
   * ページ読み込み時に必要なデータをロードする
   * @private
   */
  async _loadInitialData() {
    this.uiManager.toggleLoading(true, '管理者データを読み込み中...');
    try {
      // アプリ共通設定を読み込む（ステータス設定などに必要）
      await this._loadAppSettings();

      // 各セクションのデータを読み込む
      await Promise.all([
        this.uiManager.loadAdminUsersToTextarea(),
        this.uiManager.loadAnnouncementToTextarea(),
        this._loadMarkerSettingsToInputs(),
        this._loadStatusSettingsToAdminPage()
      ]);
    } catch (error) {
      console.error("管理者データの読み込みに失敗しました:", error);
      showToast("管理者データの読み込みに失敗しました。", "error");
    } finally {
      this.uiManager.toggleLoading(false);
    }
  }

  async _loadAppSettings() {
    try {
      const files = await googleDriveService.loadByPrefix(`${APP_SETTINGS_FILENAME}.json`);
      this.appSettings = files.length > 0 ? files[0].data : {};
    } catch (error) {
      console.error('アプリ共通設定の読み込みに失敗:', error);
      this.appSettings = {};
    }
  }

  async _saveAppSettings(settings) {
    this.uiManager.toggleLoading(true, '設定を保存中...');
    this.appSettings = { ...this.appSettings, ...settings };
    await googleDriveService.save(APP_SETTINGS_FILENAME, this.appSettings);
    this.uiManager.toggleLoading(false);
  }

  _loadMarkerSettingsToInputs() {
    if (!this.uiManager.markerOpacityInput || !this.uiManager.markerSizeInput) return;
    this.uiManager.markerOpacityInput.value = this.appSettings.markerOpacity || 0.8;
    this.uiManager.markerSizeInput.value = this.appSettings.markerSize || 30;
  }

  async _handleSaveMarkerSettingsClick() {
    const opacity = parseFloat(this.uiManager.markerOpacityInput.value);
    const size = parseInt(this.uiManager.markerSizeInput.value, 10);

    if (isNaN(opacity) || opacity < 0.1 || opacity > 1.0) {
      return showToast('不透明度は0.1から1.0の間で設定してください。', 'warning');
    }
    if (isNaN(size) || size < 10 || size > 50) {
      return showToast('サイズは10から50の間で設定してください。', 'warning');
    }

    await this._saveAppSettings({ markerOpacity: opacity, markerSize: size });
    showToast('マーカー設定を保存しました。', 'success');
  }

  _loadStatusSettingsToAdminPage() {
    if (!this.uiManager.statusSettingsContainer) return;
    const statuses = this.appSettings.visitStatuses || DEFAULT_VISIT_STATUSES;
    this.uiManager.statusSettingsContainer.innerHTML = '';
    statuses.forEach((status, index) => this._addStatusSettingRow(status, index));
    this._setupStatusDragAndDrop();
  }

  _addStatusSettingRow(status = { name: '', icon: 'fa-question', color: '#808080' }, index = -1) {
    const isFixed = status.isFixed || false;
    const row = document.createElement('div');
    row.className = 'admin-setting-item status-setting-row';
    row.dataset.index = index;
    row.draggable = !isFixed;
    row.innerHTML = `
      <i class="fa-solid fa-grip-vertical status-drag-handle" ${isFixed ? 'style="visibility: hidden;"' : ''}></i>
      <input type="text" class="status-name-input" value="${status.name}" placeholder="ステータス名" ${isFixed ? 'disabled' : ''}>
      <input type="text" class="status-icon-input" value="${status.icon}" placeholder="fa-icon-name">
      <input type="color" class="status-color-input" value="${status.color}">
      <button class="status-delete-button" ${isFixed ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button>
    `;
    this.uiManager.statusSettingsContainer.appendChild(row);
    row.querySelector('.status-delete-button').addEventListener('click', () => {
      if (!isFixed) row.remove();
    });
  }

  _setupStatusDragAndDrop() {
    let dragSrcElement = null;
    this.uiManager.statusSettingsContainer.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('status-setting-row')) {
        dragSrcElement = e.target;
        e.dataTransfer.effectAllowed = 'move';
        e.target.classList.add('dragging');
      }
    });
    this.uiManager.statusSettingsContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      const target = e.target.closest('.status-setting-row');
      if (target && dragSrcElement && target !== dragSrcElement) {
        const rect = target.getBoundingClientRect();
        const isAfter = e.clientY > rect.top + rect.height / 2;
        target.parentNode.insertBefore(dragSrcElement, isAfter ? target.nextSibling : target);
      }
    });
    this.uiManager.statusSettingsContainer.addEventListener('dragend', () => {
      dragSrcElement?.classList.remove('dragging');
      dragSrcElement = null;
    });
  }

  async _handleSaveStatusSettingsClick() {
    const newStatuses = Array.from(this.uiManager.statusSettingsContainer.querySelectorAll('.status-setting-row')).map(row => {
      const name = row.querySelector('.status-name-input').value.trim();
      const icon = row.querySelector('.status-icon-input').value.trim();
      const color = row.querySelector('.status-color-input').value;
      const isFixed = row.querySelector('.status-name-input').disabled;
      return { name, icon, color, isFixed };
    }).filter(s => s.name);

    if (newStatuses.length === 0) {
      return showToast('少なくとも1つのステータスが必要です。', 'warning');
    }

    await this._saveAppSettings({ visitStatuses: newStatuses });
    showToast('ステータス設定を保存しました。', 'success');
  }
}

// Google Identity Services がロードされたらアプリを起動する
window.onGsiLoad = function() {
  new AdminApp();
};