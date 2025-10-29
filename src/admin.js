import { googleDriveService } from './google-drive-service.js';
import { showModal, showToast } from './utils.js';
import { USER_SETTINGS_PREFIX, ADMIN_USERS_FILENAME, ANNOUNCEMENTS_FILENAME, APP_SETTINGS_FILENAME, DEFAULT_VISIT_STATUSES, REPORT_PREFIX } from './constants.js';

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
    this.archiveReportsButton = document.getElementById('archive-reports-button');
    this.unarchiveReportsButton = document.getElementById('unarchive-reports-button');
    this.loadReportsButton = document.getElementById('load-reports-button');
    this.reportListContainer = document.getElementById('report-list-container');
    this.showArchivedCheckbox = document.getElementById('show-archived-reports-checkbox');
    this.adminContent = document.querySelector('.admin-content');
    this.allReports = []; // 全てのレポートを保持する
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

  async handleLoadReportsClick() {
    this.toggleLoading(true, 'レポートを取得中...');
    try {
      const reportFiles = await googleDriveService.loadByPrefix(REPORT_PREFIX);
      // ファイル名を含めてデータを保持し、新しい順にソート
      this.allReports = reportFiles
        .map(file => ({ ...file.data, fileName: file.name }))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      this.renderReportList();
      showToast(`${this.allReports.length}件のレポートが見つかりました。`, 'success');
    } catch (error) {
      showToast('レポートの取得に失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }
  
  async handleArchiveReportsClick() {
    const selectedCheckboxes = this.reportListContainer.querySelectorAll('input[type="checkbox"]:checked');
    if (selectedCheckboxes.length === 0) {
      return showToast('対応済みにするレポートを選択してください。', 'warning');
    }

    const confirmed = await showModal(`${selectedCheckboxes.length}件のレポートを対応済みにしますか？`);
    if (!confirmed) return;

    this.toggleLoading(true, 'レポートを更新中...');
    try {
      const updatePromises = Array.from(selectedCheckboxes).map(async (checkbox) => {
        const fileName = checkbox.dataset.filename;
        const reportToUpdate = this.allReports.find(r => r.fileName === fileName);
        if (reportToUpdate) {
          // ファイル名(.json)を除いた部分をsaveのキーとして渡す
          const saveKey = fileName.replace('.json', '');
          const updatedData = { ...reportToUpdate, status: 'archived' };
          // fileNameプロパティは保存しない
          delete updatedData.fileName;
          await googleDriveService.save(saveKey, updatedData);
        }
      });

      await Promise.all(updatePromises);
      showToast('レポートを対応済みにしました。', 'success');
      // リストを再読み込み
      await this.handleLoadReportsClick();
    } catch (error) {
      showToast('レポートの更新に失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }

  async handleUnarchiveReportsClick() {
    const selectedCheckboxes = this.reportListContainer.querySelectorAll('input[type="checkbox"]:checked');
    if (selectedCheckboxes.length === 0) {
      return showToast('未対応に戻すレポートを選択してください。', 'warning');
    }

    const confirmed = await showModal(`${selectedCheckboxes.length}件のレポートを未対応に戻しますか？`);
    if (!confirmed) return;

    this.toggleLoading(true, 'レポートを更新中...');
    try {
      const updatePromises = Array.from(selectedCheckboxes).map(async (checkbox) => {
        const fileName = checkbox.dataset.filename;
        const reportToUpdate = this.allReports.find(r => r.fileName === fileName);
        if (reportToUpdate) {
          const saveKey = fileName.replace('.json', '');
          const updatedData = { ...reportToUpdate, status: 'open' };
          delete updatedData.fileName;
          await googleDriveService.save(saveKey, updatedData);
        }
      });

      await Promise.all(updatePromises);
      showToast('レポートを未対応に戻しました。', 'success');
      await this.handleLoadReportsClick();
    } catch (error) {
      showToast('レポートの更新に失敗しました。', 'error');
    } finally {
      this.toggleLoading(false);
    }
  }

  renderReportList() {
    if (!this.reportListContainer) return;

    const showArchived = this.showArchivedCheckbox.checked;
    const filteredReports = this.allReports.filter(report => showArchived || report.status !== 'archived');

    if (filteredReports.length === 0) {
      this.reportListContainer.innerHTML = '<p>レポートはありません。</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'report-list-table';
    table.innerHTML = '<thead><tr><th><input type="checkbox" id="select-all-reports"></th><th>報告日時</th><th>報告者</th><th>種類</th><th>内容</th></tr></thead>';
    const tbody = document.createElement('tbody');

    filteredReports.forEach(report => {
      const tr = document.createElement('tr');
      if (report.status === 'archived') {
        tr.classList.add('report-archived');
      }
      const timestamp = new Date(report.timestamp).toLocaleString('ja-JP');
      // 内容の改行を <br> に変換して表示
      const contentHtml = report.content.replace(/\n/g, '<br>');

      tr.innerHTML = `
        <td><input type="checkbox" class="report-checkbox" data-filename="${report.fileName}"></td>
        <td>${timestamp}</td>
        <td>${report.user}</td>
        <td>${report.type}</td>
        <td>${contentHtml}</td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    this.reportListContainer.innerHTML = '';
    this.reportListContainer.appendChild(table);

    // 「すべて選択」チェックボックスのイベントリスナー
    document.getElementById('select-all-reports').addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      this.reportListContainer.querySelectorAll('.report-checkbox').forEach(checkbox => {
        checkbox.checked = isChecked;
      });
    });
  }

  /**
   * 「対応済みのレポートを表示」チェックボックスの状態に応じて、
   * 「対応済みにする」「未対応に戻す」ボタンの表示を切り替える
   */
  toggleReportActionButtons() {
    const showArchived = this.showArchivedCheckbox.checked;
    this.archiveReportsButton.style.display = showArchived ? 'none' : 'inline-block';
    this.unarchiveReportsButton.style.display = showArchived ? 'inline-block' : 'none';
    this.renderReportList();
  }
}

/**
 * 管理者ページ専用のロジックを管理するクラス
 */
class AdminApp {
  constructor() {
    this.cardOrderStorageKey = 'adminCardOrder';
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
  async _handleAuthStatusChange(isSignedIn, userInfo) {
    const isAdmin = await googleDriveService.isAdmin();
    if (isSignedIn && isAdmin) {
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
    this.uiManager.loadReportsButton?.addEventListener('click', () => this.uiManager.handleLoadReportsClick());
    this.uiManager.archiveReportsButton?.addEventListener('click', () => this.uiManager.handleArchiveReportsClick());
    this.uiManager.unarchiveReportsButton?.addEventListener('click', () => this.uiManager.handleUnarchiveReportsClick());
    this.uiManager.showArchivedCheckbox?.addEventListener('change', () => this.uiManager.toggleReportActionButtons());
    this._setupCardDragAndDrop();
  }

  /**
   * ページ読み込み時に必要なデータをロードする
   * @private
   */
  async _loadInitialData() {
    this.uiManager.toggleLoading(true, '管理者データを読み込み中...');
    // カードの順序を復元
    this._applyCardOrder();

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
      const files = await googleDriveService.loadByPrefix(APP_SETTINGS_FILENAME);
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

  /**
   * localStorageからカードの順序を読み込み、適用する
   * @private
   */
  _applyCardOrder() {
    const savedOrder = localStorage.getItem(this.cardOrderStorageKey);
    if (savedOrder) {
      const cardIds = JSON.parse(savedOrder);
      cardIds.forEach(cardId => {
        const card = document.getElementById(cardId);
        if (card) {
          this.uiManager.adminContent.appendChild(card);
        }
      });
    }
  }

  /**
   * 管理者ページのカードのドラッグ＆ドロップ機能をセットアップする
   * @private
   */
  _setupCardDragAndDrop() {
    const container = this.uiManager.adminContent;
    let draggedCard = null;

    container.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('admin-card')) {
        draggedCard = e.target;
        // ドラッグ中の要素のスタイルを少し遅れて適用
        setTimeout(() => {
          draggedCard.classList.add('dragging');
        }, 0);
      }
    });

    container.addEventListener('dragend', (e) => {
      if (draggedCard) {
        draggedCard.classList.remove('dragging');
        draggedCard = null;

        // 現在のカードの順序を保存
        const cardOrder = Array.from(container.querySelectorAll('.admin-card')).map(card => card.id);
        localStorage.setItem(this.cardOrderStorageKey, JSON.stringify(cardOrder));
      }
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = this._getDragAfterElement(container, e.clientY);
      if (draggedCard) {
        if (afterElement == null) {
          container.appendChild(draggedCard);
        } else {
          container.insertBefore(draggedCard, afterElement);
        }
      }
    });
  }

  _getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.admin-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
}

/**
 * Google Identity Services (GIS) のクライアントスクリプトを動的に読み込む
 * @returns {Promise<void>}
 */
function loadGoogleGsiClient() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google GSI client failed to load.'));
    document.head.appendChild(script);
  });
}

async function main() {
  await loadGoogleGsiClient();
  new AdminApp();
}

main();