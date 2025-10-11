import L from 'leaflet';
import { saveToDrive, deleteFromDrive, loadAllDataByPrefix } from './google-drive.js';
import { showModal, reverseGeocode, isPointInPolygon, showToast } from './utils.js';
import { FOREIGN_LANGUAGE_KEYWORDS, BOUNDARY_PREFIX, MARKER_STYLES, UI_TEXT, MARKER_ID_PREFIX_NEW, MARKER_ID_PREFIX_DRIVE } from './constants.js';
import { ApartmentEditor } from './apartment-editor.js';
import { PopupContentFactory } from './popup-content-factory.js';

export class MarkerManager {
  constructor(map, markerClusterGroup, mapManager) {
    this.map = map;
    this.markerClusterGroup = markerClusterGroup;
    this.markers = {}; // { markerId: { marker, data } }
    this.apartmentEditor = new ApartmentEditor();
    this.isEditMode = false; // 自身の状態として編集モードを管理
  }

  setEditMode(isEditMode) {
    this.isEditMode = isEditMode;
  }

  addNewMarker(latlng) {
    const markerId = `${MARKER_ID_PREFIX_NEW}${Date.now()}`;
    const marker = L.marker(latlng, { icon: this._createMarkerIcon('new') });
    const data = { address: null, name: '', status: '未訪問', memo: '', cameraIntercom: false, language: '未選択', isApartment: false };

    marker.customData = data;
    this.markers[markerId] = { marker, data };

    const initialPopupData = { ...this.markers[markerId].data, isNew: true, address: UI_TEXT.ADDRESS_LOADING };
    marker.bindPopup(() => this._generatePopupContent(markerId, initialPopupData));

    marker.on('popupopen', () => {
      document.getElementById(`save-${markerId}`)?.addEventListener('click', () => this._saveNewMarker(markerId, latlng));
      document.getElementById(`cancel-${markerId}`)?.addEventListener('click', () => this._cancelNewMarker(markerId));

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
          if (addressInput) addressInput.value = UI_TEXT.ADDRESS_FAILED;
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

    const saveButton = document.getElementById(`save-${markerId}`);
    const cancelButton = document.getElementById(`cancel-${markerId}`);
    if (saveButton) {
      saveButton.innerHTML = UI_TEXT.SAVING_BUTTON_TEXT;
      saveButton.disabled = true;
      if (cancelButton) cancelButton.disabled = true;
    }

    try {
      const finalStatus = isApartment ? '未訪問' : status;
      const finalLanguage = isApartment ? '未選択' : language;

      const saveData = { address, lat: latlng.lat, lng: latlng.lng, status: finalStatus, memo, name, cameraIntercom, language: finalLanguage, isApartment };

      await saveToDrive(address, saveData);
      
      const markerData = this.markers[markerId];
      markerData.data = saveData;
      markerData.marker.customData = saveData;
      showToast(UI_TEXT.SAVE_SUCCESS, 'success');
      markerData.marker.setIcon(this._createMarkerIcon(finalStatus, isApartment));

      this.markerClusterGroup.refreshClusters(markerData.marker);
      
      setTimeout(() => {
        markerData.marker.closePopup();
        this._setupMarkerPopup(markerId, markerData.marker, markerData.data);
      }, 500);

      this._checkAndNotifyForSpecialNeeds(language, memo);
    } catch (error) {
      this.markerClusterGroup.removeLayer(this.markers[markerId].marker);
      delete this.markers[markerId];
      showToast(UI_TEXT.SAVE_ERROR, 'error');
    }
  }

  _cancelNewMarker(markerId) {
    if (this.markers[markerId]) {
      this.markerClusterGroup.removeLayer(this.markers[markerId].marker);
      delete this.markers[markerId];
    }
  }

  async renderAllFromDrive() {
    try {
      const allFiles = await loadAllDataByPrefix('');
      const driveMarkers = allFiles.filter(file => !file.name.startsWith(BOUNDARY_PREFIX));
      const markersData = driveMarkers.map(m => ({ address: m.name.replace('.json', ''), ...m.data }));
      
      this.renderAll(markersData);
    } catch (error) {
      showToast(UI_TEXT.LOAD_MARKERS_ERROR, 'error');
    }
  }

  renderAll(markersData) {
    this.markerClusterGroup.clearLayers();
    this.markers = {};
    markersData.forEach((data, index) => {
      if (data.lat && data.lng) {
        const markerId = `${MARKER_ID_PREFIX_DRIVE}${index}`;
        const marker = L.marker([data.lat, data.lng], { icon: this._createMarkerIcon(data.status, data.isApartment) });
        marker.customData = data;
        this.markers[markerId] = { marker, data };
        this._setupMarkerPopup(markerId, marker, data);
        this.markerClusterGroup.addLayer(marker);
      }
    });
  }

  _setupMarkerPopup(markerId, marker, data) {
    marker.bindPopup(() => this._generatePopupContent(markerId, this.markers[markerId]?.data || data, this.isEditMode));

    marker.on('click', (e) => {
      const currentData = this.markers[markerId]?.data;
      if (currentData && currentData.isApartment && !this.isEditMode) {
        L.DomEvent.stop(e);
        this._openApartmentEditor(markerId);
      }
    });

    marker.on('popupopen', () => {
      document.getElementById(`save-${markerId}`)?.addEventListener('click', () => this._saveEdit(markerId, data.address));
      document.getElementById(`delete-${markerId}`)?.addEventListener('click', () => this._deleteMarker(markerId, data.address));
      
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
      const previousData = { ...markerData.data };

      let updatedData;

      const status = document.getElementById(`status-${markerId}`).value;
      const memo = document.getElementById(`memo-${markerId}`).value;
      const cameraIntercom = document.getElementById(`cameraIntercom-${markerId}`).checked;
      const language = document.getElementById(`language-${markerId}`).value;
      const isApartment = document.getElementById(`isApartment-${markerId}`).checked;

      const saveButton = document.getElementById(`save-${markerId}`);
      if (saveButton) {
          saveButton.innerHTML = UI_TEXT.UPDATING_BUTTON_TEXT;
          saveButton.disabled = true;
      }

      const finalStatus = isApartment ? '未訪問' : status;
      const finalLanguage = isApartment ? '未選択' : language;

      updatedData = { ...markerData.data, status: finalStatus, memo, cameraIntercom, language: finalLanguage, isApartment, updatedAt: new Date().toISOString() };

      await saveToDrive(address, updatedData);
      showToast(UI_TEXT.UPDATE_SUCCESS, 'success');

      this._updateMarkerState(markerData, updatedData);

      setTimeout(() => markerData.marker.closePopup(), 500);

      // 言語が「未選択」から変更された場合、またはメモにキーワードが含まれる場合に通知
      const languageAdded = previousData.language === '未選択' && updatedData.language !== '未選択';
      const languageRemoved = previousData.language !== '未選択' && updatedData.language === '未選択';
      const memoHasKeyword = FOREIGN_LANGUAGE_KEYWORDS.some(keyword => updatedData.memo.includes(keyword));

      if (languageAdded || memoHasKeyword) {
        setTimeout(() => {
          this._checkAndNotifyForSpecialNeeds();
        }, 1600); // 1.6秒後
      } else if (languageRemoved) {
        setTimeout(() => {
          this._checkAndNotifyForLanguageRemoval();
        }, 1600);
      }
    } catch (error) {
      showToast(UI_TEXT.UPDATE_ERROR, 'error');
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
        showToast(UI_TEXT.DELETE_SUCCESS, 'success');
      }
    } catch (error) {
      showToast(UI_TEXT.DELETE_ERROR, 'error');
    }
  }

  _createMarkerIcon(status, isApartment = false) {
    if (isApartment) {
      const { icon: iconName, color } = MARKER_STYLES.apartment;
      const iconHtml = `<div class="marker-icon-background"><i class="fa-solid ${iconName}" style="color: ${color};"></i></div>`;
      return L.divIcon({ html: iconHtml, className: 'custom-marker-icon', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
    }

    const style = MARKER_STYLES[status] || MARKER_STYLES['未訪問'];
    const { icon: iconName, color } = style;
    const iconHtml = `<div class="marker-icon-background"><i class="fa-solid ${iconName}" style="color: ${color};"></i></div>`;
    return L.divIcon({ html: iconHtml, className: 'custom-marker-icon', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
  }

  _generatePopupContent(markerId, data, isEditMode) {
    const factory = new PopupContentFactory(isEditMode);
    return factory.create(markerId, data);
  }

  // 言語追加通知
  _checkAndNotifyForSpecialNeeds() {
    showToast('言語の情報が追加されました。区域担当者か奉仕監督までお知らせください', 'info', 5000);
  }

  // 言語削除通知
  _checkAndNotifyForLanguageRemoval() {    
    showToast('言語の情報が削除されました。区域担当者か奉仕監督までお知らせください', 'info', 5000);
  }

  filterByBoundaries(boundaryLayers) {
    this.markerClusterGroup.clearLayers();
    const allMarkers = Object.values(this.markers);

    if (!boundaryLayers || boundaryLayers.length === 0) {
      allMarkers.forEach(markerObj => this.markerClusterGroup.addLayer(markerObj.marker));
      return;
    }

    const boundaryVerticesList = boundaryLayers.map(layer => layer.toGeoJSON().features[0].geometry.coordinates[0]);

    allMarkers.forEach(markerObj => {
      const markerLatLng = markerObj.marker.getLatLng();
      const point = [markerLatLng.lng, markerLatLng.lat];
      const isInAnyBoundary = boundaryVerticesList.some(vertices => isPointInPolygon(point, vertices));
      if (isInAnyBoundary) {
        this.markerClusterGroup.addLayer(markerObj.marker);
      }
    });
  }

  async resetInBoundaries(boundaryLayers) {
    if (!boundaryLayers || boundaryLayers.length === 0) {
      throw new Error('リセット対象の区域が指定されていません。');
    }

    const boundaryVerticesList = boundaryLayers.map(layer => layer.toGeoJSON().features[0].geometry.coordinates[0]);
    const allMarkers = Object.values(this.markers);
    const updatePromises = [];

    allMarkers.forEach(markerObj => {
      const markerLatLng = markerObj.marker.getLatLng();
      const point = [markerLatLng.lng, markerLatLng.lat];
      const isInAnyBoundary = boundaryVerticesList.some(vertices => isPointInPolygon(point, vertices));

      if (isInAnyBoundary && markerObj.data.status !== '未訪問') {
        const updatedData = { ...markerObj.data, status: '未訪問' };
        this._updateMarkerState(markerObj, updatedData);
        updatePromises.push(saveToDrive(updatedData.address, updatedData));
      }
    });

    await Promise.all(updatePromises);
  }

  _updateMarkerState(markerObj, updatedData) {
    markerObj.data = updatedData;
    markerObj.marker.customData = updatedData;
    markerObj.marker.setIcon(this._createMarkerIcon(updatedData.status, updatedData.isApartment));
    this.markerClusterGroup.refreshClusters(markerObj.marker);
  }

  // 集合住宅エディタ
  _openApartmentEditor(markerId) {
    const markerData = this.markers[markerId].data;
    // 保存時の処理
    const onSave = async (apartmentDetails, changedRooms) => {
      const updatedData = { ...markerData, apartmentDetails, updatedAt: new Date().toISOString() };
      await saveToDrive(markerData.address, updatedData);

      // 通知する条件：言語が変更された、またはメモに言語キーワードがある
      const needsAddNotification = changedRooms.some(room => {
        const memoHasKeyword = FOREIGN_LANGUAGE_KEYWORDS.some(keyword => room.memo.includes(keyword));
        return room.languageAdded || memoHasKeyword;
      });
      const needsRemoveNotification = changedRooms.some(room => room.languageRemoved);

      // 更新の通知
      this._updateMarkerState(this.markers[markerId], updatedData);
      showToast('更新しました', 'success');

      // 言語情報の通知を表示
      if (needsAddNotification) {
        setTimeout(() => this._checkAndNotifyForSpecialNeeds(), 1600);
      } else if (needsRemoveNotification) {
        setTimeout(() => this._checkAndNotifyForLanguageRemoval(), 1600);
      }
    };

    this.apartmentEditor.open(markerData, onSave);
  }

  forcePopupUpdate() {
    Object.values(this.markers).forEach(markerObj => {
      if (markerObj.marker.isPopupOpen()) {
        markerObj.marker.closePopup();
        markerObj.marker.openPopup();
      }
    });
  }

  /**
   * すべてのマーカーの生データを配列で返す
   * @returns {Array<object>}
   */
  getAllMarkersData() {
    return Object.values(this.markers).map(markerObj => markerObj.data);
  }

  /**
   * 指定されたフィルター条件に基づいてマーカーデータをCSV文字列として生成する
   * @param {Array<object>} allMarkersData - すべてのマーカーデータ
   * @param {object} filters - { areaNumbers: string[], keyword: string }
   * @param {Map<string, object>} boundaryPolygons - 区域番号をキーとする境界ポリゴンレイヤーのマップ
   * @returns {string} CSV形式の文字列
   * @returns {{csvContent: string, rowCount: number}} CSVコンテンツと行数
   */
  generateCsv(allMarkersData, filters, boundaryPolygons) {
    const { areaNumbers, statuses, language, keyword } = filters;

    const escapeCsv = (str) => `"${(str || '').replace(/"/g, '""')}"`;

    const initialFilteredData = allMarkersData.filter(data => {
      // 区域フィルター (区域指定がない場合は全件対象)
      if (areaNumbers.length === 0) return true;

      const markerLatLng = L.latLng(data.lat, data.lng);
      const point = [markerLatLng.lng, markerLatLng.lat];
      return areaNumbers.some(areaNum => {
        const polygon = boundaryPolygons.get(areaNum);
        if (!polygon) return false;
        const vertices = polygon.toGeoJSON().features[0].geometry.coordinates[0];
        return isPointInPolygon(point, vertices);
      });
    });

    // CSVヘッダー
    const header = ['区域番号', '住所', '名前', 'ステータス', '言語', 'メモ', '最終更新日'];
    const csvRows = [];

    // CSV行データ
    initialFilteredData.forEach(data => {
      const areaNumber = this._findAreaNumberForMarker(data, boundaryPolygons);
      const updatedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleString('ja-JP') : '';

      if (data.isApartment && data.apartmentDetails?.rooms) {
        // 集合住宅の場合は、部屋ごとに言語とキーワードのフィルターを適用する
        const filteredRooms = data.apartmentDetails.rooms.filter(room => {
          const languageMatch = !language || room.language === language;
          const statusMatch = statuses.length === 0 || room.statuses.some(s => statuses.includes(s));
          const keywordMatch = !keyword || (room.memo && room.memo.includes(keyword));
          return languageMatch && statusMatch && keywordMatch;
        });

        if (filteredRooms.length > 0) {
          filteredRooms.forEach(room => {
            // 部屋の最新ステータスを取得 (訪問履歴の最後のもの)
            const latestStatus = room.statuses.length > 0 ? room.statuses[room.statuses.length - 1] : '未訪問';
            csvRows.push({
              areaNumber: areaNumber,
              address: data.address,
              name: `${data.name || ''} ${room.roomNumber}号室`,
              status: latestStatus,
              language: room.language === '未選択' ? '' : room.language,
              memo: room.memo,
              updatedAt: updatedAt
            });
          });
        }
      } else {
        // 戸建て住宅の場合は、ここで言語とキーワードのフィルターを適用する
        const languageMatch = !language || data.language === language;
        const statusMatch = statuses.length === 0 || statuses.includes(data.status);
        const keywordMatch = !keyword || (data.memo && data.memo.includes(keyword));

        if (languageMatch && statusMatch && keywordMatch) {
          csvRows.push({
            areaNumber: areaNumber,
            address: data.address,
            name: data.name,
            status: data.status,
            language: data.language === '未選択' ? '' : data.language,
            memo: data.memo,
            updatedAt: updatedAt
          });
        }
      }
    });

    // 区域番号と住所でソート
    csvRows.sort((a, b) => {
      if (a.areaNumber < b.areaNumber) return -1;
      if (a.areaNumber > b.areaNumber) return 1;
      if (a.address < b.address) return -1;
      if (a.address > b.address) return 1;
      return 0;
    });

    // ソートされたデータから最終的なCSV文字列を生成
    const finalRows = csvRows.map(row => 
      [row.areaNumber, row.address, row.name, row.status, row.language, row.memo, row.updatedAt].map(escapeCsv).join(',')
    );

    return {
      csvContent: [header.join(','), ...finalRows].join('\n'),
      rowCount: csvRows.length
    };
  }

  _findAreaNumberForMarker(markerData, boundaryPolygons) {
    const markerLatLng = L.latLng(markerData.lat, markerData.lng);
    const point = [markerLatLng.lng, markerLatLng.lat];
    for (const [areaNum, polygon] of boundaryPolygons.entries()) {
      const vertices = polygon.toGeoJSON().features[0].geometry.coordinates[0];
      if (isPointInPolygon(point, vertices)) {
        return areaNum;
      }
    }
    return '';
  }
}