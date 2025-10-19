import { LANGUAGE_OPTIONS, VISIT_STATUSES, UI_TEXT } from './constants.js';
import { BasePanel } from './panels/base-panel.js';

export class ExportPanel extends BasePanel {
  constructor() {
    super('export-panel');
    this.onExport = null;
    this.getAvailableAreaNumbers = null;
  }

  /**
   * パネルを開き、エクスポート設定のUIを構築する
   * @param {() => string[]} getAvailableAreaNumbers - 利用可能な区域番号リストを取得する関数
   * @param {(filters: object) => Promise<void>} onExportCallback - エクスポート実行時のコールバック
   * @param {(newHeight: number) => void} onHeightChange - 高さ変更時のコールバック
   * @param {number} initialHeight - パネルの初期高さ(vh)
   */
  open(getAvailableAreaNumbers, onExportCallback, onHeightChange, initialHeight) {
    super.open(initialHeight);

    this.getAvailableAreaNumbers = getAvailableAreaNumbers;
    this.onExport = onExportCallback;
    this.onHeightChange = onHeightChange;

    this._renderOptions();
    this._renderLanguageOptions();
    this._renderStatusOptions();
  }

  /**
   * パネルを閉じる
   */
  close() {
    super.close();
    this.onExport = null;
    this.getAvailableAreaNumbers = null;
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

    // 選択/選択解除のトグル機能
    selectElement.addEventListener('mousedown', (e) => {
      if (e.target.tagName !== 'OPTION') return;
      
      // ブラウザのデフォルトの選択動作をキャンセル
      e.preventDefault(); 

      const option = e.target;
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
    this.elements.languageInput.innerHTML = ['すべての言語', ...LANGUAGE_OPTIONS].map(lang => `<option value="${lang === 'すべての言語' ? '' : lang}">${lang}</option>`).join('');
    this.elements.languageInput.value = '';
  }

  /**
   * ステータスの選択肢を描画する
   * @private
   */
  _renderStatusOptions() {
    const container = this.elements.statusContainer;
    container.innerHTML = '';

    const allCheckbox = this._createCheckbox('status-all', 'すべて');
    allCheckbox.querySelector('input').checked = true;
    container.appendChild(allCheckbox);

    const statusCheckboxes = VISIT_STATUSES.map(status => {
      const checkbox = this._createCheckbox(`status-${status}`, status, status);
      checkbox.querySelector('input').checked = true;
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

    this.elements.runButton.innerHTML = UI_TEXT.EXPORTING_BUTTON_TEXT;
    this.elements.runButton.disabled = true;

    try {
      await this.onExport(filters);
      this.close();
    } catch (error) {
      console.error('エクスポート処理中にエラーが発生しました:', error);
    } finally {
      this.elements.runButton.innerHTML = UI_TEXT.EXPORT_BUTTON_TEXT;
      this.elements.runButton.disabled = false;
    }
  }

  _getDOMElements() {
    this.elements.content = document.getElementById('export-panel-content');
    this.elements.areaNumbersContainer = document.getElementById('export-area-numbers');
    this.elements.keywordInput = document.getElementById('export-keyword');
    this.elements.languageInput = document.getElementById('export-language');
    this.elements.statusContainer = document.getElementById('export-status');
    this.elements.runButton = document.getElementById('export-panel-run');
    this.elements.closeButton = document.getElementById('export-panel-close');
    this.elements.resizer = document.getElementById('export-panel-resizer');
  }

  _bindEvents() {
    this.elements.runButton.onclick = this._handleExport.bind(this);
    this.elements.closeButton.onclick = () => this.close();
    this._setupResizer();
  }

  _unbindEvents() {
    if (this.elements.runButton) this.elements.runButton.onclick = null;
    if (this.elements.closeButton) this.elements.closeButton.onclick = null;
  }
}