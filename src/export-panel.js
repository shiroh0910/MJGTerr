import { LANGUAGE_OPTIONS } from './constants.js';

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
      runButton: document.getElementById('export-panel-run'),
      closeButton: document.getElementById('export-panel-close'),
    };

    console.log('[ExportPanel] パネルを開いています。');
    this.getAvailableAreaNumbers = getAvailableAreaNumbers;
    this.onExport = onExportCallback;

    this._renderOptions();
    this._renderLanguageOptions();

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
    if (this.elements.languageInput) this.elements.languageInput.innerHTML = '';
    if (this.elements.keywordInput) this.elements.keywordInput.value = '';
  }

  /**
   * 区域番号の選択肢を描画する
   * @private
   */
  _renderOptions() {
    const areaNumbers = this.getAvailableAreaNumbers();
    this.elements.areaNumbersContainer.innerHTML = '';

    if (areaNumbers.length === 0) {
      this.elements.areaNumbersContainer.innerHTML = '<p>利用可能な区域がありません。</p>';
      return;
    }

    const allCheckbox = this._createCheckbox('all-areas', 'すべて選択');
    allCheckbox.addEventListener('change', (e) => {
      this.elements.areaNumbersContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb !== allCheckbox) cb.checked = e.target.checked;
      });
    });
    this.elements.areaNumbersContainer.appendChild(allCheckbox);

    areaNumbers.forEach(area => {
      const checkbox = this._createCheckbox(`area-${area}`, area, area);
      this.elements.areaNumbersContainer.appendChild(checkbox);
    });
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
   * エクスポートボタンが押されたときの処理
   * @private
   */
  async _handleExport() {
    if (!this.onExport) return;

    const selectedAreas = Array.from(this.elements.areaNumbersContainer.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value)
      .filter(value => value && value !== 'on'); // "すべて選択"を除外

    const language = this.elements.languageInput.value;
    const keyword = this.elements.keywordInput.value.trim();

    const filters = {
      areaNumbers: selectedAreas,
      language: language,
      keyword: keyword,
    };

    this.elements.runButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 作成中...`;
    this.elements.runButton.disabled = true;

    console.log('[ExportPanel] 収集されたフィルター条件:', filters); // ログの順番を変更

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