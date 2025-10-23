import L from 'leaflet';
import { googleDriveService } from './google-drive-service.js';
import { showModal, showToast } from './utils.js';
import { BOUNDARY_PREFIX, STYLES, UI_TEXT } from './constants.js';

export class BoundaryManager {
  constructor(map, mapManager) {
    this.map = map;
    this.mapManager = mapManager;
    this.boundaries = {}; // { areaNumber: { layer, data } }
    this.isDrawing = false;

    this.drawingState = {
      points: [],
      layerGroup: null,
    };
  }

  toggleDrawingMode() {
    this.isDrawing = !this.isDrawing;
    if (this.isDrawing) {
      this._startDrawing();
    } else {
      this._cancelDrawing();
    }
    return this.isDrawing;
  }

  _startDrawing() {
    this.map.on('click', this._handleDrawClick);
    this.drawingState.layerGroup = L.layerGroup().addTo(this.map);
    this.drawingState.points = [];
  }

  _cancelDrawing() {
    this.map.off('click', this._handleDrawClick);
    if (this.drawingState.layerGroup) {
      this.drawingState.layerGroup.clearLayers();
      this.map.removeLayer(this.drawingState.layerGroup);
      this.drawingState.layerGroup = null;
    }
    this.drawingState.points = [];
  }

  _handleDrawClick = (e) => {
    if (!this.drawingState.layerGroup) return;

    this.drawingState.points.push(e.latlng);
    L.circleMarker(e.latlng, STYLES.BOUNDARY_DRAW_MARKER).addTo(this.drawingState.layerGroup);

    if (this.drawingState.points.length > 1) {
      this.drawingState.layerGroup.getLayers().filter(layer => layer instanceof L.Polyline).forEach(layer => this.drawingState.layerGroup.removeLayer(layer));
      L.polyline(this.drawingState.points, STYLES.BOUNDARY_DRAW_POLYLINE).addTo(this.drawingState.layerGroup);
    }
  }

  async finishDrawing() {
    if (this.drawingState.points.length < 3) {
      showToast(UI_TEXT.BOUNDARY_DRAW_WARN, 'warning');
      return false;
    }

    const areaNumber = await showModal(UI_TEXT.BOUNDARY_DRAW_PROMPT, { type: 'prompt' });
    if (!areaNumber) {
      this._cancelDrawing();
      return false;
    }

    const lnglats = this.drawingState.points.map(p => [p.lng, p.lat]);
    const geoJson = {
      type: 'Feature',
      properties: { areaNumber },
      geometry: { type: 'Polygon', coordinates: [lnglats.concat([lnglats[0]])] }
    };

    this._cancelDrawing();
    await this._saveBoundary(areaNumber, geoJson);
    return true;
  }

  async _saveBoundary(areaNumber, geoJson) {
    try {
      const fileName = `${BOUNDARY_PREFIX}${areaNumber}`;
      await googleDriveService.save(fileName, geoJson);

      const polygon = this._renderBoundary(geoJson);
      this.boundaries[areaNumber] = { layer: polygon, data: geoJson };
      showToast(`${UI_TEXT.BOUNDARY_SAVE_SUCCESS_PREFIX}${areaNumber}${UI_TEXT.BOUNDARY_SAVE_SUCCESS_SUFFIX}`, 'success');

      // 最終利用日時を更新
      this.mapManager.saveUserSettings({ updatedAt: new Date().toISOString() });
    } catch (error) {
      showToast(UI_TEXT.BOUNDARY_SAVE_ERROR, 'error');
    }
  }

