import { LANGUAGE_OPTIONS, DEFAULT_VISIT_STATUSES } from './constants.js';
import { showModal, showToast } from './utils.js';

export class ApartmentEditor {
  constructor() {
    this.editorElement = document.getElementById('apartment-editor');
    this.titleElement = document.getElementById('apartment-editor-title');
    this.contentElement = document.getElementById('apartment-editor-content');
    this.saveButton = document.getElementById('apartment-editor-save');
    this.closeButton = document.getElementById('apartment-editor-close');

    this.onSave = null;
    this.activeMarkerData = null;
    this.onHeightChange = null;
    this.isAdmin = false;
    this.visitStatuses = DEFAULT_VISIT_STATUSES;
  }

  open(markerData, onSaveCallback, onHeightChange, initialHeight, isAdmin, visitStatuses) {
    this.activeMarkerData = markerData;
    this.onSave = onSaveCallback;
    this.onHeightChange = onHeightChange;
    this.isAdmin = isAdmin;
    this.visitStatuses = visitStatuses || DEFAULT_VISIT_STATUSES;
    
    // resizerをここで取得
    this.resizer = document.getElementById('apartment-editor-resizer');

    // 初期高さを設定
    if (initialHeight) {
      this.editorElement.style.height = `${initialHeight}vh`;
    } else {
      this.editorElement.style.height = ''; // デフォルトに戻す
    }

    this.titleElement.textContent = markerData.name || markerData.address;
    this._renderTable(markerData.apartmentDetails);

    this.saveButton.onclick = this._handleSave.bind(this);
    this.closeButton.onclick = this.close.bind(this);
    this._setupResizer();

    this.editorElement.classList.add('show');
  }

  close() {
    this.editorElement.classList.remove('show');
    this.activeMarkerData = null;
    this.onSave = null;
    this.onHeightChange = null;
    this.saveButton.onclick = null;
    this.closeButton.onclick = null;
    this.resizer = null;
  }

