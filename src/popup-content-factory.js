import { LANGUAGE_OPTIONS, VISIT_STATUSES } from './constants.js';

export class PopupContentFactory {
  constructor(isMarkerEditMode) {
    this.isMarkerEditMode = isMarkerEditMode;
  }

  create(markerId, data) {
    const { address, name, status, memo, isNew = false, cameraIntercom = false, language = '未選択', isApartment = false } = data;
    const title = isNew ? '新しい住所の追加' : (name || address);
    const statusOptions = VISIT_STATUSES.map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${s}</option>`).join('');
    const languageOptions = LANGUAGE_OPTIONS.map(lang => `<option value="${lang}" ${language === lang ? 'selected' : ''}>${lang}</option>`).join('');
    const statusDisabled = isApartment ? 'disabled' : '';
    const languageDisabled = isApartment ? 'disabled' : '';

    const buttons = this._getButtons(markerId, isNew);

    const nameInput = isNew ? `名前: <input type="text" id="name-${markerId}" value="${name || ''}"><br>` : '';
    const addressInput = isNew ? `<input type="text" id="address-${markerId}" value="${address || ''}">` : address;

    return `
      <div id="popup-${markerId}">
        <b>${title}</b><br>
        ${nameInput}
        住所: ${addressInput}<br>
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
   * ポップアップ内のボタンHTMLを生成する
   * @param {string} markerId
   * @param {boolean} isNew
   * @returns {string}
   * @private
   */
  _getButtons(markerId, isNew) {
    if (isNew) {
      return `<button id="save-${markerId}">保存</button><button id="cancel-${markerId}">キャンセル</button>`;
    }
    if (this.isMarkerEditMode) {
      return `<button id="save-${markerId}">保存</button><button id="delete-${markerId}">削除</button>`;
    }
    // 編集モードOFFでもステータス・メモは保存可能
    return `<button id="save-${markerId}">保存</button>`;
  }
}