  _renderBoundary(geoJson) {
    const polygon = L.geoJSON(geoJson, { style: STYLES.BOUNDARY_DISPLAY }).addTo(this.map);
    polygon.bindTooltip(geoJson.properties.areaNumber, { permanent: true, direction: 'center' });

    polygon.on('click', async (e) => {
      if (!this.isDrawing) return;
      L.DomEvent.stop(e);
      const confirmed = await showModal(`${UI_TEXT.BOUNDARY_DELETE_CONFIRM_PREFIX}${geoJson.properties.areaNumber}${UI_TEXT.BOUNDARY_DELETE_CONFIRM_SUFFIX}`);
      if (confirmed) {
        this.deleteBoundary(geoJson.properties.areaNumber);
      }
    });

    // ダブルクリックでその区域に絞り込むイベントを追加
    polygon.on('dblclick', (e) => {
      L.DomEvent.stop(e); // ダブルクリックで地図がズームしないようにする

      // 現在のフィルター状態を取得
      const currentFilter = this.mapManager.getUserSettings().filteredAreaNumbers;

      // 絞り込みがオフの場合は、この区域で絞り込みを実行
      if (!currentFilter || currentFilter.length === 0) {
        const areaNumber = geoJson.properties.areaNumber;
        this.mapManager.applyAreaFilter([areaNumber]);
        this.mapManager.saveUserSettings({ filteredAreaNumbers: [areaNumber] });
      } else {
        // 絞り込みがオンの場合は、絞り込みを解除
        this.mapManager.applyAreaFilter(null);
        this.mapManager.saveUserSettings({ filteredAreaNumbers: [] });
      }
    });
    return polygon;
  }

  async deleteBoundary(areaNumber) {
    try {
      const fileName = `${BOUNDARY_PREFIX}${areaNumber}`;
      await googleDriveService.delete(fileName);

      if (this.boundaries[areaNumber]) {
        this.map.removeLayer(this.boundaries[areaNumber].layer);
        delete this.boundaries[areaNumber];
        showToast(`${UI_TEXT.BOUNDARY_DELETE_SUCCESS_PREFIX}${areaNumber}${UI_TEXT.BOUNDARY_DELETE_SUCCESS_SUFFIX}`, 'success');

        // 最終利用日時を更新
        this.mapManager.saveUserSettings({ updatedAt: new Date().toISOString() });
      }
    } catch (error) {
      showToast(UI_TEXT.BOUNDARY_DELETE_ERROR, 'error');
    }
  }

  async loadAll() {
    try {
      const boundaryFiles = await googleDriveService.loadByPrefix(BOUNDARY_PREFIX);
      const boundariesData = boundaryFiles.map(file => file.data);
      this.renderAll(boundariesData);
    } catch (error) {
      showToast(UI_TEXT.BOUNDARY_LOAD_ERROR, 'error');
    }
  }

  renderAll(boundariesData) {
    Object.values(this.boundaries).forEach(({ layer }) => {
      if (this.map.hasLayer(layer)) this.map.removeLayer(layer);
    });
    this.boundaries = {};
    boundariesData.forEach(data => {
      const areaNumber = data.properties.areaNumber;
      const polygon = this._renderBoundary(data);
      this.boundaries[areaNumber] = { layer: polygon, data: data };
    });
  }

  filterByArea(areaNumbers) {
    const showAll = !areaNumbers || areaNumbers.length === 0;
    Object.keys(this.boundaries).forEach(key => {
      const { layer } = this.boundaries[key];
      const isFiltered = !showAll && areaNumbers.includes(key);

      // ツールチップのスタイルを更新
      const tooltip = layer.getTooltip();
      if (tooltip) {
        tooltip.getElement()?.classList.toggle('filtered-boundary-tooltip', isFiltered);
      }

      // レイヤーの表示/非表示を切り替え
      if (!showAll && !areaNumbers.includes(key)) {
        this.map.removeLayer(layer);
      } else {
        if (!this.map.hasLayer(layer)) {
          this.map.addLayer(layer);
        }
      }
    });
  }

  getLayerByArea(areaNumber) {
    return this.boundaries[areaNumber] ? this.boundaries[areaNumber].layer : null;
  }

  getAvailableAreaNumbers() {
    return Object.keys(this.boundaries).sort((a, b) => a - b);
  }
}