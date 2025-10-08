import L from 'leaflet';
import { saveToDrive, deleteFromDrive, loadAllDataByPrefix } from './google-drive.js';
import { showToast, showModal, reverseGeocode, isPointInPolygon } from './utils.js';

const BOUNDARY_PREFIX = 'boundary_';
const DRAW_STYLE = {
  marker: { radius: 5, color: 'red' },
  polyline: { color: 'blue', weight: 3 },
};
const BOUNDARY_STYLE = { color: 'blue', weight: 3, opacity: 0.7, fillColor: 'blue', fillOpacity: 0.1 };
// 通知用の外国語キーワードリスト
const FOREIGN_LANGUAGE_KEYWORDS = ['英語', '中国語', '韓国語', 'ベトナム語', 'タガログ語', 'ポルトガル語', 'ネパール語', 'インドネシア語', 'タイ語', 'スペイン語', 'ミャンマー語', '手話'];

export class MapManager {
  constructor(map, markerClusterGroup) {
    this.map = map;
    this.markerClusterGroup = markerClusterGroup;

    // 状態管理
    this.markers = {}; // { markerId: { marker, data } }
    this.boundaries = {}; // { areaNumber: { layer, data } }
    // `isMarkerEditMode` はマーカーの追加/削除/移動を許可するモード
    // ポップアップ内のステータスやメモの編集は常時可能とする
    this.isMarkerEditMode = false;
    this.isBoundaryDrawMode = false;

    // 境界線描画中の一時的な状態 
    this.drawingState = {
      points: [],
      layerGroup: null,
    };
  }

  // --- モード切り替え ---

  toggleMarkerEditMode() {
    this.isMarkerEditMode = !this.isMarkerEditMode;
    if (this.isMarkerEditMode && this.isBoundaryDrawMode) {
      this.toggleBoundaryDrawMode(); // 境界線モードをOFFにする
    }
    // ポップアップの再描画を強制
    Object.values(this.markers).forEach(markerObj => {
      if (markerObj.marker.isPopupOpen()) {
        markerObj.marker.closePopup();
        markerObj.marker.openPopup();
      }
    });
    return this.isMarkerEditMode;
  }

  toggleBoundaryDrawMode() {
    this.isBoundaryDrawMode = !this.isBoundaryDrawMode;
    if (this.isBoundaryDrawMode && this.isMarkerEditMode) {
      this.toggleMarkerEditMode(); // マーカー編集モードをOFFにする
    }

    if (this.isBoundaryDrawMode) {
      this._startDrawing();
    } else {
      this._cancelDrawing();
    }
    return this.isBoundaryDrawMode;
  }

  // --- 境界線関連のメソッド (旧 boundary.js) ---

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

  _handleDrawClick = (e) => { // アロー関数で this を束縛
    if (!this.drawingState.layerGroup) return;

    this.drawingState.points.push(e.latlng);
    L.circleMarker(e.latlng, DRAW_STYLE.marker).addTo(this.drawingState.layerGroup);

    if (this.drawingState.points.length > 1) {
      this.drawingState.layerGroup.getLayers().filter(layer => layer instanceof L.Polyline).forEach(layer => this.drawingState.layerGroup.removeLayer(layer));
      L.polyline(this.drawingState.points, DRAW_STYLE.polyline).addTo(this.drawingState.layerGroup);
    }
  }

  async finishDrawing() {
    if (this.drawingState.points.length < 3) {
      showToast('多角形を描画するには、少なくとも3つの頂点が必要です。', 'error');
      return false;
    }

    const areaNumber = await showModal('区域番号を入力してください:', { type: 'prompt' });
    if (!areaNumber) {
      showToast('区域番号が入力されなかったため、描画をキャンセルしました。', 'info');
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
      await saveToDrive(fileName, geoJson);

      const polygon = this._renderBoundary(geoJson);
      this.boundaries[areaNumber] = { layer: polygon, data: geoJson };
      showToast(`区域「${areaNumber}」を保存しました。`, 'success');
    } catch (error) {
      console.error('境界線の保存/キュー追加に失敗しました:', error);
      showToast('境界線の保存に失敗しました。', 'error');
    }
  }

