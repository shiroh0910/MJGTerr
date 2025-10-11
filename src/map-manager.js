import L from 'leaflet';
import { isPointInPolygon, showToast } from './utils.js';
import { UI_TEXT } from './constants.js';
import { BoundaryManager } from './boundary-manager.js';
import { MarkerManager } from './marker-manager.js';
import { UserSettingsManager } from './user-settings-manager.js';

export class MapManager {
  constructor(map, markerClusterGroup) {
    this.map = map;
    this.markerClusterGroup = markerClusterGroup;
    this.boundaryManager = new BoundaryManager(map);
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
    
    // フィルター設定の適用
    if (settings && settings.filteredAreaNumbers) {
      this.applyAreaFilter(settings.filteredAreaNumbers);
    }

    // タイルレイヤー設定の適用
    const initialLayerName = settings?.selectedTileLayer || "淡色地図";
    const initialLayer = this.baseLayers[initialLayerName] || this.baseLayers["淡色地図"];
    if (initialLayer) {
      initialLayer.addTo(this.map);
    }
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
}
