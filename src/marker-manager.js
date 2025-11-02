import L from 'leaflet';
import { googleDriveService } from './google-drive-service.js';
import { showModal, isPointInPolygon, showToast } from './utils.js';
import { FOREIGN_LANGUAGE_KEYWORDS, BOUNDARY_PREFIX, FIXED_MARKER_STYLES, UI_TEXT, MARKER_ID_PREFIX_NEW, MARKER_ID_PREFIX_DRIVE, DEFAULT_VISIT_STATUSES, DEFAULT_PANEL_HEIGHT, NOTIFICATION_TOAST_DURATION } from './constants.js';
import { ApartmentEditor } from './apartment-editor.js';
import { PopupContentFactory } from './popup-content-factory.js';

export class MarkerManager {
  constructor(map, markerClusterGroup, mapManager, callbacks = {}) {
    this.map = map;
    this.markerClusterGroup = markerClusterGroup;
    this.mapManager = mapManager;
    this.markers = {}; // { markerId: { marker, data } }
    this.apartmentEditor = new ApartmentEditor();
    this.isEditMode = false; // 自身の状態として編集モードを管理
    // コールバックの初期化
    const defaultCallback = () => {};
    this.onMarkerLanguageChange = callbacks.onMarkerLanguageChange || defaultCallback;
    this.onMarkerRefused = callbacks.onMarkerRefused || defaultCallback;
    this.onApartmentRoomLanguageChange = callbacks.onApartmentRoomLanguageChange || defaultCallback;
    this.onApartmentRoomRefused = callbacks.onApartmentRoomRefused || defaultCallback;
    this.appSettings = {};
    this.visitStatuses = DEFAULT_VISIT_STATUSES;
  }

  setEditMode(isEditMode) {
    this.isEditMode = isEditMode;
  }

  setAppSettings(settings) {
    this.appSettings = settings;
    this.visitStatuses = settings.visitStatuses || DEFAULT_VISIT_STATUSES;
  }

  addNewMarker(latlng) {
    const markerId = `${MARKER_ID_PREFIX_NEW}${Date.now()}`;
    const marker = L.marker(latlng, { icon: this._createMarkerIcon('new'), opacity: this.appSettings.markerOpacity || 0.8 });
    const data = { address: null, name: '', status: '未訪問', memo: '', cameraIntercom: false, language: '未選択', isApartment: false };

    marker.customData = data;
    this.markers[markerId] = { marker, data };

    const initialPopupData = { ...this.markers[markerId].data, isNew: true, address: UI_TEXT.ADDRESS_LOADING };
    marker.bindPopup(() => this._generatePopupContent(markerId, initialPopupData));

    // 新規マーカー用のイベントハンドラ
    let saveNewHandler, cancelNewHandler, apartmentChangeHandler;

    marker.on('popupopen', () => {
      // ハンドラを定義
      saveNewHandler = () => this._saveNewMarker(markerId, latlng);
      cancelNewHandler = () => {
        // 新規マーカーのキャンセル時はマーカーを削除
        this._cancelNewMarker(markerId);
        // ポップアップは自動で閉じるので、手動で閉じる必要はない
      };
      apartmentChangeHandler = (e) => {
        const statusSelect = document.getElementById(`status-${markerId}`);
        const languageSelect = document.getElementById(`language-${markerId}`);
        if (statusSelect) statusSelect.disabled = e.target.checked;
        if (languageSelect) languageSelect.disabled = e.target.checked;
      };

      // リスナーを登録
      document.getElementById(`save-${markerId}`)?.addEventListener('click', saveNewHandler);
      document.getElementById(`cancel-${markerId}`)?.addEventListener('click', cancelNewHandler);
      const apartmentCheckbox = document.getElementById(`isApartment-${markerId}`);
      apartmentCheckbox?.addEventListener('change', apartmentChangeHandler);

      // パフォーマンス向上のため、リバースジオコーディングの代わりに画面左下の住所を使用する
      const currentAddressDisplay = document.getElementById('current-address-display');
      const addressInput = document.getElementById(`address-${markerId}`);
      if (addressInput && currentAddressDisplay) {
        const currentAddress = currentAddressDisplay.textContent;
        addressInput.value = (currentAddress && !currentAddress.includes('取得中')) ? currentAddress : UI_TEXT.ADDRESS_FAILED;
      }
    });

    // 新規マーカーのポップアップが閉じられたら（保存 or キャンセル）、リスナーをクリーンアップ
    marker.once('popupclose', () => {
      const saveBtn = document.getElementById(`save-${markerId}`);
      const cancelBtn = document.getElementById(`cancel-${markerId}`);
      const apartmentCheckbox = document.getElementById(`isApartment-${markerId}`);

      if (saveBtn && saveNewHandler) saveBtn.removeEventListener('click', saveNewHandler);
      if (cancelBtn && cancelNewHandler) cancelBtn.removeEventListener('click', cancelNewHandler);
      if (apartmentCheckbox && apartmentChangeHandler) apartmentCheckbox.removeEventListener('change', apartmentChangeHandler);
    });

    this.markerClusterGroup.addLayer(marker);
    marker.openPopup();
  }