  _renderBoundary(geoJson) {
    const polygon = L.geoJSON(geoJson, { style: BOUNDARY_STYLE }).addTo(this.map);
    polygon.bindTooltip(geoJson.properties.areaNumber, { permanent: true, direction: 'center' });

    polygon.on('click', async (e) => {
      if (!this.isBoundaryDrawMode) return;
      L.DomEvent.stop(e);
      const confirmed = await showModal(`区域「${geoJson.properties.areaNumber}」を削除しますか？`);
      if (confirmed) {
        this.deleteBoundary(geoJson.properties.areaNumber);
      }
    });
    return polygon;
  }

  async deleteBoundary(areaNumber) {
    try {
      const fileName = `${BOUNDARY_PREFIX}${areaNumber}`;
      await deleteFromDrive(fileName);

      if (this.boundaries[areaNumber]) {
        this.map.removeLayer(this.boundaries[areaNumber].layer);
        delete this.boundaries[areaNumber];
        showToast(`区域「${areaNumber}」を削除しました。`, 'success');
      }
    } catch (error) {
      console.error('境界線の削除/キュー追加に失敗しました:', error);
      showToast('境界線の削除に失敗しました。', 'error');
    }
  }

  async loadAllBoundaries() {
    try {
      const boundaryFiles = await loadAllDataByPrefix(BOUNDARY_PREFIX);
      const boundariesData = boundaryFiles.map(file => file.data);
      
      this.renderBoundaries(boundariesData);
    } catch (error) {
      console.error('境界線の読み込みに失敗しました:', error);
      showToast('境界線の読み込みに失敗しました。', 'error');
    }
  }

  renderBoundaries(boundariesData) {
    // 既存の境界線レイヤーをクリア
    Object.values(this.boundaries).forEach(({ layer }) => {
      if (this.map.hasLayer(layer)) {
        this.map.removeLayer(layer);
      }
    });
     boundariesData.forEach(data => {
        const areaNumber = data.properties.areaNumber;
        const polygon = this._renderBoundary(data);
        this.boundaries[areaNumber] = { layer: polygon, data: data };
      });
  }

  filterBoundariesByArea(areaNumber) {
    Object.keys(this.boundaries).forEach(key => {
      const boundary = this.boundaries[key];
      if (areaNumber && key !== areaNumber) {
        this.map.removeLayer(boundary.layer);
      } else {
        if (!this.map.hasLayer(boundary.layer)) {
          this.map.addLayer(boundary.layer);
        }
      }
    });
  }

  getBoundaryLayerByArea(areaNumber) {
    return this.boundaries[areaNumber] ? this.boundaries[areaNumber].layer : null;
  }

  // --- マーカー関連のメソッド (旧 marker.js) ---

  addNewMarker(latlng) {
    const markerId = `marker-new-${Date.now()}`;
    const marker = L.marker(latlng, { icon: this._createMarkerIcon('new') });

    this.markers[markerId] = { marker, data: { address: null, name: '', status: '未訪問', memo: '', cameraIntercom: false, language: '未選択', isApartment: false } };

    // ポップアップ生成時に、isApartmentを含む初期データを渡すように修正
    const initialPopupData = { ...this.markers[markerId].data, isNew: true, address: "住所を取得中..." };
    marker.bindPopup(this._generatePopupContent(markerId, initialPopupData));

    marker.on('popupopen', () => {
      document.getElementById(`save-${markerId}`)?.addEventListener('click', () => this._saveNewMarker(markerId, latlng));
      document.getElementById(`cancel-${markerId}`)?.addEventListener('click', () => this._cancelNewMarker(markerId));

      // 新規マーカーでも集合住宅チェックボックスの連動を有効にする
      const apartmentCheckbox = document.getElementById(`isApartment-${markerId}`);
      const statusSelect = document.getElementById(`status-${markerId}`);
      const languageSelect = document.getElementById(`language-${markerId}`);
      if (apartmentCheckbox && statusSelect && languageSelect) {
        apartmentCheckbox.addEventListener('change', (e) => {
          statusSelect.disabled = e.target.checked;
          languageSelect.disabled = e.target.checked;
        });
      }

      reverseGeocode(latlng.lat, latlng.lng)
        .then(address => {
          const addressInput = document.getElementById(`address-${markerId}`);
          if (addressInput) addressInput.value = address;
        })
        .catch(error => {
          console.error("リバースジオコーディング失敗:", error);
          const addressInput = document.getElementById(`address-${markerId}`);
          if (addressInput) addressInput.value = "住所の取得に失敗しました";
        });
    });

    this.markerClusterGroup.addLayer(marker);
    marker.openPopup();
  }

