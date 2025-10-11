import { FOREIGN_LANGUAGE_KEYWORDS } from './constants.js';

export class ApartmentEditor {
  constructor() {
    this.editorElement = document.getElementById('apartment-editor');
    this.titleElement = document.getElementById('apartment-editor-title');
    this.contentElement = document.getElementById('apartment-editor-content');
    this.saveButton = document.getElementById('apartment-editor-save');
    this.closeButton = document.getElementById('apartment-editor-close');

    this.onSave = null;
    this.activeMarkerData = null;
  }

  open(markerData, onSaveCallback) {
    this.activeMarkerData = markerData;
    this.onSave = onSaveCallback;

    this.titleElement.textContent = markerData.name || markerData.address;
    this._renderTable(markerData.apartmentDetails);

    this.saveButton.onclick = this._handleSave.bind(this);
    this.closeButton.onclick = this.close.bind(this);
    this.editorElement.classList.add('show');
  }

  close() {
    this.editorElement.classList.remove('show');
    this.activeMarkerData = null;
    this.onSave = null;
    this.saveButton.onclick = null;
    this.closeButton.onclick = null;
  }

  async _handleSave() {
    if (!this.onSave) return;

    const apartmentDetails = this._getApartmentDataFromTable();

    this.saveButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 保存中...`;
    this.saveButton.disabled = true;

    try {
      await this.onSave(apartmentDetails);
      this.close();
    } catch (error) {
      // エラー表示は呼び出し元で行う
    } finally {
      this.saveButton.innerHTML = `<i class="fa-solid fa-save"></i> 保存`;
      this.saveButton.disabled = false;
    }
  }

  _renderTable(details) {
    const statuses = ['未訪問', '訪問済み', '不在'];
    const statusOptionsHtml = statuses.map(s => `<option value="${s}">${s}</option>`).join('');
    const languageOptionsList = ['未選択', ...FOREIGN_LANGUAGE_KEYWORDS, 'その他の言語'];
    const languageOptionsHtml = languageOptionsList.map(lang => `<option value="${lang}">${lang}</option>`).join('');

    let headers = details?.headers || [new Date().toLocaleDateString('sv-SE')];
    let rooms = details?.rooms || [{ roomNumber: '101', language: '未選択', memo: '', statuses: ['未訪問'] }, { roomNumber: '102', language: '未選択', memo: '', statuses: ['未訪問'] }];

    const table = document.createElement('table');
    table.className = 'apartment-table';
    table.id = 'apartment-data-table';

    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    headerRow.innerHTML = `<th>部屋番号</th><th>言語</th><th>メモ</th>`;
    headers.forEach((header, colIndex) => {
      const th = document.createElement('th');
      th.className = 'date-header-cell';
      th.innerHTML = `
        <div class="date-header-cell-content">
          <input type="text" value="${header}">
          <button class="remove-column-btn" data-col-index="${colIndex}">&times;</button>
        </div>`;
      headerRow.appendChild(th);
    });
    headerRow.innerHTML += `<th class="control-cell"><button id="add-column-btn" title="列を追加">+</button></th>`;

    const tbody = table.createTBody();
    rooms.forEach((room, rowIndex) => {
      const row = tbody.insertRow();
      // 部屋番号、言語、メモのセルを追加
      row.innerHTML = `
        <td><input type="text" value="${room.roomNumber || ''}" placeholder="部屋番号"></td>
        <td>
          <select class="language-select">
            ${languageOptionsList.map(lang => `<option value="${lang}" ${room.language === lang ? 'selected' : ''}>${lang}</option>`).join('')}
          </select>
        </td>
        <td><input type="text" value="${room.memo || ''}" placeholder="メモ" class="memo-input"></td>
      `;

      headers.forEach((_, colIndex) => {
        const statusCell = row.insertCell();
        const currentStatus = room.statuses[colIndex] || '未訪問';
        statusCell.className = `status-cell ${this._getStatusClass(currentStatus)}`;
        const select = document.createElement('select');
        select.innerHTML = statusOptionsHtml;
        select.value = currentStatus;
        select.className = this._getStatusClass(currentStatus);
        select.addEventListener('change', (e) => {
          const newStatusClass = this._getStatusClass(e.target.value);
          statusCell.className = `status-cell ${newStatusClass}`;
          select.className = newStatusClass;
        });
        statusCell.appendChild(select);
      });
      row.innerHTML += `<td class="control-cell"><button class="remove-row-btn" title="行を削除" data-row-index="${rowIndex}">-</button></td>`;
    });

    const tfoot = table.createTFoot();
    tfoot.innerHTML = `<tr><td class="control-cell"><button id="add-row-btn" title="行を追加">+</button></td><td colspan="${headers.length + 3}"></td></tr>`;

    this.contentElement.innerHTML = '';
    this.contentElement.appendChild(table);

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
    currentData.headers.push(new Date().toLocaleDateString('sv-SE'));
    currentData.rooms.forEach(room => room.statuses.push('未訪問'));
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
}