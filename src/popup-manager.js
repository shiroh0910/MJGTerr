import { PopupContentFactory } from './popup-content-factory.js';
import { reverseGeocode } from './utils.js';
import { UI_TEXT } from './constants.js';

/**
 * マーカーのポップアップに関するUI操作とイベント処理を管理するクラス
 */
export class PopupManager {
  constructor(isEditMode, callbacks) {
    this.isEditMode = isEditMode;
    this.callbacks = callbacks; // { onSaveNew, onSaveEdit, onDelete, onOpenApartmentEditor }
    this.contentFactory = new PopupContentFactory(this.isEditMode);
  }

  /**
   * マーカーにポップアップをバインドし、イベントリスナーを設定する
   * @param {string} markerId
   * @param {L.Marker} marker
   * @param {object} data
   */
  bindPopupToMarker(markerId, marker, data) {
    marker.bindPopup(() => this.contentFactory.create(markerId, data));

    marker.on('click', (e) => {
      if (data.isApartment && !this.isEditMode) {
        L.DomEvent.stop(e);
        this.callbacks.onOpenApartmentEditor?.(markerId);
      }
    });

    marker.on('popupopen', () => this._onPopupOpen(markerId, marker, data));
  }

  /**
   * ポップアップが開かれた際のイベントハンドラ
   * @private
   */
  _onPopupOpen(markerId, marker, data) {
    const isNew = data.isNew || false;

    // イベントリスナーを設定
    document.getElementById(`save-${markerId}`)?.addEventListener('click', () => {
      const popupData = this._getDataFromPopup(markerId);
      if (isNew) {
        this.callbacks.onSaveNew?.(markerId, popupData);
      } else {
        this.callbacks.onSaveEdit?.(markerId, popupData);
      }
    });

    if (isNew) {
      document.getElementById(`cancel-${markerId}`)?.addEventListener('click', () => this.callbacks.onCancelNew?.(markerId));
      this._handleReverseGeocode(markerId, marker.getLatLng());
    } else {
      document.getElementById(`delete-${markerId}`)?.addEventListener('click', () => this.callbacks.onDelete?.(markerId, data.address));
    }

    this._setupApartmentCheckboxListener(markerId);
  }

  /**
   * ポップアップのフォームからデータを収集する
   * @private
   */
  _getDataFromPopup(markerId) {
    const getValue = (id) => document.getElementById(`${id}-${markerId}`)?.value;
    const getChecked = (id) => document.getElementById(`${id}-${markerId}`)?.checked;

    return {
      address: getValue('address'),
      name: getValue('name'),
      status: getValue('status'),
      memo: getValue('memo'),
      cameraIntercom: getChecked('cameraIntercom'),
      language: getValue('language'),
      isApartment: getChecked('isApartment'),
    };
  }

  /**
   * 「集合住宅」チェックボックスの連動処理を設定する
   * @private
   */
  _setupApartmentCheckboxListener(markerId) {
    const apartmentCheckbox = document.getElementById(`isApartment-${markerId}`);
    const statusSelect = document.getElementById(`status-${markerId}`);
    const languageSelect = document.getElementById(`language-${markerId}`);
    if (apartmentCheckbox && statusSelect && languageSelect) {
      apartmentCheckbox.addEventListener('change', (e) => {
        statusSelect.disabled = e.target.checked;
        languageSelect.disabled = e.target.checked;
      });
    }
  }

  /**
   * リバースジオコーディングを実行し、住所入力欄に結果を反映する
   * @private
   */
  async _handleReverseGeocode(markerId, latlng) {
    const addressInput = document.getElementById(`address-${markerId}`);
    try {
      const address = await reverseGeocode(latlng.lat, latlng.lng);
      if (addressInput) addressInput.value = address;
    } catch (error) {
      console.error("リバースジオコーディング失敗:", error);
      if (addressInput) addressInput.value = UI_TEXT.ADDRESS_FAILED;
    }
  }
}