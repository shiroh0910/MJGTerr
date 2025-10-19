/**
 * 画面下部に表示されるパネルの基本的な機能を提供する基底クラス
 */
export class BasePanel {
  constructor(panelId) {
    this.panelId = panelId;
    this.elements = {};
    this.onHeightChange = null;
  }

  /**
   * パネルを開く
   * @param {number} initialHeight - パネルの初期高さ(vh)
   */
  open(initialHeight) {
    this.elements.panel = document.getElementById(this.panelId);
    if (!this.elements.panel) {
      console.error(`Panel element with id "${this.panelId}" not found.`);
      return;
    }

    this._getDOMElements();

    if (initialHeight) {
      this.elements.panel.style.height = `${initialHeight}vh`;
    } else {
      this.elements.panel.style.height = ''; // デフォルトの高さに戻す
    }

    this._bindEvents();
    this.elements.panel.classList.add('show');
  }

  /**
   * パネルを閉じる
   */
  close() {
    if (this.elements.panel) {
      this.elements.panel.classList.remove('show');
    }
    this._unbindEvents();
    this.elements = {};
  }

  /**
   * パネル内のDOM要素を取得する（サブクラスでオーバーライド）
   * @protected
   */
  _getDOMElements() {
    // 例: this.elements.closeButton = document.getElementById(...)
  }

  /**
   * イベントリスナーをバインドする（サブクラスでオーバーライド）
   * @protected
   */
  _bindEvents() {
    // 例: this.elements.closeButton.onclick = () => this.close();
  }

  /**
   * イベントリスナーをアンバインドする（サブクラスでオーバーライド）
   * @protected
   */
  _unbindEvents() {
    // 例: if (this.elements.closeButton) this.elements.closeButton.onclick = null;
  }

  /**
   * パネルの高さを変更するためのリサイザーを設定する
   * @protected
   */
  _setupResizer() {
    const resizer = this.elements.resizer;
    const panel = this.elements.panel;
    if (!resizer || !panel) return;

    const onDragStart = (e) => {
      e.preventDefault();
      const startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
      const startHeight = panel.offsetHeight;

      const onDragMove = (moveEvent) => {
        const currentY = moveEvent.type === 'touchmove' ? moveEvent.touches[0].clientY : moveEvent.clientY;
        const deltaY = startY - currentY;
        const newHeight = Math.max(150, Math.min(startHeight + deltaY, window.innerHeight * 0.8));
        panel.style.height = `${newHeight}px`;
      };

      const onDragEnd = () => {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        if (this.onHeightChange) {
          this.onHeightChange((panel.offsetHeight / window.innerHeight) * 100);
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