  async _saveNewMarker(markerId, latlng) {
    const address = document.getElementById(`address-${markerId}`).value;
    const name = document.getElementById(`name-${markerId}`).value;
    const status = document.getElementById(`status-${markerId}`).value;
    const memo = document.getElementById(`memo-${markerId}`).value;
    const cameraIntercom = document.getElementById(`cameraIntercom-${markerId}`).checked;
    const language = document.getElementById(`language-${markerId}`).value;
    let isApartment = document.getElementById(`isApartment-${markerId}`).checked;

    if (!address) return alert('住所を入力してください');

    try {
      // 集合住宅の場合、ステータスと外国語をデフォルト値にリセット
      const finalStatus = isApartment ? '未訪問' : status;
      const finalLanguage = isApartment ? '未選択' : language;

      const saveData = { address, lat: latlng.lat, lng: latlng.lng, status: finalStatus, memo, name, cameraIntercom, language: finalLanguage, isApartment };

      await saveToDrive(address, saveData);
      
      const markerData = this.markers[markerId];
      markerData.data = saveData;
      markerData.marker.setIcon(this._createMarkerIcon(status, isApartment));
      markerData.marker.closePopup();
      markerData.marker.unbindPopup();
      this._setupMarkerPopup(markerId, markerData.marker, markerData.data);

      this._checkAndNotifyForSpecialNeeds(language, memo);
    } catch (error) {
      console.error('新規マーカー保存/キュー追加エラー:', error);
      alert('データの保存に失敗しました');
      this.markerClusterGroup.removeLayer(this.markers[markerId].marker);
      delete this.markers[markerId];
    }
  }

  _cancelNewMarker(markerId) {
    if (this.markers[markerId]) {
      this.markerClusterGroup.removeLayer(this.markers[markerId].marker);
      delete this.markers[markerId];
    }
  }

  async renderMarkersFromDrive() {
    try {
      // `boundary_` で始まるファイルを除外するために、プレフィックスを指定せずに
      // `loadAllDataByPrefix` を使うと意図しないファイルも取得してしまう。
      // そのため、マーカー専用のクエリを持つ `loadAllMarkerData` を使うのが適切だったが、
      // `google-drive.js` をシンプルにするため、ここでフィルタリングする。
      const allFiles = await loadAllDataByPrefix('');
      const driveMarkers = allFiles.filter(file => !file.name.startsWith(BOUNDARY_PREFIX));
      const markersData = driveMarkers.map(m => ({ address: m.name.replace('.json', ''), ...m.data }));
      
      this.renderMarkers(markersData);
    } catch (error) {
      console.error('マーカーデータ描画エラー:', error);
      showToast('マーカーデータの読み込みに失敗しました。', 'error');
    }
  }

  renderMarkers(markersData) {
    // 既存のマーカーレイヤーをクリア（markerClusterGroup.clearLayers()は既に存在するため、
    // this.markersオブジェクトのクリアもここで行うのが一貫性がある）
    Object.values(this.markers).forEach(({ marker }) => {
        this.markerClusterGroup.removeLayer(marker);
    });

    this.markerClusterGroup.clearLayers();
    this.markers = {};
    markersData.forEach((data, index) => {
      if (data.lat && data.lng) {
        const markerId = `marker-drive-${index}`;
        const marker = L.marker([data.lat, data.lng], { icon: this._createMarkerIcon(data.status, data.isApartment) });
        this.markers[markerId] = { marker, data };
        this._setupMarkerPopup(markerId, marker, data);
        this.markerClusterGroup.addLayer(marker);
      }
    });
  }

