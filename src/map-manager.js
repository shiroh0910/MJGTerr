import L from 'leaflet';
import { saveToDrive, deleteFromDrive, loadAllDataByPrefix, getCurrentUser } from './google-drive.js';
import { showModal, reverseGeocode, isPointInPolygon, showToast } from './utils.js';
import { USER_SETTINGS_PREFIX } from './constants.js';

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

    // 集合住宅エディタ関連
    this.activeApartmentMarkerId = null;

    // ユーザー設定
    this.userSettings = {};
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
      showToast('多角形を描画するには、少なくとも3つの頂点が必要です。', 'warning');
      return false;
    }

    const areaNumber = await showModal('区域番号を入力してください:', { type: 'prompt' });
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
      await saveToDrive(fileName, geoJson);

      const polygon = this._renderBoundary(geoJson);
      this.boundaries[areaNumber] = { layer: polygon, data: geoJson };
      showToast(`区域「${areaNumber}」を保存しました。`, 'success');
    } catch (error) {
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
      showToast('境界線の削除に失敗しました。', 'error');
    }
  }

  async loadAllBoundaries() {
    try {
      const boundaryFiles = await loadAllDataByPrefix(BOUNDARY_PREFIX);
      const boundariesData = boundaryFiles.map(file => file.data);
      
      this.renderBoundaries(boundariesData);
    } catch (error) {
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

  filterBoundariesByArea(areaNumbers) {
    const showAll = !areaNumbers || areaNumbers.length === 0;
    Object.keys(this.boundaries).forEach(key => {
      const boundary = this.boundaries[key];
      if (!showAll && !areaNumbers.includes(key)) {
        this.map.removeLayer(boundary.layer);
      } else {
        if (this.map.hasLayer(boundary.layer) === false) {
          this.map.addLayer(boundary.layer);
        }
      }
    });
  }

  getBoundaryLayerByArea(areaNumber) {
    return this.boundaries[areaNumber] ? this.boundaries[areaNumber].layer : null;
  }

  /**
   * 現在読み込まれているすべての区域番号のリストを返す
   * @returns {string[]}
   */
  getAvailableAreaNumbers() {
    return Object.keys(this.boundaries).sort();
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
    console.log('[MapManager] loadUserSettings を開始します。');
    const filename = this._getUserSettingsFilename();
    if (!filename) {
      console.warn('[MapManager] ユーザー情報が取得できないため、設定を読み込めません。');
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
    console.log('[MapManager] saveUserSettingsが呼び出されました。', settings);
    const filename = this._getUserSettingsFilename();
    if (!filename) {
      console.warn('[MapManager] ユーザーIDが取得できないため、設定を保存できません。');
      return;
    }

    this.userSettings = { ...this.userSettings, ...settings };
    try {
      console.log(`[MapManager] saveToDriveを呼び出します。filename: ${filename}`, this.userSettings);
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
      this.filterBoundariesByArea(null);
      this.filterMarkersByBoundaries(null);
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
      this.filterBoundariesByArea(areaNumbers);
      this.filterMarkersByBoundaries(boundaryLayers);
    }
  }

  // --- マーカー関連のメソッド (旧 marker.js) ---

  addNewMarker(latlng) {
    const markerId = `marker-new-${Date.now()}`;
    const marker = L.marker(latlng, { icon: this._createMarkerIcon('new') });
    const data = { address: null, name: '', status: '未訪問', memo: '', cameraIntercom: false, language: '未選択', isApartment: false };

    marker.customData = data; // マーカー自体にデータを保持させる
    this.markers[markerId] = { marker, data };

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

    // ボタンがクリックされた直後に表示を変更し、二重クリックを防ぐ
    const saveButton = document.getElementById(`save-${markerId}`);
    const cancelButton = document.getElementById(`cancel-${markerId}`);
    if (saveButton) {
      saveButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 保存中...`;
      saveButton.disabled = true;
      if (cancelButton) cancelButton.disabled = true;
    }

    try {
      // 集合住宅の場合、ステータスと外国語をデフォルト値にリセット
      const finalStatus = isApartment ? '未訪問' : status;
      const finalLanguage = isApartment ? '未選択' : language;

      const saveData = { address, lat: latlng.lat, lng: latlng.lng, status: finalStatus, memo, name, cameraIntercom, language: finalLanguage, isApartment };

      await saveToDrive(address, saveData);
      
      const markerData = this.markers[markerId];
      markerData.data = saveData;
      markerData.marker.customData = saveData; // マーカーのデータも更新
      showToast('保存しました', 'success');
      markerData.marker.setIcon(this._createMarkerIcon(finalStatus, isApartment));

      // クラスタの表示を強制的に更新する
      this.markerClusterGroup.refreshClusters(markerData.marker);
      
      setTimeout(() => {
        markerData.marker.closePopup();
        this._setupMarkerPopup(markerId, markerData.marker, markerData.data); // ポップアップを再設定
      }, 500); // 0.5秒後にポップアップを閉じる

      this._checkAndNotifyForSpecialNeeds(language, memo);
    } catch (error) {
      this.markerClusterGroup.removeLayer(this.markers[markerId].marker);
      delete this.markers[markerId];
      showToast('データの保存に失敗しました', 'error');
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
        marker.customData = data; // マーカー自体にデータを保持させる
        this.markers[markerId] = { marker, data };
        this._setupMarkerPopup(markerId, marker, data);
        this.markerClusterGroup.addLayer(marker);
      }
    });
  }

  _setupMarkerPopup(markerId, marker, data) {
    // ポップアップが開かれるたびに最新のマーカーデータを参照してコンテンツを生成する
    marker.bindPopup(() => this._generatePopupContent(markerId, this.markers[markerId]?.data || data));

    marker.on('click', (e) => {
      const currentData = this.markers[markerId]?.data;
      // 集合住宅マーカーであり、かつマーカー編集モードがOFFの場合のみエディタを開く
      if (currentData && currentData.isApartment && !this.isMarkerEditMode) {
        L.DomEvent.stop(e); // デフォルトのポップアップ表示をキャンセル
        this._openApartmentEditor(markerId);
      } else {
        // それ以外の場合は通常のポップアップを開く（デフォルトの動作）
      }
    });

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
      let updatedData;

      // 集合住宅エディタからの保存か、通常のポップアップからの保存かを判断
      if (this.activeApartmentMarkerId === markerId) {
        // 集合住宅エディタからの保存
        const apartmentDetails = this._getApartmentDataFromTable();
        updatedData = { ...markerData.data, apartmentDetails, updatedAt: new Date().toISOString() };

        // ボタンの表示を変更してフィードバックを返し、少し遅れてパネルを閉じる
        const saveButton = document.getElementById('apartment-editor-save');
        if (saveButton) {
          saveButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 保存中...`;
          saveButton.disabled = true;
        }

      } else {
        // 通常のポップアップからの保存
        const status = document.getElementById(`status-${markerId}`).value;
        const memo = document.getElementById(`memo-${markerId}`).value;
        const cameraIntercom = document.getElementById(`cameraIntercom-${markerId}`).checked;
        const language = document.getElementById(`language-${markerId}`).value;
        const isApartment = document.getElementById(`isApartment-${markerId}`).checked;

        // ボタンがクリックされた直後に表示を変更
        const saveButton = document.getElementById(`save-${markerId}`);
        if (saveButton) {
            saveButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 更新中...`;
            saveButton.disabled = true;
        }

        // 集合住宅の場合、ステータスと外国語をデフォルト値にリセット
        const finalStatus = isApartment ? '未訪問' : status;
        const finalLanguage = isApartment ? '未選択' : language;

        updatedData = { ...markerData.data, status: finalStatus, memo, cameraIntercom, language: finalLanguage, isApartment, updatedAt: new Date().toISOString() };
      }

      // Driveに保存
      await saveToDrive(address, updatedData);
      showToast('更新しました', 'success');

      markerData.data = updatedData;
      markerData.marker.customData = updatedData; // マーカーのデータも更新
      markerData.marker.setIcon(this._createMarkerIcon(updatedData.status, updatedData.isApartment));

      // クラスタの表示を強制的に更新する
      this.markerClusterGroup.refreshClusters(markerData.marker);

      if (this.activeApartmentMarkerId === markerId) {
        // 集合住宅エディタの場合は、保存成功後にパネルを閉じる
        this._closeApartmentEditor();
      }
      // 通常のポップアップの場合は、少し遅れて閉じる
      setTimeout(() => {
        markerData.marker.closePopup();
      }, 500);

      // ポップアップからの保存の場合のみ通知チェック
      if (this.activeApartmentMarkerId !== markerId) {
        this._checkAndNotifyForSpecialNeeds(updatedData.language, updatedData.memo);
      }
    } catch (error) {
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
      showToast('新しい情報の場合、区域担当者、または奉仕監督に報告をお願いします', 'info', 5000);
    }
  }

  filterMarkersByBoundaries(boundaryLayers) {
    this.markerClusterGroup.clearLayers();

    const allMarkers = Object.values(this.markers);

    if (!boundaryLayers || boundaryLayers.length === 0) {
      // フィルタリング解除: 全マーカーを再表示
      allMarkers.forEach(markerObj => this.markerClusterGroup.addLayer(markerObj.marker));
      return;
    }

    // 複数の区域の頂点リストを取得
    const boundaryVerticesList = boundaryLayers.map(layer => {
      return layer.toGeoJSON().features[0].geometry.coordinates[0];
    });

    allMarkers.forEach(markerObj => {
      const markerLatLng = markerObj.marker.getLatLng();
      const point = [markerLatLng.lng, markerLatLng.lat];

      // いずれかの区域内に点が含まれているかチェック
      const isInAnyBoundary = boundaryVerticesList.some(vertices => {
        return isPointInPolygon(point, vertices);
      });

      if (isInAnyBoundary) {
        this.markerClusterGroup.addLayer(markerObj.marker);
      }
    });
  }

  async resetMarkersInBoundaries(boundaryLayers) {
    if (!boundaryLayers || boundaryLayers.length === 0) {
      throw new Error('リセット対象の区域が指定されていません。');
    }

    // 複数の区域の頂点リストを取得
    const boundaryVerticesList = boundaryLayers.map(layer => {
      return layer.toGeoJSON().features[0].geometry.coordinates[0];
    });
    const allMarkers = Object.values(this.markers);
    const updatePromises = [];

    allMarkers.forEach(markerObj => {
      const markerLatLng = markerObj.marker.getLatLng();
      const point = [markerLatLng.lng, markerLatLng.lat];

      // いずれかの区域内に点が含まれているかチェック
      const isInAnyBoundary = boundaryVerticesList.some(vertices => {
        return isPointInPolygon(point, vertices);
      });

      // マーカーがいずれかの区域内にあり、かつステータスが「未訪問」でない場合
      if (isInAnyBoundary && markerObj.data.status !== '未訪問') {
        const updatedData = { ...markerObj.data, status: '未訪問' };
        this._updateMarkerState(markerObj, updatedData);
        updatePromises.push(saveToDrive(updatedData.address, updatedData));
      }
    });

    await Promise.all(updatePromises);
  }

  // --- 集合住宅エディタ関連のメソッド ---

  /**
   * マーカーのローカル状態と表示を更新するヘルパーメソッド
   * @param {object} markerObj - this.markersのマーカーオブジェクト
   * @param {object} updatedData - 新しいデータ
   * @private
   */
  _updateMarkerState(markerObj, updatedData) {
    markerObj.data = updatedData;
    markerObj.marker.customData = updatedData;
    markerObj.marker.setIcon(this._createMarkerIcon(updatedData.status, updatedData.isApartment));
    // クラスタの表示を強制的に更新
    this.markerClusterGroup.refreshClusters(markerObj.marker);
  }

  _openApartmentEditor(markerId) {
    const apartmentEditor = document.getElementById('apartment-editor');
    const apartmentEditorTitle = document.getElementById('apartment-editor-title');
    if (!apartmentEditor || !apartmentEditorTitle) {
      console.error('集合住宅エディタの要素が見つかりません。');
      return;
    }

    this.activeApartmentMarkerId = markerId;
    const markerData = this.markers[markerId].data;

    apartmentEditorTitle.textContent = markerData.name || markerData.address;

    // テーブルを生成
    this._renderApartmentTable(markerData.apartmentDetails);

    // イベントリスナーを設定
    document.getElementById('apartment-editor-save').onclick = () => this._saveEdit(markerId, markerData.address);
    document.getElementById('apartment-editor-close').onclick = () => this._closeApartmentEditor();

    apartmentEditor.classList.add('show');
  }

  _closeApartmentEditor() {
    const apartmentEditor = document.getElementById('apartment-editor');
    if (apartmentEditor) {
      apartmentEditor.classList.remove('show');
    }
    this.activeApartmentMarkerId = null;
    // イベントリスナーを解除してメモリリークを防ぐ
    document.getElementById('apartment-editor-save').onclick = null;
    document.getElementById('apartment-editor-close').onclick = null;
  }

  _renderApartmentTable(details) {
    const apartmentEditorContent = document.getElementById('apartment-editor-content');
    if (!apartmentEditorContent) {
      console.error('集合住宅エディタのコンテンツ領域が見つかりません。');
      return;
    }

    const statuses = ['未訪問', '訪問済み', '不在'];
    const statusOptions = statuses.map(s => `<option value="${s}">${s}</option>`).join('');

    let headers = details?.headers || [new Date().toLocaleDateString('sv-SE')]; // YYYY-MM-DD
    let rooms = details?.rooms || [
      { roomNumber: '101', statuses: ['未訪問'] },
      { roomNumber: '102', statuses: ['未訪問'] },
    ];

    const table = document.createElement('table');
    table.className = 'apartment-table';
    table.id = 'apartment-data-table';

    // ヘッダー行
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    // 部屋番号ヘッダーを<th>として生成
    const roomNumberHeader = document.createElement('th');
    roomNumberHeader.textContent = '部屋番号';
    headerRow.appendChild(roomNumberHeader);

    headers.forEach((header, colIndex) => {
      // 各日付ヘッダーを<th>として生成
      const th = document.createElement('th');
      th.className = 'date-header-cell';

      // thの中にFlexbox用のdivコンテナを作成
      const contentDiv = document.createElement('div');
      contentDiv.className = 'date-header-cell-content';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = header;

      // ダブルクリックで日付入力に切り替え
      input.addEventListener('dblclick', () => {
        input.type = 'date';
        // iOSなどでキーボードが表示されるのを防ぎ、ピッカーを開くのを助ける
        input.focus();
        input.click();
      });

      // フォーカスが外れたらテキスト入力に戻す
      input.addEventListener('blur', () => {
        input.type = 'text';
      });

      contentDiv.appendChild(input);

      // 列削除ボタンを追加
      const removeButton = document.createElement('button');
      removeButton.className = 'remove-column-btn';
      removeButton.innerHTML = '&times;';
      removeButton.dataset.colIndex = colIndex;
      contentDiv.appendChild(removeButton);
      th.appendChild(contentDiv);
      headerRow.appendChild(th);
    });
    // 列追加ボタンヘッダーを<th>として生成
    const addColumnCell = document.createElement('th'); 
    addColumnCell.className = 'control-cell';
    addColumnCell.innerHTML = `<button id="add-column-btn" title="列を追加">+</button>`;
    headerRow.appendChild(addColumnCell); // <th>を<tr>に追加

    // データ行
    const tbody = table.createTBody();
    rooms.forEach((room, rowIndex) => {
      const row = tbody.insertRow();
      const roomNumberCell = row.insertCell();
      roomNumberCell.innerHTML = `<input type="text" value="${room.roomNumber}">`;

      headers.forEach((_, colIndex) => {
        const statusCell = row.insertCell();
        const currentStatus = room.statuses[colIndex] || '未訪問';
        statusCell.className = `status-cell ${this._getStatusClass(currentStatus)}`;

        // ドロップダウン要素を作成
        const select = document.createElement('select');
        select.innerHTML = statusOptions; // 選択肢を設定
        select.value = currentStatus; // 保存されている値を選択状態にする
        select.className = this._getStatusClass(currentStatus); // 初期色を設定

        // ドロップダウンの値が変更されたときのイベントリスナー
        select.addEventListener('change', (e) => {
          const newStatusClass = this._getStatusClass(e.target.value);
          statusCell.className = `status-cell ${newStatusClass}`; // セルの色を更新
          select.className = newStatusClass; // ドロップダウン自体の色を更新
        });

        statusCell.appendChild(select);
      });
      const controlCell = row.insertCell();
      controlCell.className = 'control-cell';
      const removeRowButton = document.createElement('button');
      removeRowButton.className = 'remove-row-btn';
      removeRowButton.title = '行を削除';
      removeRowButton.innerHTML = '-';
      removeRowButton.dataset.rowIndex = rowIndex;
      controlCell.appendChild(removeRowButton);
    });

    // 行追加ボタン
    const tfoot = table.createTFoot();
    const footerRow = tfoot.insertRow();
    footerRow.innerHTML = `<td class="control-cell"><button id="add-row-btn" title="行を追加">+</button></td><td colspan="${headers.length + 1}"></td>`;

    apartmentEditorContent.innerHTML = '';
    apartmentEditorContent.appendChild(table);

    // イベントリスナーの再設定
    document.getElementById('add-column-btn').onclick = () => this._addColumn();
    document.getElementById('add-row-btn').onclick = () => this._addRow();
    document.querySelectorAll('.remove-row-btn').forEach(btn => {
      btn.onclick = (e) => this._removeRow(e.currentTarget.dataset.rowIndex);
    });
    document.querySelectorAll('.remove-column-btn').forEach(btn => {
      btn.onclick = (e) => this._removeColumn(e.currentTarget.dataset.colIndex);
    });
  }

  /**
   * ステータス文字列に対応するCSSクラス名を返す
   * @param {string} status
   * @returns {string} CSSクラス名
   * @private
   */
  _getStatusClass(status) {
    switch (status) {
      case '訪問済み': return 'status-visited';
      case '不在': return 'status-not-at-home';
      case '未訪問':
      default:
        return 'status-not-visited';
    }
  }

  _getApartmentDataFromTable() {
    const table = document.getElementById('apartment-data-table');
    if (!table) return null;

    const headers = Array.from(table.querySelectorAll('thead th input')).map(input => input.value);
    const rooms = [];

    table.querySelectorAll('tbody tr').forEach(row => {
      const roomNumberInput = row.querySelector('td input[type="text"]');
      if (roomNumberInput && roomNumberInput.value) {
        const statuses = Array.from(row.querySelectorAll('select')).map(select => select.value);
        rooms.push({
          roomNumber: roomNumberInput.value,
          statuses: statuses
        });
      }
    });

    return { headers, rooms };
  }

  _addColumn() {
    const currentData = this._getApartmentDataFromTable();
    currentData.headers.push(new Date().toLocaleDateString('sv-SE'));
    currentData.rooms.forEach(room => room.statuses.push('未訪問'));
    this._renderApartmentTable(currentData);
  }

  _addRow() {
    const currentData = this._getApartmentDataFromTable();
    const newRoom = {
      roomNumber: '',
      statuses: Array(currentData.headers.length).fill('未訪問')
    };
    currentData.rooms.push(newRoom);
    this._renderApartmentTable(currentData);
  }

  _removeRow(rowIndex) {
    const currentData = this._getApartmentDataFromTable();
    currentData.rooms.splice(rowIndex, 1);
    this._renderApartmentTable(currentData);
  }

  _removeColumn(colIndex) {
    const currentData = this._getApartmentDataFromTable();
    currentData.headers.splice(colIndex, 1);
    currentData.rooms.forEach(room => room.statuses.splice(colIndex, 1));
    this._renderApartmentTable(currentData);
  }
}
