import { LANGUAGE_OPTIONS, VISIT_STATUSES } from './constants.js';

export class PopupContentFactory {
  constructor(isMarkerEditMode, isAdmin) {
    this.isMarkerEditMode = isMarkerEditMode;
    this.isAdmin = isAdmin; 
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

    // 編集モードでない、または管理者でない場合は集合住宅チェックボックスを無効化
    const apartmentCheckboxDisabled = this.isAdmin ? '' : 'disabled';

    const buttons = this._getButtons(markerId, isNew);

    // isNew（新規作成時）または isMarkerEditMode（編集モード時）の場合に名前の入力欄を表示
    const nameInputHtml = (isNew || this.isMarkerEditMode) ? `
      <div class="popup-field">
        <label for="name-${markerId}">名前:</label>
        <input type="text" id="name-${markerId}" value="${name || ''}">
      </div>` : (name ? `
      <div class="popup-field">
        <label>名前:</label>
        <span>${name}</span>
      </div>` : ''); // 閲覧モードで名前がある場合のみ表示

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
            <label class="popup-checkbox-label"><input type="checkbox" id="isApartment-${markerId}" ${isApartment ? 'checked' : ''} ${!this.isMarkerEditMode || !this.isAdmin ? 'disabled' : ''}> 集合住宅</label>
            <label class="popup-checkbox-label"><input type="checkbox" id="cameraIntercom-${markerId}" ${cameraIntercom ? 'checked' : ''} ${!this.isMarkerEditMode ? 'disabled' : ''}> カメラインターフォン</label>
          </div>
          <div class="popup-field"><label for="language-${markerId}">外国語・手話:</label><select id="language-${markerId}" ${languageDisabled} ${!this.isMarkerEditMode ? 'disabled' : ''}>${languageOptions}</select></div>
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
    if (isNew) {
      return `<button id="save-${markerId}" class="popup-button button-primary"><i class="fa-solid fa-save"></i> 保存</button><button id="cancel-${markerId}" class="popup-button button-secondary"><i class="fa-solid fa-times"></i> キャンセル</button>`;
    }

    // 閲覧モードではボタンを表示しない
    if (!this.isMarkerEditMode) {
      return `<button id="cancel-${markerId}" class="popup-button button-secondary"><i class="fa-solid fa-times"></i> 閉じる</button>`;
    }

    // --- 以下、編集モードの場合 ---
    const saveButton = `<button id="save-${markerId}" class="popup-button button-primary"><i class="fa-solid fa-save"></i> 保存</button>`;
    const cancelButton = `<button id="cancel-${markerId}" class="popup-button button-secondary"><i class="fa-solid fa-times"></i> キャンセル</button>`;
    
    if (this.isAdmin) {
      const deleteButton = `<button id="delete-${markerId}" class="popup-button button-warning"><i class="fa-solid fa-trash-can"></i> 削除</button>`;
      const refuseButton = `<button id="refuse-${markerId}" class="popup-button button-danger"><i class="fa-solid fa-ban"></i> 訪問拒否</button>`;
      return `${saveButton}${deleteButton}${refuseButton}${cancelButton}`;
    }
    return `${saveButton}${cancelButton}`;
  }
}