  _setupMarkerPopup(markerId, marker, data) {
    // ポップアップが開かれるたびに最新のマーカーデータを参照してコンテンツを生成する
    marker.bindPopup(() => this._generatePopupContent(markerId, this.markers[markerId]?.data || data));

    marker.on('popupopen', () => {
      document.getElementById(`save-${markerId}`)?.addEventListener('click', () => this._saveEdit(markerId, data.address));
      document.getElementById(`delete-${markerId}`)?.addEventListener('click', () => this._deleteMarker(markerId, data.address));
      
      // 集合住宅チェックボックスとステータス選択の連動
      const apartmentCheckbox = document.getElementById(`isApartment-${markerId}`);
      const statusSelect = document.getElementById(`status-${markerId}`);
      const languageSelect = document.getElementById(`language-${markerId}`);
      if (apartmentCheckbox && statusSelect && languageSelect) {
        apartmentCheckbox.addEventListener('change', (e) => {
          statusSelect.disabled = e.target.checked;
          languageSelect.disabled = e.target.checked;
        });
      }

    });
  }

  async _saveEdit(markerId, address) {
    try {
      const markerData = this.markers[markerId];
      const status = document.getElementById(`status-${markerId}`).value;
      const memo = document.getElementById(`memo-${markerId}`).value;
      const cameraIntercom = document.getElementById(`cameraIntercom-${markerId}`).checked;
      const language = document.getElementById(`language-${markerId}`).value;
      let isApartment = document.getElementById(`isApartment-${markerId}`).checked;

      // 集合住宅の場合、ステータスと外国語をデフォルト値にリセット
      const finalStatus = isApartment ? '未訪問' : status;
      const finalLanguage = isApartment ? '未選択' : language;

      const updatedData = { ...markerData.data, status: finalStatus, memo, cameraIntercom, language: finalLanguage, isApartment, updatedAt: new Date().toISOString() };

      // Driveに保存
      await saveToDrive(address, updatedData);

      markerData.data = updatedData;
      markerData.marker.setIcon(this._createMarkerIcon(status, isApartment));
      showToast('更新しました', 'success');
      markerData.marker.closePopup();

      this._checkAndNotifyForSpecialNeeds(language, memo);
    } catch (error) {
      console.error(`保存エラー:`, error);
      showToast('更新に失敗しました', 'error');
    }
  }

  async _deleteMarker(markerId, address) {
    const confirmed = await showModal(`住所「${address}」を削除しますか？`);
    if (!confirmed) return;

    try {
      await deleteFromDrive(address);

      if (this.markers[markerId]) {
        this.markerClusterGroup.removeLayer(this.markers[markerId].marker);
        delete this.markers[markerId];
        showToast('削除しました', 'success');
      }
    } catch (error) {
      console.error('削除エラー:', error);
      showToast('削除に失敗しました', 'error');
    }
  }

