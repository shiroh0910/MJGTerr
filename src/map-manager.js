import L from 'leaflet';
import { googleDriveService } from './google-drive-service.js';
import { isPointInPolygon, showToast, showModal, saveAs } from './utils.js';
import { UI_TEXT, ANNOUNCEMENTS_FILENAME } from './constants.js';
import { BoundaryManager } from './boundary-manager.js';
import { MarkerManager } from './marker-manager.js';
import { UserSettingsManager } from './user-settings-manager.js';

export class MapManager {
  constructor(map, markerClusterGroup, uiManager) {
    this.map = map;
    this.markerClusterGroup = markerClusterGroup;
    this.uiManager = uiManager;
    this.boundaryManager = new BoundaryManager(map, this);
    this.markerManager = new MarkerManager(map, markerClusterGroup, this);
    this.userSettingsManager = new UserSettingsManager();
    this.baseLayers = {}; // 地図のベースレイヤーを保持

    // 状態管理
    // `isMarkerEditMode` はマーカーの追加/削除/移動を許可するモード
    // ポップアップ内のステータスやメモの編集は常時可能とする
    this.isMarkerEditMode = false;
    this.isBoundaryDrawMode = false;
  }
  
  /**
   * 地図のベースレイヤーを設定する
   * @param {object} baseLayers 
   */
  setBaseLayers(baseLayers) {
    this.baseLayers = baseLayers;
  }

  // --- モード切り替え ---

  toggleMarkerEditMode() {
    this.isMarkerEditMode = !this.isMarkerEditMode;
    if (this.isMarkerEditMode && this.isBoundaryDrawMode) {
      this.toggleBoundaryDrawMode(); // 境界線モードをOFFにする
    }
    this.markerManager.setEditMode(this.isMarkerEditMode); // MarkerManagerに状態を通知
    this.markerManager.forcePopupUpdate();
    return this.isMarkerEditMode;
  }

  toggleBoundaryDrawMode() {
    this.isBoundaryDrawMode = !this.isBoundaryDrawMode;
    if (this.isBoundaryDrawMode && this.isMarkerEditMode) {
      this.toggleMarkerEditMode(); // マーカー編集モードをOFFにする
    }
    // 実際の描画モードの切り替えはBoundaryManagerに委譲
    this.boundaryManager.toggleDrawingMode();
    return this.isBoundaryDrawMode;
  }

  // --- 境界線関連のメソッド (旧 boundary.js) ---

  async finishDrawing() {
    // 描画の完了処理をBoundaryManagerに委譲
    return this.boundaryManager.finishDrawing();
  }

  async loadAllBoundaries() {
    // 読み込み処理をBoundaryManagerに委譲
    await this.boundaryManager.loadAll();
  }

  getBoundaryLayerByArea(areaNumber) {
    // BoundaryManagerからレイヤーを取得
    return this.boundaryManager.getLayerByArea(areaNumber);
  }

  /**
   * 現在読み込まれているすべての区域番号のリストを返す
   * @returns {string[]}
   */
  getAvailableAreaNumbers() {
    // BoundaryManagerから区域番号リストを取得
    return this.boundaryManager.getAvailableAreaNumbers();
  }

  /**
   * 現在のユーザー設定オブジェクトを返す
   * @returns {object}
   */
  getUserSettings() {
    return this.userSettingsManager.settings || {};
  }
  // --- ユーザー設定関連 ---

  /**
   * ユーザー設定を読み込み、地図に適用する
   */
  async loadUserSettings() {
    const settings = await this.userSettingsManager.load();
    return settings;
  }

  async saveUserSettings(settings) {
    await this.userSettingsManager.save(settings);
  }

  /**
   * 区域フィルターを適用し、地図の表示を更新する
   * @param {string[]} areaNumbers フィルターを適用する区域番号の配列
   */
  applyAreaFilter(areaNumbers) {
    if (!areaNumbers || areaNumbers.length === 0) {
      this.boundaryManager.filterByArea(null);
      this.markerManager.filterByBoundaries(null);
      return;
    }

    const boundaryLayers = areaNumbers
      .map(area => this.getBoundaryLayerByArea(area))
      .filter(layer => layer !== null);

    if (boundaryLayers.length > 0) {
      const group = new L.FeatureGroup(boundaryLayers);
      this.map.fitBounds(group.getBounds(), {
        padding: [50, 50],
        maxZoom: 18
      });
      this.boundaryManager.filterByArea(areaNumbers);
      this.markerManager.filterByBoundaries(boundaryLayers); // フィルター適用
    }
  }