  async _saveNewMarker(markerId, latlng) {
    const address = document.getElementById(`address-${markerId}`).value;
    const name = document.getElementById(`name-${markerId}`).value;
    const status = document.getElementById(`status-${markerId}`).value;
    const memo = document.getElementById(`memo-${markerId}`).value;
    const language = document.getElementById(`language-${markerId}`).value;
    let isApartment = document.getElementById(`isApartment-${markerId}`).checked;

    if (!address) return alert('住所を入力してください');

    const saveButton = document.getElementById(`save-${markerId}`);
    const cancelButton = document.getElementById(`cancel-${markerId}`);
    if (saveButton) {
      saveButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${UI_TEXT.SAVING}`;
      saveButton.disabled = true;
      if (cancelButton) cancelButton.disabled = true;
    }

    try {
      const finalStatus = isApartment ? '未訪問' : status;
      const finalLanguage = isApartment ? '未選択' : language;

      const initialSaveData = { address, lat: latlng.lat, lng: latlng.lng, status: finalStatus, memo, name, language: finalLanguage, isApartment };

      // 住所の重複をチェックし、一意のファイル名で保存する
      const finalSaveData = await googleDriveService.saveWithUniqueName(address, initialSaveData);
      
      const markerData = this.markers[markerId];
      markerData.data = finalSaveData;
      markerData.marker.customData = finalSaveData;
      markerData.marker.setIcon(this._createMarkerIcon(finalStatus, isApartment));

      this.markerClusterGroup.refreshClusters(markerData.marker);
      
      // ポップアップを閉じることで、popupcloseイベントが発火し、リスナーがクリーンアップされる
      // この時点で isNew フラグは false になっているので、次回ポップアップを開いた際には
      // _setupMarkerPopup のロジックが適用される
      markerData.marker.closePopup();

      // 最終利用日時を更新
      this.mapManager.saveUserSettings({ updatedAt: new Date().toISOString() });
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
      const allFiles = await googleDriveService.loadByPrefix('');
      const driveMarkers = allFiles.filter(file => !file.name.startsWith(BOUNDARY_PREFIX));
      const markersData = driveMarkers.map(m => ({ address: m.name.replace('.json', ''), ...m.data }));
      
      this.renderAll(markersData);
    } catch (error) {
      console.error(UI_TEXT.LOAD_MARKERS_ERROR, error);
      throw error; // エラーを呼び出し元に伝播させる
    }
  }

  renderAll(markersData) {
    this.markerClusterGroup.clearLayers();
    this.markers = {};
    markersData.forEach((data, index) => {
      if (data.lat && data.lng) {
        const markerId = `${MARKER_ID_PREFIX_DRIVE}${index}`;
        const marker = L.marker([data.lat, data.lng], { icon: this._createMarkerIcon(data.status, data.isApartment), opacity: this.appSettings.markerOpacity || 0.8 });
        marker.customData = data;
        this.markers[markerId] = { marker, data };
        this._setupMarkerPopup(markerId, marker, data);
        this.markerClusterGroup.addLayer(marker);
      }
    });
  }

  _setupMarkerPopup(markerId, marker, data) {
    // 既存のリスナーをすべて解除して、重複登録を防ぐ
    marker.off('popupopen');

    // ポップアップのコンテンツを動的に生成する
    marker.bindPopup(() => {
      const currentData = this.markers[markerId]?.data || data;
      return this._generatePopupContent(markerId, currentData);
    });

    marker.on('click', async (e) => {
      const currentData = this.markers[markerId]?.data;
      // 閲覧モードで集合住宅マーカーをクリックした場合、エディタを開く
      if (currentData && currentData.isApartment && !this.isEditMode) {
        L.DomEvent.stop(e);
        await this._openApartmentEditor(markerId);
      }
    });

    // イベントハンドラを保持するための変数を定義。popupopen/closeのスコープをまたいで利用する。
    let saveHandler, deleteHandler, refuseHandler, cancelHandler, apartmentChangeHandler;

    marker.on('popupopen', () => {
      const currentData = this.markers[markerId]?.data;
      // isNewがtrue、またはポップアップが何らかの理由で存在しない場合は何もしない
      // (新規マーカーのイベントはaddNewMarkerで管理されるため)
      if (!currentData || currentData.isNew) {
        return;
      }
      // ハンドラを定義
      saveHandler = () => this._saveEdit(markerId, data.address);
      deleteHandler = () => this._deleteMarker(markerId, data.address);
      refuseHandler = () => this._setRefuseStatus(markerId, data.address);
      cancelHandler = () => {
        // 既存マーカーのキャンセルはポップアップを閉じるだけ
        marker.closePopup();
      };
      apartmentChangeHandler = (e) => {
        const statusSelect = document.getElementById(`status-${markerId}`);
        const languageSelect = document.getElementById(`language-${markerId}`);
        const isDisabled = e.target.checked;
        if (statusSelect) statusSelect.disabled = isDisabled;
        if (languageSelect) languageSelect.disabled = isDisabled;
      };

      // イベントリスナーを登録
      document.getElementById(`save-${markerId}`)?.addEventListener('click', saveHandler);
      document.getElementById(`delete-${markerId}`)?.addEventListener('click', deleteHandler);
      document.getElementById(`refuse-${markerId}`)?.addEventListener('click', refuseHandler);
      document.getElementById(`cancel-${markerId}`)?.addEventListener('click', cancelHandler);

      const apartmentCheckbox = document.getElementById(`isApartment-${markerId}`);
      apartmentCheckbox?.addEventListener('change', apartmentChangeHandler);

      // ポップアップが閉じられたらリスナーをクリーンアップするイベントを一度だけ登録
      marker.once('popupclose', () => {
        // ここでDOM要素を再取得することが重要
        const saveBtn = document.getElementById(`save-${markerId}`);
        const deleteBtn = document.getElementById(`delete-${markerId}`);
        const refuseBtn = document.getElementById(`refuse-${markerId}`);
        const cancelBtn = document.getElementById(`cancel-${markerId}`);
        const apartmentCheckbox = document.getElementById(`isApartment-${markerId}`);
        
        if (saveBtn && saveHandler) saveBtn.removeEventListener('click', saveHandler);
        if (deleteBtn && deleteHandler) deleteBtn.removeEventListener('click', deleteHandler);
        if (refuseBtn && refuseHandler) refuseBtn.removeEventListener('click', refuseHandler);
        if (cancelBtn && cancelHandler) cancelBtn.removeEventListener('click', cancelHandler);
        if (apartmentCheckbox && apartmentChangeHandler) apartmentCheckbox.removeEventListener('change', apartmentChangeHandler);        
      });
    });
  }

  async _saveEdit(markerId, address) {
    try {
      const markerData = this.markers[markerId];
      const previousData = { ...markerData.data };

      let updatedData;

      const name = document.getElementById(`name-${markerId}`)?.value;
      const status = document.getElementById(`status-${markerId}`).value;
      const memo = document.getElementById(`memo-${markerId}`).value;
      const language = document.getElementById(`language-${markerId}`).value;
      const isApartment = document.getElementById(`isApartment-${markerId}`).checked;

      // 既に「訪問拒否」の場合はステータスを変更しない
      if (markerData.data.status === '訪問拒否') {
        updatedData = { ...markerData.data, name, memo, updatedAt: new Date().toISOString() };
        // この場合、isApartmentの変更も許可しない
      } else {

      const saveButton = document.getElementById(`save-${markerId}`);
      if (saveButton) {
          saveButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${UI_TEXT.UPDATING}`;
          saveButton.disabled = true;
      }

      const finalStatus = isApartment ? '未訪問' : status;
      const finalLanguage = isApartment ? '未選択' : language;

      updatedData = { ...markerData.data, name, status: finalStatus, memo, language: finalLanguage, isApartment, updatedAt: new Date().toISOString() };
      }