  _createMarkerIcon(status, isApartment = false) {
    let iconName = 'fa-house'; // デフォルト: 未訪問
    let color = '#337ab7'; // 青

    if (isApartment) {
      iconName = 'fa-building';
      color = '#6f42c1'; // 紫
      const iconHtml = `<div class="marker-icon-background"><i class="fa-solid ${iconName}" style="color: ${color};"></i></div>`;
      return L.divIcon({ html: iconHtml, className: 'custom-marker-icon', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
    }

    switch (status) {
      case '訪問済み':
        iconName = 'fa-house-circle-check';
        color = '#5cb85c'; // 緑
        break;
      case '不在':
        iconName = 'fa-clock';
        color = '#f0ad4e'; // 黄
        break;
      case 'new':
        iconName = 'fa-plus';
        color = '#d9534f'; // 赤
        break;
      case '未訪問':
      default:
        // デフォルトのまま
        break;
    }

    const iconHtml = `<div class="marker-icon-background"><i class="fa-solid ${iconName}" style="color: ${color};"></i></div>`;

    return L.divIcon({
      html: iconHtml,
      className: 'custom-marker-icon', // 背景スタイルなどを適用するためのクラス
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15]
    });
  }

  _generatePopupContent(markerId, data) {
    const { address, name, status, memo, isNew = false, cameraIntercom = false, language = '未選択', isApartment = false } = data;
    const title = isNew ? '新しい住所の追加' : (name || address);
    const statuses = ['未訪問', '訪問済み', '不在'];
    const statusOptions = statuses.map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${s}</option>`).join('');
    const languageOptionsList = ['未選択', ...FOREIGN_LANGUAGE_KEYWORDS, 'その他の言語'];
    const languageOptions = languageOptionsList.map(lang => `<option value="${lang}" ${language === lang ? 'selected' : ''}>${lang}</option>`).join('');
    const statusDisabled = isApartment ? 'disabled' : '';
    const languageDisabled = isApartment ? 'disabled' : '';

    const getPopupButtons = (markerId, isNew, isEditMode) => {
      if (isNew) {
        return `<button id="save-${markerId}">保存</button><button id="cancel-${markerId}">キャンセル</button>`;
      }
      if (isEditMode) {
        return `<button id="save-${markerId}">保存</button><button id="delete-${markerId}">削除</button>`;
      }
      return `<button id="save-${markerId}">保存</button>`; // 編集モードOFFでもステータス・メモは保存可能
    };

    const buttons = getPopupButtons(markerId, isNew, this.isMarkerEditMode);

    return `
      <div id="popup-${markerId}">
        <b>${title}</b><br>
        ${isNew ? `名前: <input type="text" id="name-${markerId}" value="${name || ''}"><br>` : ''}
        住所: ${isNew ? `<input type="text" id="address-${markerId}" value="${address || ''}">` : address}<br>
        <label><input type="checkbox" id="isApartment-${markerId}" ${isApartment ? 'checked' : ''}> 集合住宅</label><br>
        <label><input type="checkbox" id="cameraIntercom-${markerId}" ${cameraIntercom ? 'checked' : ''}> カメラインターフォン</label><br>
        外国語・手話: <select id="language-${markerId}" ${languageDisabled}>${languageOptions}</select><br>
        ステータス: <select id="status-${markerId}" ${statusDisabled}>${statusOptions}</select><br>
        メモ: <textarea id="memo-${markerId}">${memo || ''}</textarea><br>
        ${buttons}
      </div>
    `;
  }

  /**
   * 外国語・手話、またはメモの内容に基づいて特別な通知を表示する
   * @param {string} language - 選択された言語
   * @param {string} memo - 入力されたメモ
   * @private
   */
  _checkAndNotifyForSpecialNeeds(language, memo) {
    const needsNotification = language !== '未選択' || FOREIGN_LANGUAGE_KEYWORDS.some(keyword => memo.includes(keyword));
    if (needsNotification) {
      showToast('区域担当者、または奉仕監督に報告をお願いします', 'info', 5000); // 5秒間表示
    }
  }

  filterMarkersByPolygon(boundaryLayer) {
    this.markerClusterGroup.clearLayers();

    const allMarkers = Object.values(this.markers);

    if (!boundaryLayer) {
      // フィルタリング解除: 全マーカーを再表示
      allMarkers.forEach(markerObj => this.markerClusterGroup.addLayer(markerObj.marker));
      return;
    }

    // GeoJSONから頂点座標リストを取得 [lng, lat]
    const polygonVertices = boundaryLayer.toGeoJSON().features[0].geometry.coordinates[0];

    allMarkers.forEach(markerObj => {
      const markerLatLng = markerObj.marker.getLatLng();
      const point = [markerLatLng.lng, markerLatLng.lat];
      if (isPointInPolygon(point, polygonVertices)) {
        this.markerClusterGroup.addLayer(markerObj.marker);
      }
    });
  }

  async resetMarkersInPolygon(boundaryLayer) {
    if (!boundaryLayer) {
      throw new Error('リセット対象のポリゴンが指定されていません。');
    }

    // GeoJSONから頂点座標リストを取得 [lng, lat]
    const polygonVertices = boundaryLayer.toGeoJSON().features[0].geometry.coordinates[0];
    const allMarkers = Object.values(this.markers);
    const updatePromises = [];

    allMarkers.forEach(markerObj => {
      const markerLatLng = markerObj.marker.getLatLng();
      const point = [markerLatLng.lng, markerLatLng.lat];

      // マーカーがポリゴン内にあり、かつステータスが「未訪問」でない場合
      if (isPointInPolygon(point, polygonVertices) && markerObj.data.status !== '未訪問') {
        markerObj.data.status = '未訪問'; // isApartmentは変更しない
        markerObj.marker.setIcon(this._createMarkerIcon('未訪問'));
        updatePromises.push(saveToDrive(markerObj.data.address, markerObj.data));
      }
    });

    await Promise.all(updatePromises);
  }
}
