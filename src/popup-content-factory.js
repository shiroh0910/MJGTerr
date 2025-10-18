import { LANGUAGE_OPTIONS, VISIT_STATUSES } from './constants.js';

export class PopupContentFactory {
  constructor(isMarkerEditMode) {
    this.isMarkerEditMode = isMarkerEditMode;
  }

  create(markerId, data) {
    const { address, name, status, memo, isNew = false, cameraIntercom = false, language = '未選択', isApartment = false } = data;
    const title = isNew ? '新しい住所の追加' : (name || address);

    // '訪問拒否' の場合はドロップダウンに表示し、それ以外は除外する
    const statusOptionsList = status === '訪問拒否' ? ['訪問拒否'] : VISIT_STATUSES.filter(s => s !== '訪問拒否');
    const statusOptions = statusOptionsList.map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${s}</option>`).join('');

    const languageOptions = LANGUAGE_OPTIONS.map(lang => `<option value="${lang}" ${language === lang ? 'selected' : ''}>${lang}</option>`).join('');

    // 集合住宅、または訪問拒否の場合はドロップダウンを無効化
    const isRefused = status === '訪問拒否';
    const statusDisabled = isApartment || isRefused ? 'disabled' : '';
    const languageDisabled = isApartment || isRefused ? 'disabled' : '';

    const buttons = this._getButtons(markerId, isNew);

    const nameInputHtml = isNew ? `
      <div class="popup-field">
        <label for="name-${markerId}">名前:</label>
        <input type="text" id="name-${markerId}" value="${name || ''}">
      </div>` : '';
    const addressHtml = isNew ? `
      <div class="popup-field">
        <label for="address-${markerId}">住所:</label>
        <input type="text" id="address-${markerId}" value="${address || ''}">
      </div>` : `
      <div class="popup-field">
        <label>住所:</label>
        <span>${address}</span>
      </div>`;

    return `
      <div class="popup-container" id="popup-${markerId}">
        <div class="popup-header"><b>${title}</b></div>
        <div class="popup-body">
          ${nameInputHtml}
          ${addressHtml}
          <div class="popup-field-group">
            <label class="popup-checkbox-label"><input type="checkbox" id="isApartment-${markerId}" ${isApartment ? 'checked' : ''}> 集合住宅</label>
            <label class="popup-checkbox-label"><input type="checkbox" id="cameraIntercom-${markerId}" ${cameraIntercom ? 'checked' : ''}> カメラインターフォン</label>
          </div>
          <div class="popup-field"><label for="language-${markerId}">外国語・手話:</label><select id="language-${markerId}" ${languageDisabled}>${languageOptions}</select></div>
          <div class="popup-field"><label for="status-${markerId}">ステータス:</label><select id="status-${markerId}" ${statusDisabled}>${statusOptions}</select></div>
          <div class="popup-field"><label for="memo-${markerId}">メモ:</label><textarea id="memo-${markerId}">${memo || ''}</textarea></div>
        </div>
        <div class="popup-buttons">${buttons}</div>
      </div>
    `;
  }

  /**
   * ポップアップ内のボタンHTMLを生成する
   * @param {string} markerId
   * @param {boolean} isNew
   * @returns {string}
   * @private
   */
  _getButtons(markerId, isNew) {
    const { isApartment = false } = this.data || {};

    if (isNew) {
      return `<button id="save-${markerId}" class="popup-button button-primary"><i class="fa-solid fa-save"></i> 保存</button><button id="cancel-${markerId}" class="popup-button button-secondary"><i class="fa-solid fa-times"></i> キャンセル</button>`;
    }

    const cancelButton = `<button id="cancel-${markerId}" class="popup-button button-secondary"><i class="fa-solid fa-times"></i> キャンセル</button>`;

    if (this.isMarkerEditMode) { // 編集モード時
      const refuseButton = !isApartment ? `<button id="refuse-${markerId}" class="popup-button button-danger"><i class="fa-solid fa-ban"></i> 訪問拒否</button>` : '';
      return `<button id="save-${markerId}" class="popup-button button-primary"><i class="fa-solid fa-save"></i> 保存</button><button id="delete-${markerId}" class="popup-button button-warning"><i class="fa-solid fa-trash-can"></i> 削除</button>${refuseButton}${cancelButton}`;
    }
    // 閲覧モード時
    return `<button id="save-${markerId}" class="popup-button button-primary"><i class="fa-solid fa-save"></i> 保存</button>${cancelButton}`;
  }
}