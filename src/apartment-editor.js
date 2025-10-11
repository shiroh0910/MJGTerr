import { LANGUAGE_OPTIONS, VISIT_STATUSES, UI_TEXT } from './constants.js';
import { BasePanel } from './panels/base-panel.js';

export class ApartmentEditor extends BasePanel {
  constructor() {
    super('apartment-editor');
    this.onSave = null;
    this.activeMarkerData = null;
  }

  open(markerData, onSaveCallback, onHeightChange, initialHeight) {
    super.open(initialHeight);

    this.activeMarkerData = markerData;
    this.onSave = onSaveCallback;
    this.onHeightChange = onHeightChange;

    this.elements.title.textContent = markerData.name || markerData.address;
    this._renderTable(markerData.apartmentDetails);
  }

  close() {
    super.close();
    this.activeMarkerData = null;
    this.onSave = null;
  }

  async _handleSave() {
    if (!this.onSave) return;

    const apartmentDetails = this._getApartmentDataFromTable();
    const previousRooms = this.activeMarkerData.apartmentDetails?.rooms || [];

    // 言語が「未選択」から変更された部屋を特定する
    const changedRooms = apartmentDetails.rooms.map(currentRoom => {
      const previousRoom = previousRooms.find(pr => pr.roomNumber === currentRoom.roomNumber);
      // 新規追加された部屋で、言語が「未選択」以外に設定された場合も変更とみなす
      const languageAdded = previousRoom
        ? previousRoom.language === '未選択' && currentRoom.language !== '未選択' // 既存の部屋
        : currentRoom.language !== '未選択'; // 新規の部屋
      const languageRemoved = previousRoom
        ? previousRoom.language !== '未選択' && currentRoom.language === '未選択'
        : false;

      return { ...currentRoom, languageAdded, languageRemoved };
    });

    this.elements.saveButton.innerHTML = UI_TEXT.SAVING_BUTTON_TEXT;
    this.elements.saveButton.disabled = true;

    try {
      // 変更情報を onSave コールバックに渡す
      await this.onSave(apartmentDetails, changedRooms);
      this.close();
    } catch (error) {
      // エラー表示は呼び出し元で行う
    } finally {
      this.elements.saveButton.innerHTML = UI_TEXT.SAVE_BUTTON_TEXT;
      this.elements.saveButton.disabled = false;
    }
  }

  _renderTable(details) {
    const statusOptionsHtml = VISIT_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');
    const languageOptionsHtml = LANGUAGE_OPTIONS.map(lang => `<option value="${lang}">${lang}</option>`).join('');

    let headers = details?.headers || [new Date().toLocaleDateString('sv-SE')];
    let rooms = details?.rooms || [{ roomNumber: '101', language: '未選択', memo: '', statuses: ['未訪問'] }, { roomNumber: '102', language: '未選択', memo: '', statuses: ['未訪問'] }];

    // ヘッダー（日付）を新しい順（降順）にソートするための準備
    const sortedIndices = Array.from(headers.keys()).sort((a, b) => {
      // 日付文字列として比較し、新しいものが先に来るようにする
      return String(headers[b]).localeCompare(String(headers[a]));
    });

    // ソートされた順序に基づいてヘッダーと各部屋のステータスを再構築
    const sortedHeaders = sortedIndices.map(i => headers[i]);
    const sortedRooms = rooms.map(room => ({ ...room, statuses: sortedIndices.map(i => room.statuses[i]) }));


    const table = document.createElement('table');
    table.className = 'apartment-table';
    table.id = 'apartment-data-table';

    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    headerRow.innerHTML = `<th>部屋番号</th><th>言語</th><th>メモ</th>`;
    sortedHeaders.forEach((header, colIndex) => {
      const th = document.createElement('th');
      th.className = 'date-header-cell';
      th.innerHTML = `
        <div class="date-header-cell-content">
          <input type="text" value="${header}">
          <button class="remove-column-btn" data-col-index="${colIndex}">&times;</button>
        </div>`;
      headerRow.appendChild(th);
    });
    headerRow.innerHTML += `<th class="control-cell"><button id="add-column-btn" title="${UI_TEXT.TITLE_ADD_COLUMN}">+</button></th>`;

    const tbody = table.createTBody();
    sortedRooms.forEach((room, rowIndex) => {
      const row = tbody.insertRow();

      // 部屋番号セル
      const roomNumberCell = row.insertCell();
      roomNumberCell.innerHTML = `<input type="text" value="${room.roomNumber || ''}" placeholder="${UI_TEXT.PLACEHOLDER_ROOM_NUMBER}">`;

      // 言語セル
      const languageCell = row.insertCell();
      const languageSelect = document.createElement('select');
      languageSelect.className = 'language-select';
      languageSelect.innerHTML = LANGUAGE_OPTIONS.map(lang => `<option value="${lang}" ${room.language === lang ? 'selected' : ''}>${lang}</option>`).join('');
      languageCell.appendChild(languageSelect);

      // メモセル
      const memoCell = row.insertCell();
      const memoInput = document.createElement('input');
      memoInput.type = 'text';
      memoInput.value = room.memo || '';
      memoInput.placeholder = UI_TEXT.PLACEHOLDER_MEMO;
      memoInput.className = 'memo-input';
      memoCell.appendChild(memoInput);

      sortedHeaders.forEach((_, colIndex) => {
        const statusCell = row.insertCell();
        const currentStatus = room.statuses[colIndex] || '未訪問';
        statusCell.className = `status-cell ${this._getStatusClass(currentStatus)}`;
        const select = document.createElement('select');
        select.innerHTML = statusOptionsHtml;
        select.value = currentStatus;
        select.className = `status-select ${this._getStatusClass(currentStatus)}`;
        select.addEventListener('change', (e) => {
          const newStatusClass = this._getStatusClass(e.target.value);
          statusCell.className = `status-cell ${newStatusClass}`;
          select.className = `status-select ${newStatusClass}`;
        });
        statusCell.appendChild(select);
      });
      row.insertAdjacentHTML('beforeend', `<td class="control-cell"><button class="remove-row-btn" title="${UI_TEXT.TITLE_REMOVE_ROW}" data-row-index="${rowIndex}">-</button></td>`);
    });

    const tfoot = table.createTFoot();
    tfoot.innerHTML = `<tr><td class="control-cell"><button id="add-row-btn" title="${UI_TEXT.TITLE_ADD_ROW}">+</button></td><td colspan="${sortedHeaders.length + 3}"></td></tr>`;

    this.elements.content.innerHTML = '';
    this.elements.content.appendChild(table);

    document.getElementById('add-column-btn').onclick = () => this._addColumn();
    document.getElementById('add-row-btn').onclick = () => this._addRow();
    document.querySelectorAll('.remove-row-btn').forEach(btn => btn.onclick = (e) => this._removeRow(e.currentTarget.dataset.rowIndex));
    document.querySelectorAll('.remove-column-btn').forEach(btn => btn.onclick = (e) => this._removeColumn(e.currentTarget.dataset.colIndex));
    table.querySelectorAll('thead th input').forEach(input => {
      input.addEventListener('dblclick', () => input.type = 'date');
      input.addEventListener('blur', () => input.type = 'text');
    });
  }