  // --- マーカー関連のメソッド (旧 marker.js) ---

  addNewMarker(latlng) {
    this.markerManager.addNewMarker(latlng);
  }

  async renderMarkersFromDrive() {
    await this.markerManager.renderAllFromDrive();
  }

  async resetMarkersInBoundaries(boundaryLayers) {
    await this.markerManager.resetInBoundaries(boundaryLayers);
  }

  /**
   * マーカーデータをフィルタリングし、CSVとしてダウンロードする
   * @param {object} filters - { areaNumbers: string[], keyword: string }
   */
  async exportMarkersToCsv(filters) {
    const allMarkersData = this.markerManager.getAllMarkersData();
    const availableAreas = this.getAvailableAreaNumbers();

    const boundaryPolygons = new Map();
    availableAreas.forEach(areaNum => {
      const layer = this.getBoundaryLayerByArea(areaNum);
      if (layer) {
        boundaryPolygons.set(areaNum, layer);
      }
    });

    const { csvContent, rowCount } = this.markerManager.generateCsv(allMarkersData, filters, boundaryPolygons);

    if (rowCount === 0) {
      showToast(UI_TEXT.EXPORT_NO_DATA, 'info');
      return;
    }

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${UI_TEXT.EXPORT_FILENAME_PREFIX}${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Google Drive上の全データをZIPファイルとしてバックアップする
   */
  async backupAllData() {
    const confirmed = await showModal('バックアップを開始しますか？');
    if (!confirmed) return;

    this.uiManager.toggleLoading(true, '全データを取得中...');

    try {
      // プレフィックスなしですべてのファイルを取得
      const allFiles = await googleDriveService.loadByPrefix('');
      if (allFiles.length === 0) {
        showToast('バックアップ対象のデータがありません。', 'info');
        return;
      }

      this.uiManager.toggleLoading(true, 'ZIPファイルを生成中...');

      const zip = new window.JSZip();
      allFiles.forEach(file => {
        // file.name には .json が含まれている
        zip.file(file.name, JSON.stringify(file.data, null, 2));
      });

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `visit-pwa-backup-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (error) {
      showToast('バックアップに失敗しました。', 'error');
      console.error('バックアップ処理エラー:', error);
    } finally {
      this.uiManager.toggleLoading(false);
    }
  }

  /**
   * ZIPファイルからデータを復元する
   * @param {File} zipFile ユーザーが選択したZIPファイル
   */
  async restoreAllData(zipFile) {
    if (!zipFile) {
      showToast('ファイルが選択されていません。', 'warning');
      return;
    }

    const confirmed = await showModal('本当にデータを復元しますか？<br>現在のGoogle Drive上のデータはすべて上書きされます。この操作は元に戻せません。');
    if (!confirmed) return;

    this.uiManager.toggleLoading(true, 'ZIPファイルを解凍中...');

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
      const concurrencyLimit = 5; // 同時に実行するアップロード数

      const executeUploads = async (tasks) => {
        const promises = tasks.map(task => task().then(() => {
          uploadedCount++;
          this.uiManager.toggleLoading(true, `ファイルをアップロード中... (${uploadedCount}/${totalFiles})`);
        }));
        await Promise.all(promises);
      };

      this.uiManager.toggleLoading(true, `ファイルをアップロード中... (0/${totalFiles})`);

      // タスクをチャンクに分割して並列実行
      for (let i = 0; i < totalFiles; i += concurrencyLimit) {
        const chunk = filesToUpload.slice(i, i + concurrencyLimit);
        await executeUploads(chunk);
      }

      await showModal('データの復元が完了しました。ページをリロードします。', { type: 'alert' });
      window.location.reload();
    } catch (error) {
      showToast('データの復元に失敗しました。', 'error');
      console.error('復元処理エラー:', error);
      this.uiManager.toggleLoading(false);
    }
  }

  /**
   * お知らせデータを取得する
   * @returns {Promise<object|null>}
   */
  async getAnnouncements() {
    const files = await googleDriveService.loadByPrefix(`${ANNOUNCEMENTS_FILENAME}.json`);
    if (files.length > 0) {
      return files[0].data;
    }
    return null;
  }
}
