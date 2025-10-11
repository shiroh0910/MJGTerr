import { LANGUAGE_OPTIONS, VISIT_STATUSES } from './constants.js';

export class ExportPanel {
  constructor() {
    this.elements = {};
    this.onExport = null;
    this.getAvailableAreaNumbers = null;
  }

  /**
   * パネルを開き、エクスポート設定のUIを構築する
   * @param {() => string[]} getAvailableAreaNumbers - 利用可能な区域番号リストを取得する関数
   * @param {(filters: object) => Promise<void>} onExportCallback - エクスポート実行時のコールバック
   */
  open(getAvailableAreaNumbers, onExportCallback) {
    // パネルを開く際にUI要素を取得する
    this.elements = {
      panel: document.getElementById('export-panel'),
      content: document.getElementById('export-panel-content'),
      areaNumbersContainer: document.getElementById('export-area-numbers'),
      keywordInput: document.getElementById('export-keyword'),
      languageInput: document.getElementById('export-language'),
      statusContainer: document.getElementById('export-status'),
      runButton: document.getElementById('export-panel-run'),
      closeButton: document.getElementById('export-panel-close'),
      resizer: document.getElementById('export-panel-resizer'),
    };

    this.getAvailableAreaNumbers = getAvailableAreaNumbers;
    this.onExport = onExportCallback;

    this._renderOptions();
    this._renderLanguageOptions();
    this._renderStatusOptions();
    this._setupResizer();

    this.elements.runButton.onclick = this._handleExport.bind(this);
    this.elements.closeButton.onclick = () => this.close();
    this.elements.panel.classList.add('show');
  }

  /**
   * パネルを閉じる
   */
  close() {
    if (this.elements.panel) {
      this.elements.panel.classList.remove('show');
    }
    this.onExport = null;
    this.getAvailableAreaNumbers = null;
    if (this.elements.runButton) this.elements.runButton.onclick = null;
    if (this.elements.closeButton) this.elements.closeButton.onclick = null;
    if (this.elements.areaNumbersContainer) this.elements.areaNumbersContainer.innerHTML = '';
    if (this.elements.statusContainer) this.elements.statusContainer.innerHTML = '';
    if (this.elements.languageInput) this.elements.languageInput.innerHTML = '';
    if (this.elements.keywordInput) this.elements.keywordInput.value = '';
  }

  /**
   * 区域番号の選択肢を描画する
   * @private
   */
  _renderOptions() {
    const selectElement = this.elements.areaNumbersContainer;
    const areaNumbers = this.getAvailableAreaNumbers();
    selectElement.innerHTML = '';

    if (areaNumbers.length === 0) {
      selectElement.innerHTML = '<option disabled>利用可能な区域がありません。</option>';
      return;
    }

    areaNumbers.forEach(area => {
      const option = new Option(area, area);
      selectElement.add(option);
    });

    // 選択/選択解除のトグル機能。重複したリスナーを整理し、単一のリスナーにまとめる。
    // mousedownイベントは、PCでのクリックとモバイルでのタップ開始の両方を検知できる。
    selectElement.addEventListener('mousedown', (e) => {
      // クリックされたのが<option>要素でなければ何もしない
      if (e.target.tagName !== 'OPTION') return;
      
      // ブラウザのデフォルトの選択動作（特にモバイルでの長押しメニューなど）をキャンセル
      e.preventDefault(); 

      const option = e.target;
      // optionの選択状態を反転させる
      option.selected = !option.selected;
    });
  }

  _createCheckbox(id, label, value = '') {
    const labelEl = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.value = value;
    labelEl.appendChild(checkbox);
    labelEl.append(label);
    return labelEl;
  }

  /**
   * 言語の選択肢を描画する
   * @private
   */
  _renderLanguageOptions() {
    // 「すべての言語」を先頭に追加
    this.elements.languageInput.innerHTML = ['すべての言語', ...LANGUAGE_OPTIONS].map(lang => `<option value="${lang === 'すべての言語' ? '' : lang}">${lang}</option>`).join('');
    this.elements.languageInput.value = ''; // デフォルトは「すべての言語」
  }

  /**
   * ステータスの選択肢を描画する
   * @private
   */
  _renderStatusOptions() {
    const container = this.elements.statusContainer;
    container.innerHTML = '';

    const allCheckbox = this._createCheckbox('status-all', 'すべて');
    allCheckbox.querySelector('input').checked = true; // デフォルトでON
    container.appendChild(allCheckbox);

    const statusCheckboxes = VISIT_STATUSES.map(status => {
      const checkbox = this._createCheckbox(`status-${status}`, status, status);
      checkbox.querySelector('input').checked = true; // デフォルトでON
      container.appendChild(checkbox);
      return checkbox.querySelector('input');
    });

    // 「すべて」チェックボックスの連動処理
    allCheckbox.addEventListener('change', (e) => {
      statusCheckboxes.forEach(cb => cb.checked = e.target.checked);
    });
  }

  /**
   * エクスポートボタンが押されたときの処理
   * @private
   */
  async _handleExport() {
    if (!this.onExport) return;

    const selectedAreas = Array.from(this.elements.areaNumbersContainer.selectedOptions)
      .map(option => option.value);

    const selectedStatuses = Array.from(this.elements.statusContainer.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value)
      .filter(value => value && value !== 'on'); // "すべて"チェックボックス自体は除外

    const language = this.elements.languageInput.value;
    const keyword = this.elements.keywordInput.value.trim();

    const filters = {
      areaNumbers: selectedAreas,
      statuses: selectedStatuses,
      language: language,
      keyword: keyword,
    };

    this.elements.runButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 作成中...`;
    this.elements.runButton.disabled = true;

    try {
      await this.onExport(filters);
      this.close();
    } catch (error) {
      console.error('エクスポート処理中にエラーが発生しました:', error);
    } finally {
      this.elements.runButton.innerHTML = `<i class="fa-solid fa-download"></i> エクスポート`;
      this.elements.runButton.disabled = false;
    }
  }

  /**
   * パネルの高さを変更するためのリサイザーを設定する
   * @private
   */
  _setupResizer() {
    const resizer = this.elements.resizer;
    const panel = this.elements.panel;

    const onDragStart = (e) => {
      e.preventDefault();
      // マウスイベントとタッチイベントで座標の取得方法を切り替える
      const startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
      const startHeight = panel.offsetHeight;

      const onDragMove = (moveEvent) => {
        const currentY = moveEvent.type === 'touchmove' ? moveEvent.touches[0].clientY : moveEvent.clientY;
        const deltaY = startY - currentY;
        let newHeight = startHeight + deltaY;

        // 高さの最小値と最大値を設定
        const minHeight = 150; // 150px
        const maxHeight = window.innerHeight * 0.8; // 画面の80%
        newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
        panel.style.height = `${newHeight}px`;
      };

      const onDragEnd = () => {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
      };

      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
      document.addEventListener('touchmove', onDragMove, { passive: false }); // スクロールをキャンセルするために passive: false を指定
      document.addEventListener('touchend', onDragEnd);
    };

    resizer.addEventListener('mousedown', onDragStart);
    resizer.addEventListener('touchstart', onDragStart, { passive: false });
  }
}