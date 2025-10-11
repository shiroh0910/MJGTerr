export class ExportPanel {
  constructor() {
    this.panelElement = document.getElementById('export-panel');
    this.contentElement = document.getElementById('export-panel-content');
    this.areaNumbersContainer = document.getElementById('export-area-numbers');
    this.keywordInput = document.getElementById('export-keyword');
    this.runButton = document.getElementById('export-panel-run');
    this.closeButton = document.getElementById('export-panel-close');

    this.onExport = null;
    this.getAvailableAreaNumbers = null;

    this.closeButton.onclick = () => this.close();
  }

  /**
   * パネルを開き、エクスポート設定のUIを構築する
   * @param {() => string[]} getAvailableAreaNumbers - 利用可能な区域番号リストを取得する関数
   * @param {(filters: object) => Promise<void>} onExportCallback - エクスポート実行時のコールバック
   */
  open(getAvailableAreaNumbers, onExportCallback) {
    console.log('[ExportPanel] パネルを開いています。');
    this.getAvailableAreaNumbers = getAvailableAreaNumbers;
    this.onExport = onExportCallback;

    this._renderOptions();

    this.runButton.onclick = this._handleExport.bind(this);
    this.panelElement.classList.add('show');
  }

  /**
   * パネルを閉じる
   */
  close() {
    this.panelElement.classList.remove('show');
    this.onExport = null;
    this.getAvailableAreaNumbers = null;
    this.runButton.onclick = null;
    this.areaNumbersContainer.innerHTML = '';
    this.keywordInput.value = '';
  }

  /**
   * 区域番号の選択肢を描画する
   * @private
   */
  _renderOptions() {
    const areaNumbers = this.getAvailableAreaNumbers();
    this.areaNumbersContainer.innerHTML = '';

    if (areaNumbers.length === 0) {
      this.areaNumbersContainer.innerHTML = '<p>利用可能な区域がありません。</p>';
      return;
    }

    const allCheckbox = this._createCheckbox('all-areas', 'すべて選択');
    allCheckbox.addEventListener('change', (e) => {
      this.areaNumbersContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb !== allCheckbox) cb.checked = e.target.checked;
      });
    });
    this.areaNumbersContainer.appendChild(allCheckbox);

    areaNumbers.forEach(area => {
      const checkbox = this._createCheckbox(`area-${area}`, area, area);
      this.areaNumbersContainer.appendChild(checkbox);
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
   * エクスポートボタンが押されたときの処理
   * @private
   */
  async _handleExport() {
    if (!this.onExport) return;

    const selectedAreas = Array.from(this.areaNumbersContainer.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value)
      .filter(value => value && value !== 'on'); // "すべて選択"を除外

    const keyword = this.keywordInput.value.trim();

    const filters = {
      areaNumbers: selectedAreas,
      keyword: keyword,
    };

    console.log('[ExportPanel] 収集されたフィルター条件:', filters);

    this.runButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 作成中...`;
    this.runButton.disabled = true;

    try {
      await this.onExport(filters);
      this.close();
    } catch (error) {
      console.error('エクスポート処理中にエラーが発生しました:', error);
    } finally {
      this.runButton.innerHTML = `<i class="fa-solid fa-download"></i> エクスポート`;
      this.runButton.disabled = false;
    }
  }
}