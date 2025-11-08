import { LANGUAGE_OPTIONS, DEFAULT_VISIT_STATUSES } from './constants.js';

export class PopupContentFactory {
  constructor(isMarkerEditMode, isAdmin, visitStatuses) {
    this.isMarkerEditMode = isMarkerEditMode;
    this.isAdmin = isAdmin; 
    this.visitStatuses = visitStatuses || DEFAULT_VISIT_STATUSES;
  }

  create(markerId, data) {
    const { address, name, status, memo, isNew = false, cameraIntercom = false, language = '未選択', isApartment = false } = data;
    const title = isNew ? '新しい住所の追加' : (name || address);

    // --- ヘッダーのスタイルを決定 ---
    let headerStyle = '';
    // 新規作成時は'未訪問'、集合住宅の場合は'集合住宅'のスタイルを適用
    const statusForStyle = isNew ? '未訪問' : (isApartment ? '集合住宅' : status);
    const statusStyle = this.visitStatuses.find(s => s.name === statusForStyle);

    if (statusStyle) {
      const bgColor = statusStyle.color;
      // 背景色の輝度から適切な文字色（白か黒か）を決定する
      const getTextColor = (hexcolor) => {
        const r = parseInt(hexcolor.substr(1, 2), 16);
        const g = parseInt(hexcolor.substr(3, 2), 16);
        const b = parseInt(hexcolor.substr(5, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? '#333' : '#fff';
      };
      headerStyle = `style="background-color: ${bgColor}; color: ${getTextColor(bgColor)};"`;
    }

    // 閲覧モードかどうかを判定 (新規作成時は常に編集モードとみなす)
    const isViewMode = !this.isMarkerEditMode && !isNew;

    // '訪問拒否' の場合はドロップダウンにその選択肢のみ表示し、それ以外は '訪問拒否' を除外する
    const statusOptionsList = status === '訪問拒否'
      ? this.visitStatuses.filter(s => s.name === '訪問拒否')
      : this.visitStatuses.filter(s => s.name !== '訪問拒否');
    const statusOptions = statusOptionsList.map(s => `<option value="${s.name}" ${status === s.name ? 'selected' : ''}>${s.name}</option>`).join('');

    const languageOptions = LANGUAGE_OPTIONS.map(lang => `<option value="${lang}" ${language === lang ? 'selected' : ''}>${lang}</option>`).join('');

    // 集合住宅、または訪問拒否の場合はドロップダウンを無効化
    const isRefused = status === '訪問拒否';
    const statusDisabled = isApartment || isRefused || isViewMode ? 'disabled' : '';
    const languageDisabled = isApartment || isRefused || isViewMode ? 'disabled' : '';

    // 編集モードでない、または管理者でない場合は集合住宅チェックボックスを無効化（閲覧モードでも編集不可）
    const apartmentCheckboxDisabled = isViewMode || !this.isAdmin ? 'disabled' : '';

    const buttons = this._getButtons(markerId, isNew, data, isViewMode);

    // --- フィールドのHTMLを生成 ---
    let nameFieldHtml, addressFieldHtml, statusFieldHtml, languageFieldHtml, memoFieldHtml;

    if (isViewMode) {
      // --- 閲覧モードのHTML ---
      nameFieldHtml = name ? `<div class="popup-field"><label>名前:</label><span>${name}</span></div>` : '';
      addressFieldHtml = `<div class="popup-field"><label>住所:</label><span>${address}</span></div>`;
      languageFieldHtml = `<div class="popup-field" style="flex: 1;"><label>外国語・手話:</label><span>${language}</span></div>`;
      statusFieldHtml = `<div class="popup-field" style="flex: 1;"><label>ステータス:</label><span>${status}</span></div>`;
      // メモの内容を安全に表示するために、HTMLエスケープを行う
      const escapedMemo = memo ? memo.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
      memoFieldHtml = `<div class="popup-field"><label>メモ:</label><div class="popup-memo-view">${escapedMemo.replace(/\n/g, '<br>')}</div></div>`;
    } else {
      // --- 編集モードのHTML ---
      nameFieldHtml = `
        <div class="popup-field">
          <label for="name-${markerId}">名前:</label>
          <input type="text" id="name-${markerId}" value="${name || ''}">
        </div>`;
      addressFieldHtml = isNew ? `
        <div class="popup-field">
          <label for="address-${markerId}">住所:</label>
          <input type="text" id="address-${markerId}" value="${address || ''}">
        </div>` : `
        <div class="popup-field">
          <label>住所:</label>
          <span>${address}</span>
        </div>`;
      languageFieldHtml = `<div class="popup-field" style="flex: 1;"><label for="language-${markerId}">外国語・手話:</label><select id="language-${markerId}" ${languageDisabled}>${languageOptions}</select></div>`;
      statusFieldHtml = `<div class="popup-field" style="flex: 1;"><label for="status-${markerId}">ステータス:</label><select id="status-${markerId}" ${statusDisabled}>${statusOptions}</select></div>`;
      memoFieldHtml = `
        <div class="popup-field">
          <label for="memo-${markerId}">メモ: (個人情報は記入しないでください)</label>
          <textarea id="memo-${markerId}">${memo || ''}</textarea>
        </div>`;
    }

    return `
      <div class="popup-container" id="popup-${markerId}">
        <div class="popup-header" ${headerStyle}><b>${title}</b></div>
        <div class="popup-body">
          ${nameFieldHtml}
          ${addressFieldHtml}
          <div class="popup-field">
            <label class="popup-checkbox-label"><input type="checkbox" id="isApartment-${markerId}" ${isApartment ? 'checked' : ''} ${apartmentCheckboxDisabled}> 集合住宅</label>           
          </div>
          <div class="popup-field-row">
            ${languageFieldHtml}
            ${statusFieldHtml}
          </div>
          ${memoFieldHtml}
        </div>
        <div class="popup-buttons">${buttons}</div>
      </div>
    `;
  }

  /**
   * ポップアップ内のボタンHTMLを生成する
   * @param {string} markerId
   * @param {boolean} isNew
   * @param {object} data マーカーデータ
   * @returns {string}
   * @private
   */
  _getButtons(markerId, isNew, data, isViewMode) {
    // 閲覧モードの場合はボタンを表示しない
    if (isViewMode) {
      return '';
    }
    if (isNew) {
      return `<button id="save-${markerId}" class="popup-button button-primary"><i class="fa-solid fa-save"></i> 保存</button><button id="cancel-${markerId}" class="popup-button button-secondary"><i class="fa-solid fa-times"></i> キャンセル</button>`;
    }
 
    const saveButton = `<button id="save-${markerId}" class="popup-button button-primary"><i class="fa-solid fa-save"></i> 保存</button>`;
    const cancelButton = `<button id="cancel-${markerId}" class="popup-button button-secondary"><i class="fa-solid fa-times"></i> キャンセル</button>`;
    
    // 編集モードかつ管理者の場合のみ、追加のボタンを表示（isViewModeは既にfalse）
    if (this.isAdmin) {
      const deleteButton = `<button id="delete-${markerId}" class="popup-button button-danger"><i class="fa-solid fa-trash-can"></i> 削除</button>`;
      const refuseButton = `<button id="refuse-${markerId}" class="popup-button button-danger"><i class="fa-solid fa-ban"></i> 訪問拒否</button>`;
      return `${saveButton}${deleteButton}${refuseButton}${cancelButton}`;
    }

    // 閲覧モード、または一般ユーザーの編集モードの場合
    return `${saveButton}${cancelButton}`;
  }
}