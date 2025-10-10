import L from 'leaflet';
import { saveToDrive, deleteFromDrive, loadAllDataByPrefix } from './google-drive.js';
import { showModal, reverseGeocode, isPointInPolygon, showToast } from './utils.js';
import { ApartmentEditor } from './apartment-editor.js';

// 通知用の外国語キーワードリスト
const FOREIGN_LANGUAGE_KEYWORDS = ['英語', '中国語', '韓国語', 'ベトナム語', 'タガログ語', 'ポルトガル語', 'ネパール語', 'インドネシア語', 'タイ語', 'スペイン語', 'ミャンマー語', '手話'];
const BOUNDARY_PREFIX = 'boundary_'; // MapManagerから直接参照できないため、ここで定義

export class MarkerManager {
  constructor(map, markerClusterGroup, mapManager) {
    this.map = map;
    this.markerClusterGroup = markerClusterGroup;
    this.mapManager = mapManager; // isMarkerEditMode を参照するために保持

    this.markers = {}; // { markerId: { marker, data } }
    this.apartmentEditor = new ApartmentEditor();
  }

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

  async renderAllFromDrive() {
    try {
      const allFiles = await loadAllDataByPrefix('');
      const driveMarkers = allFiles.filter(file => !file.name.startsWith(BOUNDARY_PREFIX));
      const markersData = driveMarkers.map(m => ({ address: m.name.replace('.json', ''), ...m.data }));
      
      this.renderAll(markersData);
    } catch (error) {
      showToast('マーカーデータの読み込みに失敗しました。', 'error');
    }
  }

  renderAll(markersData) {
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
    marker.bindPopup(() => this._generatePopupContent(markerId, this.markers[markerId]?.data || data));

    marker.on('click', (e) => {
      const currentData = this.markers[markerId]?.data;
      if (currentData && currentData.isApartment && !this.mapManager.isMarkerEditMode) {
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
      let updatedData;

      const status = document.getElementById(`status-${markerId}`).value;
      const memo = document.getElementById(`memo-${markerId}`).value;
      const cameraIntercom = document.getElementById(`cameraIntercom-${markerId}`).checked;
      const language = document.getElementById(`language-${markerId}`).value;
      const isApartment = document.getElementById(`isApartment-${markerId}`).checked;

      const saveButton = document.getElementById(`save-${markerId}`);
      if (saveButton) {
          saveButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 更新中...`;
          saveButton.disabled = true;
      }

      const finalStatus = isApartment ? '未訪問' : status;
      const finalLanguage = isApartment ? '未選択' : language;

      updatedData = { ...markerData.data, status: finalStatus, memo, cameraIntercom, language: finalLanguage, isApartment, updatedAt: new Date().toISOString() };

      await saveToDrive(address, updatedData);
      showToast('更新しました', 'success');

      this._updateMarkerState(markerData, updatedData);

      setTimeout(() => markerData.marker.closePopup(), 500);
      this._checkAndNotifyForSpecialNeeds(updatedData.language, updatedData.memo);
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
    let iconName = 'fa-house';
    let color = '#337ab7';

    if (isApartment) {
      iconName = 'fa-building';
      color = '#6f42c1';
      const iconHtml = `<div class="marker-icon-background"><i class="fa-solid ${iconName}" style="color: ${color};"></i></div>`;
      return L.divIcon({ html: iconHtml, className: 'custom-marker-icon', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
    }

    switch (status) {
      case '訪問済み': iconName = 'fa-house-circle-check'; color = '#5cb85c'; break;
      case '不在': iconName = 'fa-clock'; color = '#f0ad4e'; break;
      case 'new': iconName = 'fa-plus'; color = '#d9534f'; break;
      case '未訪問': default: break;
    }

    const iconHtml = `<div class="marker-icon-background"><i class="fa-solid ${iconName}" style="color: ${color};"></i></div>`;
    return L.divIcon({ html: iconHtml, className: 'custom-marker-icon', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
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
      if (isNew) return `<button id="save-${markerId}">保存</button><button id="cancel-${markerId}">キャンセル</button>`;
      if (isEditMode) return `<button id="save-${markerId}">保存</button><button id="delete-${markerId}">削除</button>`;
      return `<button id="save-${markerId}">保存</button>`;
    };

    const buttons = getPopupButtons(markerId, isNew, this.mapManager.isMarkerEditMode);

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

  _checkAndNotifyForSpecialNeeds(language, memo) {
    const needsNotification = language !== '未選択' || FOREIGN_LANGUAGE_KEYWORDS.some(keyword => memo.includes(keyword));
    if (needsNotification) {
      showToast('新しい情報の場合、区域担当者、または奉仕監督に報告をお願いします', 'info', 5000);
    }
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

  _openApartmentEditor(markerId) {
    const markerData = this.markers[markerId].data;

    const onSave = async (apartmentDetails) => {
      const updatedData = { ...markerData, apartmentDetails, updatedAt: new Date().toISOString() };
      await saveToDrive(markerData.address, updatedData);
      this._updateMarkerState(this.markers[markerId], updatedData);
      showToast('更新しました', 'success');
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
}