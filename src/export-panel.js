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
    };

    this.getAvailableAreaNumbers = getAvailableAreaNumbers;
    this.onExport = onExportCallback;

    this._renderOptions();
    this._renderLanguageOptions();
    this._renderStatusOptions();

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

    // 選択/選択解除のトグル機能を実装
    let lastSelectedIndex = -1;
    selectElement.addEventListener('click', (e) => {
      const selectedIndex = e.target.selectedIndex;
      // 同じ項目が連続でクリックされた場合、選択を解除する
      if (selectedIndex !== -1 && selectedIndex === lastSelectedIndex) {
        e.target.options[selectedIndex].selected = false;
        // changeイベントを手動で発火させる（将来的に必要になる可能性があるため）
        selectElement.dispatchEvent(new Event('change'));
      }
      // 最後にクリックされたインデックスを更新
      // 選択が解除された場合は selectedIndex が -1 になるため、
      // 選択されているオプションの中からクリックされたインデックスを探す
      lastSelectedIndex = Array.from(e.target.options).findIndex(opt => opt.value === e.target.value);
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
}