  _getStatusClass(status) {
    switch (status) {
      case '訪問済み': return 'status-visited';
      case '不在': return 'status-not-at-home';
      case '未訪問': default: return 'status-not-visited';
    }
  }

  _getApartmentDataFromTable() {
    const table = document.getElementById('apartment-data-table');
    if (!table) return null;

    const headers = Array.from(table.querySelectorAll('thead th input')).map(input => input.value);
    const rooms = Array.from(table.querySelectorAll('tbody tr')).map(row => {
      const roomNumberInput = row.querySelector('td:first-child input[type="text"]');
      if (!roomNumberInput || !roomNumberInput.value) return null;
      const language = row.querySelector('.language-select').value;
      const memo = row.querySelector('.memo-input').value;
      const statuses = Array.from(row.querySelectorAll('.status-select')).map(select => select.value);
      return { roomNumber: roomNumberInput.value, language, memo, statuses };
    }).filter(Boolean);

    return { headers, rooms };
  }

  _addColumn() {
    const currentData = this._getApartmentDataFromTable();
    currentData.headers.unshift(new Date().toLocaleDateString('sv-SE')); // 先頭に日付を追加
    currentData.rooms.forEach(room => room.statuses.unshift('未訪問')); // 各部屋のステータスも先頭に追加
    this._renderTable(currentData);
  }

  _addRow() {
    const currentData = this._getApartmentDataFromTable();
    const newRoom = { roomNumber: '', language: '未選択', memo: '', statuses: Array(currentData.headers.length).fill('未訪問') };
    currentData.rooms.push(newRoom);
    this._renderTable(currentData);
  }

  _removeRow(rowIndex) {
    const currentData = this._getApartmentDataFromTable();
    currentData.rooms.splice(rowIndex, 1);
    this._renderTable(currentData);
  }

  _removeColumn(colIndex) {
    const currentData = this._getApartmentDataFromTable();
    currentData.headers.splice(colIndex, 1);
    currentData.rooms.forEach(room => room.statuses.splice(colIndex, 1));
    this._renderTable(currentData);
  }

  _getDOMElements() {
    this.elements.title = document.getElementById('apartment-editor-title');
    this.elements.content = document.getElementById('apartment-editor-content');
    this.elements.saveButton = document.getElementById('apartment-editor-save');
    this.elements.closeButton = document.getElementById('apartment-editor-close');
    this.elements.resizer = document.getElementById('apartment-editor-resizer');
  }

  _bindEvents() {
    this.elements.saveButton.onclick = this._handleSave.bind(this);
    this.elements.closeButton.onclick = this.close.bind(this);
    this._setupResizer();
  }

  _unbindEvents() {
    if (this.elements.saveButton) this.elements.saveButton.onclick = null;
    if (this.elements.closeButton) this.elements.closeButton.onclick = null;
  }
}