      await googleDriveService.save(address, updatedData);
      await showToast(UI_TEXT.UPDATE_SUCCESS, 'success');

      this._updateMarkerState(markerData, updatedData);
      markerData.marker.closePopup();

      // 言語が変更された場合にコールバックを呼び出す
      if (updatedData.language !== previousData.language) {
        this.onMarkerLanguageChange({
          markerId: markerId,
          markerAddress: address,
          oldLanguage: previousData.language || '未選択',
          newLanguage: updatedData.language || '未選択'
        });
      }

      // 最終利用日時を更新
      this.mapManager.saveUserSettings({ updatedAt: new Date().toISOString() });
    } catch (error) {
      showToast(UI_TEXT.UPDATE_ERROR, 'error');
    }
  }

  async _deleteMarker(markerId, address) {
    const confirmed = await showModal(`住所「${address}」を削除しますか？`);
    if (!confirmed) return;

    try {
      await googleDriveService.delete(address);

      if (this.markers[markerId]) {
        this.markerClusterGroup.removeLayer(this.markers[markerId].marker);
        delete this.markers[markerId];
        showToast(UI_TEXT.DELETE_SUCCESS, 'success');
        this._saveLastMapView();
      }
    } catch (error) {
      showToast(UI_TEXT.DELETE_ERROR, 'error');
    }
  }

  /**
   * マーカーを「訪問拒否」ステータスに設定する
   * @param {string} markerId 
   * @param {string} address 
   * @private
   */
  async _setRefuseStatus(markerId, address) {
    const confirmed = await showModal(`「${address}」を訪問拒否に設定しますか？<br>この操作は簡単には元に戻せません。`, { type: 'confirm' });
    if (!confirmed) return;

    try {
      const markerData = this.markers[markerId];
      const updatedData = { ...markerData.data, status: '訪問拒否', updatedAt: new Date().toISOString() };
      
      await googleDriveService.save(address, updatedData);
      this._updateMarkerState(markerData, updatedData);
      markerData.marker.closePopup();
      await showToast('訪問拒否に設定しました。', 'success');

      // 訪問拒否設定をレポートするコールバックを呼び出す
      this.onMarkerRefused({
        markerAddress: address
      });

      // 最終利用日時を更新
      this.mapManager.saveUserSettings({ updatedAt: new Date().toISOString() });
    } catch (error) {
      showToast('訪問拒否への変更に失敗しました。', 'error');
    }
  }

  _createMarkerIcon(status, isApartment = false) {
    if (isApartment) {
      const { icon: iconName, color } = FIXED_MARKER_STYLES.apartment;
      const iconHtml = `<div class="marker-icon-background"><i class="fa-solid ${iconName}" style="color: ${color};"></i></div>`;
      const size = this.appSettings.markerSize || 30;
      const anchor = size / 2;
      return L.divIcon({ html: iconHtml, className: 'custom-marker-icon marker-translucent', iconSize: [size, size], iconAnchor: [anchor, anchor], popupAnchor: [0, -anchor] });
    }

    if (status === 'new') {
      const { icon: iconName, color } = FIXED_MARKER_STYLES.new;
      const iconHtml = `<div class="marker-icon-background"><i class="fa-solid ${iconName}" style="color: ${color};"></i></div>`;
      const size = this.appSettings.markerSize || 30;
      const anchor = size / 2;
      return L.divIcon({ html: iconHtml, className: 'custom-marker-icon marker-translucent', iconSize: [size, size], iconAnchor: [anchor, anchor], popupAnchor: [0, -anchor] });
    }

    const style = this.visitStatuses.find(s => s.name === status) || this.visitStatuses[0];
    const { icon: iconName, color } = style;
    const iconHtml = `<div class="marker-icon-background"><i class="fa-solid ${iconName}" style="color: ${color};"></i></div>`;
    const size = this.appSettings.markerSize || 30;
    const anchor = size / 2;
    return L.divIcon({ html: iconHtml, className: 'custom-marker-icon marker-translucent', iconSize: [size, size], iconAnchor: [anchor, anchor], popupAnchor: [0, -anchor] });
  }

  _generatePopupContent(markerId, data) {
    const isAdmin = googleDriveService.isAdmin();
    const factory = new PopupContentFactory(this.isEditMode, isAdmin, this.visitStatuses);
    return factory.create(markerId, data);
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

      if (isInAnyBoundary && markerObj.data.status !== '未訪問' && markerObj.data.status !== '訪問拒否') {
        const updatedData = { ...markerObj.data, status: '未訪問' };
        this._updateMarkerState(markerObj, updatedData);
        updatePromises.push(googleDriveService.save(updatedData.address, updatedData));
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
  
  /**
   * 全てのマーカーのスタイル（不透明度とアイコン）を再適用する
   */
  updateAllMarkerStyles() {
    Object.values(this.markers).forEach(markerObj => {
      markerObj.marker.setOpacity(this.appSettings.markerOpacity || 0.8);
      markerObj.marker.setIcon(this._createMarkerIcon(markerObj.data.status, markerObj.data.isApartment));
    });
  }

  // 集合住宅エディタ
  async _openApartmentEditor(markerId) {
    const localMarkerData = this.markers[markerId].data;

    // 既にエディタが開いている場合は、一度閉じてから再度開く
    if (this.apartmentEditor.activeMarkerData) {
      await this.apartmentEditor.close();
    }

    this.mapManager.uiManager.toggleLoading(true, '集合住宅データを読込中...');

    let latestMarkerData;
    try {
      // パネルを開く直前にGoogle Driveから最新のデータを取得
      const dataFromDrive = await googleDriveService.loadByFilename(localMarkerData.address);
      if (dataFromDrive) {
        latestMarkerData = { ...localMarkerData, ...dataFromDrive };
        // メモリ上のデータも更新
        this._updateMarkerState(this.markers[markerId], latestMarkerData);
      } else {
        // Driveにファイルが存在しない場合（稀なケース）、ローカルのデータを正とする
        latestMarkerData = localMarkerData;
        showToast('Google Drive上でファイルが見つかりませんでした。ローカルデータを表示します。', 'warning');
      }
    } catch (error) {
      showToast('最新データの取得に失敗しました。ローカルのキャッシュデータを表示します。', 'error');
      latestMarkerData = localMarkerData; // エラー時はローカルデータでフォールバック
    } finally {
      this.mapManager.uiManager.toggleLoading(false);
    }

    const settings = this.mapManager.getUserSettings();
    const initialHeight = settings.apartmentEditorHeight || DEFAULT_PANEL_HEIGHT.APARTMENT_EDITOR;
    const isAdmin = googleDriveService.isAdmin();

    // 保存時の処理
    const onSave = async (apartmentDetails, changedRooms) => {
      const updatedData = { ...latestMarkerData, apartmentDetails, updatedAt: new Date().toISOString() };
      await googleDriveService.save(latestMarkerData.address, updatedData);

      // 部屋ごとの変更をレポートする
      changedRooms.forEach(room => {
        if (room.languageChanged) {
          this.onApartmentRoomLanguageChange({
            apartmentAddress: latestMarkerData.address,
            roomNumber: room.roomNumber,
            oldLanguage: room.oldLanguage,
            newLanguage: room.newLanguage
          });
        }
        if (room.refused) {
          this.onApartmentRoomRefused({ apartmentAddress: latestMarkerData.address, roomNumber: room.roomNumber });
        }
      });

      // 更新の通知
      this._updateMarkerState(this.markers[markerId], updatedData);
      showToast('更新しました', 'success');

      // 最終利用日時を更新
      this.mapManager.saveUserSettings({ updatedAt: new Date().toISOString() });
    };

    // 高さ変更時の処理
    const onHeightChange = (newHeight) => {
      this.mapManager.saveUserSettings({ apartmentEditorHeight: newHeight });
    };

    this.apartmentEditor.open(latestMarkerData, onSave, onHeightChange, initialHeight, isAdmin, this.visitStatuses, this.appSettings);
  }

  /**
   * 現在の地図の中心座標とズームレベルをユーザー設定として保存する
   * @private
   */
  _saveLastMapView() {
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    // 既存の設定とマージして保存
    this.mapManager.saveUserSettings({
      lastMapCenter: [center.lat, center.lng],
      lastMapZoom: zoom
    });
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
            // 部屋の最新ステータスを取得する
            // apartmentDetails.headers と room.statuses は対応している
            // headersを日付の降順でソートし、その最初の要素に対応するstatusを取得する
            const headers = data.apartmentDetails.headers || [];
            const statuses = room.statuses || [];
            
            const sortedIndices = Array.from(headers.keys()).sort((a, b) => {
              return String(headers[b]).localeCompare(String(headers[a]));
            });
            
            const latestStatusIndex = sortedIndices.length > 0 ? sortedIndices[0] : -1;
            const latestStatus = latestStatusIndex !== -1 && statuses[latestStatusIndex] ? statuses[latestStatusIndex] : '未訪問';

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