import { CITY_CODE_MAP } from './constants.js';

/**
 * 国土地理院APIを使用してリバースジオコーディングを行う
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 * @returns {Promise<string>} 住所文字列
 */
export async function reverseGeocode(lat, lng) {
  const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`;
  try {
    const response = await fetch(url);
    const json = await response.json();
    if (json && json.results) {
      const { muniCd, lv01Nm } = json.results;
      if (muniCd && lv01Nm) {
        const baseAddress = CITY_CODE_MAP.get(String(muniCd));
        if (baseAddress) {
          return baseAddress + lv01Nm;
        }
      }
      return json.results.lv01Nm || "住所が見つかりません";
    }
    return "住所が見つかりません";
  } catch (error) {
    throw new Error(`リバースジオコーディングに失敗しました: ${error.message}`);
  }
}

/**
 * SweetAlert2を使用してトースト通知を表示する
 * @param {string} message 表示するメッセージ
 * @param {'success'|'error'|'info'|'warning'} type トーストの種類
 * @param {number} duration 表示時間 (ミリ秒)
 */
export function showToast(message, type = 'info', duration = 1500) {
  // 既存の通知があれば削除
  document.querySelector('.custom-alert-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'custom-alert-overlay';

  const alertBox = document.createElement('div');
  alertBox.className = 'custom-alert-box';
  alertBox.classList.add(`custom-alert-box--${type}`); // 種類に応じたクラスを追加

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-times-circle',
    info: 'fa-info-circle',
    warning: 'fa-exclamation-triangle'
  };
  const iconClass = icons[type] || 'fa-info-circle';

  alertBox.innerHTML = `
    <i class="fa-solid ${iconClass}"></i>
    <p class="custom-alert-message">${message}</p>
  `;

  overlay.appendChild(alertBox);
  document.body.appendChild(overlay);

  // 表示アニメーション
  requestAnimationFrame(() => {
    overlay.classList.add('show');
  });

  // 自動で非表示
  setTimeout(() => {
    overlay.classList.remove('show');
    // アニメーション完了後に要素を削除
    overlay.addEventListener('transitionend', () => {
      overlay.remove();
    }, { once: true });
  }, duration);
}

/**
 * カスタムモーダルダイアログを表示する (confirmとpromptの代替)
 * @param {string} message 表示するメッセージ
 * @param {{type: 'confirm'|'prompt'|'alert', inputType?: string, defaultValue?: string}} options
 * @returns {Promise<string|boolean|null>} confirmの場合はboolean, prompt/selectの場合は選択された文字列を返す。キャンセル時はnullを返す。
 */
export function showModal(message, options = { type: 'confirm' }) {
  return new Promise((resolve) => {
    // 既存のモーダルがあれば削除
    document.querySelector('.modal-overlay')?.remove();

    const modalId = `modal-${Date.now()}`;

    // オプションのデフォルト値を設定
    const opts = {
      ...{ type: 'confirm', inputType: 'text', defaultValue: '', choices: [] },
      ...options
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    let inputElement = '';
    if (opts.type === 'prompt') {
      inputElement = `<input type="${opts.inputType}" id="${modalId}-input" value="${opts.defaultValue}">`;
    } else if (opts.type === 'select' && opts.choices.length > 0) {
      const choicesHtml = opts.choices.map((choice, index) => {
        const value = typeof choice === 'object' ? choice.value : choice;
        const label = typeof choice === 'object' ? choice.label : choice;
        const checked = index === 0 ? 'checked' : '';
        return `<label class="modal-choice-label"><input type="radio" name="modal-choice" value="${value}" ${checked}>${label}</label>`;
      }).join('');
      inputElement = `<div class="modal-choices">${choicesHtml}</div>`;
    }

    const isAlertType = opts.type === 'alert';
    const buttonsHtml = `
      <button id="modal-ok">OK</button>
      ${!isAlertType ? '<button id="modal-cancel">キャンセル</button>' : ''}
    `;

    dialog.innerHTML = `
      <p>${message}</p>
      ${inputElement}
      <div class="modal-buttons">
        ${buttonsHtml}
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const input = document.getElementById(`${modalId}-input`);
    if (input) input.focus();

    const cleanup = () => overlay.remove();

    const handleOk = () => {
      let result;
      switch (opts.type) {
        case 'prompt':
          result = document.getElementById(`${modalId}-input`).value;
          break;
        case 'select':
          result = document.querySelector('input[name="modal-choice"]:checked')?.value ?? null;
          break;
        default: // 'confirm'
          result = true;
      }
      cleanup();
      resolve(result);
    };

    document.getElementById('modal-ok').onclick = handleOk;

    if (!isAlertType) {
      document.getElementById('modal-cancel').onclick = () => {
        cleanup();
        resolve(null); // キャンセル時はnullを返す
      };
    }

    // EnterキーでOK、Escapeキーでキャンセル
    overlay.onkeydown = (e) => {
      if (e.key === 'Enter' && input) document.getElementById('modal-ok').click();
      if (e.key === 'Escape') document.getElementById('modal-cancel').click();
    };
  });
}

/**
 * 指定された点が多角形（ポリゴン）内にあるかどうかを判定する (point-in-polygon)
 * @param {Array<number>} point - [lng, lat] 形式の点の座標
 * @param {Array<Array<number>>} vs - [[lng, lat], [lng, lat], ...] 形式の多角形（ポリゴン）の頂点リスト
 * @returns {boolean} - 点が多角形（ポリゴン）内にある場合は true
 */
export function isPointInPolygon(point, vs) {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) {
            inside = !inside;
        }
    }
    return inside;
}