  async _handleSave() {
    if (!this.onSave) return;

    let apartmentDetails;
    let changedRooms;

    if (this.isAdmin) {
      // 管理者の場合：テーブルから全てのデータを読み取る
      apartmentDetails = this._getApartmentDataFromTable();
      const previousRooms = this.activeMarkerData.apartmentDetails?.rooms || [];

      changedRooms = apartmentDetails.rooms.map(currentRoom => {
        const previousRoom = previousRooms.find(pr => pr.roomNumber === currentRoom.roomNumber);
        const languageAdded = previousRoom
          ? previousRoom.language === '未選択' && currentRoom.language !== '未選択'
          : currentRoom.language !== '未選択';
        const languageRemoved = previousRoom
          ? previousRoom.language !== '未選択' && currentRoom.language === '未選択'
          : false;
        return { ...currentRoom, languageAdded, languageRemoved };
      });
    } else {
      // 一般ユーザーの場合：許可された項目のみを更新
      const table = document.getElementById('apartment-data-table');
      if (!table) return;

      // 元のデータ構造をコピーして、それに変更をマージする
      apartmentDetails = JSON.parse(JSON.stringify(this.activeMarkerData.apartmentDetails || { headers: [], rooms: [] }));
      const previousRooms = JSON.parse(JSON.stringify(apartmentDetails.rooms)); // 変更前の言語状態を保持

      Array.from(table.querySelectorAll('tbody tr')).forEach((row, index) => {
        if (apartmentDetails.rooms[index]) {
          apartmentDetails.rooms[index].language = row.querySelector('.language-select').value;
          apartmentDetails.rooms[index].memo = row.querySelector('.memo-input').value;
          apartmentDetails.rooms[index].statuses = Array.from(row.querySelectorAll('.status-select')).map(select => select.value);
        }
      });

      changedRooms = apartmentDetails.rooms.map((currentRoom, index) => {
        const previousRoom = previousRooms[index];
        return {
          ...currentRoom,
          languageAdded: previousRoom.language === '未選択' && currentRoom.language !== '未選択',
          languageRemoved: previousRoom.language !== '未選択' && currentRoom.language === '未選択',
        };
      });
    }

    this.saveButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 保存中...`;
    this.saveButton.disabled = true;

    try {
      // 変更情報を onSave コールバックに渡す
      await this.onSave(apartmentDetails, changedRooms);
      this.close();
    } catch (error) {
      // エラー表示は呼び出し元で行う
    } finally {
      this.saveButton.innerHTML = `<i class="fa-solid fa-save"></i> 保存`;
      this.saveButton.disabled = false;
    }
  }

  _renderTable(details) {
    const statusOptionsList = this.visitStatuses.filter(s => s.name !== '訪問拒否');
    const statusOptionsHtml = statusOptionsList.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
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
    headerRow.innerHTML = `<th class="apartment-table-header-room">部屋番号</th><th class="apartment-table-header-lang">言語</th><th class="apartment-table-header-memo">メモ</th>`;
    sortedHeaders.forEach((header, colIndex) => {
      const th = document.createElement('th');
      const dateInputDisabled = this.isAdmin ? '' : 'disabled';
      const removeColumnButton = this.isAdmin ? `<button class="remove-column-btn" data-col-index="${colIndex}">&times;</button>` : '';
      th.className = 'date-header-cell';
      th.draggable = this.isAdmin; // 管理者の場合のみドラッグ可能にする
      th.innerHTML = `
        <div class="date-header-cell-content">
          <input type="text" class="apartment-table-header-input" value="${header}" ${dateInputDisabled}>
          ${this.isAdmin ? `<button class="remove-column-btn apartment-table-remove-column-btn" data-col-index="${colIndex}" title="列を削除"><i class="fa-solid fa-times"></i></button>` : ''}
        </div>`;
      headerRow.appendChild(th);
    });
    if (this.isAdmin) {
      headerRow.innerHTML += `<th class="apartment-table-control-cell">
                                <button id="add-column-btn" class="apartment-table-add-column-btn" title="列を追加"><i class="fa-solid fa-plus"></i></button>
                              </th>`;
    }

    const tbody = table.createTBody();
    sortedRooms.forEach((room, rowIndex) => {
      // ソート後のため、最初のステータスが最新のステータスとなる
      const latestStatus = room.statuses[0] || '未訪問';
      const isRefused = latestStatus === '訪問拒否';
      const disabledAttribute = isRefused ? 'disabled' : '';

      const row = tbody.insertRow();
      row.draggable = this.isAdmin; // 管理者の場合のみ行をドラッグ可能にする
      row.dataset.rowIndex = rowIndex; // 並べ替えのためにインデックスを保持
      if (isRefused) {
        row.classList.add('row-refused');
      }

      // 部屋番号セル
      const roomNumberCell = row.insertCell();
      roomNumberCell.innerHTML = `<input type="text" class="apartment-table-input apartment-table-room-input" value="${room.roomNumber || ''}" placeholder="部屋番号" ${disabledAttribute || (this.isAdmin ? '' : 'disabled')}>`;

      // 言語セル
      const languageCell = row.insertCell();
      const languageSelect = document.createElement('select');
      languageSelect.className = 'apartment-table-select apartment-table-language-select';
      languageSelect.innerHTML = LANGUAGE_OPTIONS.map(lang => `<option value="${lang}" ${room.language === lang ? 'selected' : ''}>${lang}</option>`).join('');
      languageSelect.disabled = isRefused;
      languageCell.appendChild(languageSelect);

      // メモセル
      const memoCell = row.insertCell();
      const memoInput = document.createElement('input');
      memoInput.type = 'text';
      memoInput.value = room.memo || '';
      memoInput.placeholder = 'メモ';
      memoInput.className = 'memo-input';
      memoInput.disabled = isRefused;
      memoCell.appendChild(memoInput);

      sortedHeaders.forEach((_, colIndex) => {
        const statusCell = row.insertCell();
        const currentStatus = room.statuses[colIndex] || '未訪問';
        const select = document.createElement('select');
        select.innerHTML = statusOptionsHtml;
        select.value = currentStatus;
        select.className = `status-select ${this._getStatusClass(currentStatus)}`;
        select.disabled = isRefused;

        // 訪問拒否の場合は、セルのクラスも固定する
        statusCell.className = `status-cell ${this._getStatusClass(isRefused ? '訪問拒否' : currentStatus)}`;

        select.addEventListener('change', (e) => {
          const newStatusClass = this._getStatusClass(e.target.value);
          statusCell.className = `status-cell ${newStatusClass}`;
          select.className = `status-select ${newStatusClass}`;
        });

        statusCell.appendChild(select);
      });
      if (this.isAdmin) {
        row.insertAdjacentHTML('beforeend', `<td class="control-cell"><button class="remove-row-btn" title="行を削除" data-row-index="${rowIndex}" ${disabledAttribute}>-</button></td>`);
      }
    });

    if (this.isAdmin) {
      const tfoot = table.createTFoot();
      tfoot.innerHTML = `<tr><td class="control-cell"><button id="add-row-btn" title="行を追加">+</button></td><td colspan="${sortedHeaders.length + 3}"></td></tr>`;
    }

    this.contentElement.innerHTML = '';
    this.contentElement.appendChild(table);

    if (this.isAdmin) {
      document.getElementById('add-column-btn').onclick = () => this._addColumn();
      document.getElementById('add-row-btn').onclick = () => this._addRow();
      document.querySelectorAll('.remove-row-btn').forEach(btn => btn.onclick = (e) => this._removeRow(e.currentTarget.dataset.rowIndex));
      document.querySelectorAll('.remove-column-btn').forEach(btn => btn.onclick = (e) => this._removeColumn(e.currentTarget.dataset.colIndex));
      this._setupColumnDragAndDrop(table.querySelector('thead tr'));
      this._setupRowDragAndDrop(tbody);
    }
  }

  _getStatusClass(status) {
    switch (status) {
      case '訪問済み': return 'status-visited';
      case '不在': return 'status-not-at-home';
      case '訪問拒否': return 'status-refused';
      case '未訪問':
      default:
        return 'status-not-visited';
    }
  }

  _getApartmentDataFromTable() {
    const table = document.getElementById('apartment-data-table');
    if (!table) return null;

    const headers = Array.from(table.querySelectorAll('thead th input')).map(input => input.value);
    const rooms = Array.from(table.querySelectorAll('tbody tr')).map(row => {
      const roomNumberInput = row.querySelector('td:first-child input[type="text"]');
      if (!roomNumberInput) return null; // 入力欄がない行はスキップ
      const language = row.querySelector('.apartment-table-language-select')?.value;
      const memo = row.querySelector('.memo-input').value;
      const statuses = Array.from(row.querySelectorAll('.status-select')).map(select => select?.value);
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

  /**
   * テーブルヘッダーのドラッグ＆ドロップによる列の並べ替えをセットアップする
   * @param {HTMLTableRowElement} headerRow
   * @private
   */
  _setupColumnDragAndDrop(headerRow) {
    let dragSrcElement = null;

    headerRow.addEventListener('dragstart', (e) => {
      const target = e.target.closest('th.date-header-cell');
      if (target) {
        dragSrcElement = target;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', target.innerHTML); // ドラッグデータとして必須
        target.classList.add('dragging');
      }
    });

    headerRow.addEventListener('dragover', (e) => {
      e.preventDefault();
      const target = e.target.closest('th.date-header-cell');
      if (target && dragSrcElement && target !== dragSrcElement) {
        target.classList.add('drag-over');
      }
    });

    headerRow.addEventListener('dragleave', (e) => {
      e.target.closest('th.date-header-cell')?.classList.remove('drag-over');
    });

    headerRow.addEventListener('drop', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const dropTarget = e.target.closest('th.date-header-cell');
      dropTarget?.classList.remove('drag-over');

      if (dragSrcElement && dropTarget && dragSrcElement !== dropTarget) {
        const fromIndex = Array.from(headerRow.children).indexOf(dragSrcElement);
        const toIndex = Array.from(headerRow.children).indexOf(dropTarget);

        const currentData = this._getApartmentDataFromTable();
        const [movedHeader] = currentData.headers.splice(fromIndex - 3, 1);
        currentData.headers.splice(toIndex - 3, 0, movedHeader);

        currentData.rooms.forEach(room => {
          const [movedStatus] = room.statuses.splice(fromIndex - 3, 1);
          room.statuses.splice(toIndex - 3, 0, movedStatus);
        });

        this._renderTable(currentData);
      }
    });
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

  /**
   * テーブルボディのドラッグ＆ドロップによる行の並べ替えをセットアップする
   * @param {HTMLTableSectionElement} tbody
   * @private
   */
  _setupRowDragAndDrop(tbody) {
    let dragSrcElement = null;

    const onDragStart = (e) => {
      // クリックされたのがTR要素でなければ何もしない
      if (e.target.tagName !== 'TR') return;

      dragSrcElement = e.target;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', e.target.outerHTML);
      e.target.classList.add('dragging-row');
    };

    const onDragOver = (e) => {
      e.preventDefault();
      const targetRow = e.target.closest('tr');
      if (targetRow && dragSrcElement && targetRow !== dragSrcElement) {
        const rect = targetRow.getBoundingClientRect();
        const isAfter = e.clientY > rect.top + rect.height / 2;
        targetRow.classList.toggle('drag-over-after', isAfter);
        targetRow.classList.toggle('drag-over-before', !isAfter);
      }
    };

    const onDragLeave = (e) => {
      e.target.closest('tr')?.classList.remove('drag-over-after', 'drag-over-before');
    };

    const onDrop = (e) => {
      e.preventDefault();
      const dropTarget = e.target.closest('tr');
      if (!dropTarget || !dragSrcElement || dropTarget === dragSrcElement) {
        dragSrcElement?.classList.remove('dragging-row');
        return;
      }

      dropTarget.classList.remove('drag-over-after', 'drag-over-before');
      dragSrcElement.classList.remove('dragging-row');

      const currentData = this._getApartmentDataFromTable();
      const fromIndex = parseInt(dragSrcElement.dataset.rowIndex, 10);
      let toIndex = parseInt(dropTarget.dataset.rowIndex, 10);

      const rect = dropTarget.getBoundingClientRect();
      const isAfter = e.clientY > rect.top + rect.height / 2;
      if (isAfter) toIndex++;

      const [movedRoom] = currentData.rooms.splice(fromIndex, 1);
      if (fromIndex < toIndex) toIndex--; // 配列から要素を削除したことによるインデックスのずれを補正
      currentData.rooms.splice(toIndex, 0, movedRoom);

      this._renderTable(currentData);
    };

    tbody.addEventListener('dragstart', onDragStart);
    tbody.addEventListener('dragover', onDragOver);
    tbody.addEventListener('dragleave', onDragLeave);
    tbody.addEventListener('drop', onDrop);
  }

  /**
   * パネルの高さを変更するためのリサイザーを設定する
   * @private
   */
  _setupResizer() {
    const resizer = this.resizer;
    const panel = this.editorElement;

    const onDragStart = (e) => {
      e.preventDefault();
      const startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
      const startHeight = panel.offsetHeight;

      const onDragMove = (moveEvent) => {
        const currentY = moveEvent.type === 'touchmove' ? moveEvent.touches[0].clientY : moveEvent.clientY;
        const deltaY = startY - currentY;
        let newHeight = startHeight + deltaY;

        const minHeight = 150;
        const maxHeight = window.innerHeight * 0.8;
        newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
        panel.style.height = `${newHeight}px`;
      };

      const onDragEnd = () => {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        if (this.onHeightChange) {
          const heightVh = (panel.offsetHeight / window.innerHeight) * 100;
          this.onHeightChange(heightVh);
        }
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
      };

      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
      document.addEventListener('touchmove', onDragMove, { passive: false });
      document.addEventListener('touchend', onDragEnd);
    };

    resizer.addEventListener('mousedown', onDragStart);
    resizer.addEventListener('touchstart', onDragStart, { passive: false });
  }
}