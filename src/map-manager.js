import L from 'leaflet';
import { saveToDrive, deleteFromDrive, loadAllDataByPrefix, getCurrentUser } from './google-drive.js';
import { isPointInPolygon } from './utils.js';
import { USER_SETTINGS_PREFIX } from './constants.js';
import { BoundaryManager } from './boundary-manager.js';
import { MarkerManager } from './marker-manager.js';

export class MapManager {
  constructor(map, markerClusterGroup) {
    this.map = map;
    this.markerClusterGroup = markerClusterGroup;
    this.boundaryManager = new BoundaryManager(map);
    this.markerManager = new MarkerManager(map, markerClusterGroup, this);

    // 状態管理
    // `isMarkerEditMode` はマーカーの追加/削除/移動を許可するモード
    // ポップアップ内のステータスやメモの編集は常時可能とする
    this.isMarkerEditMode = false;
    this.isBoundaryDrawMode = false;

    // ユーザー設定
    this.userSettings = {};
  }

  // --- モード切り替え ---

  toggleMarkerEditMode() {
    this.isMarkerEditMode = !this.isMarkerEditMode;
    if (this.isMarkerEditMode && this.isBoundaryDrawMode) {
      this.toggleBoundaryDrawMode(); // 境界線モードをOFFにする
    }
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

  // --- ユーザー設定関連 ---

  /**
   * ユーザー固有の設定ファイル名を取得する
   * @returns {string | null} ファイル名 or null
   * @private
   */
  _getUserSettingsFilename() {
    const user = getCurrentUser();
    // ユーザーID(sub)の代わりにメールアドレスをファイル名に使用する
    // メールアドレスの'@'や'.'を'_'に置換して、ファイル名として安全な文字列にする
    if (user && user.email) {
      return `${USER_SETTINGS_PREFIX}${user.email.replace(/[@.]/g, '_')}`;
    }
    return null;
  }

  /**
   * ユーザー設定をGoogle Driveから読み込む
   */
  async loadUserSettings() {
    const filename = this._getUserSettingsFilename();
    if (!filename) {
      this.userSettings = {};
      return this.userSettings;
    }
    try {
      // 拡張子を含めた完全なファイル名で検索する
      const files = await loadAllDataByPrefix(`${filename}.json`);
      if (files && files.length > 0) {
        this.userSettings = files[0].data;
      } else {
        this.userSettings = {}; // ファイルがない場合は空のオブジェクト
      }
    } catch (error) {
      // エラーが発生してもアプリの起動を妨げないように、空の設定を返す
      console.error('ユーザー設定の読み込みに失敗しました:', error);
      this.userSettings = {};
    }
    return this.userSettings;
  }

  /**
   * ユーザー設定をGoogle Driveに保存する
   * @param {object} settings 保存する設定オブジェクト
   */
  async saveUserSettings(settings) {
    const filename = this._getUserSettingsFilename();
    if (!filename) {
      return;
    }

    this.userSettings = { ...this.userSettings, ...settings };
    try {
      await saveToDrive(filename, this.userSettings);
    } catch (error) {
      // ユーザーへの通知は行わず、コンソールにエラーを出力するに留める
      console.error('ユーザー設定の保存に失敗しました:', error);
    }
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
      this.markerManager.filterByBoundaries(boundaryLayers);
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
}
