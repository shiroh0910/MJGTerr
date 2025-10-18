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
  return new Promise((resolve) => {
    // 既存の通知があれば削除
    document.querySelector('.custom-alert-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';

    const alertBox = document.createElement('div');
    alertBox.className = 'custom-alert-box';
    alertBox.classList.add(`custom-alert-box--${type}`);

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

    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });

    setTimeout(() => {
      overlay.classList.remove('show');
      overlay.addEventListener('transitionend', () => {
        overlay.remove();
        resolve(); // アニメーション完了後にPromiseを解決
      }, { once: true });
    }, duration);
  });
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

/**
 * FileSaver.js の saveAs 関数
 * Blobオブジェクトをファイルとして保存する
 * @param {Blob} blob - 保存するBlobオブジェクト
 * @param {string} name - ファイル名
 */
export const saveAs = (function(view) {
	"use strict";
	// IE <10 is explicitly unsupported
	if (typeof view === "undefined" || typeof navigator !== "undefined" && /MSIE [1-9]\./.test(navigator.userAgent)) {
		return;
	}
	var
		  doc = view.document
		  // only get URL when necessary in case Blob.js hasn't overridden it yet
		, get_URL = function() {
			return view.URL || view.webkitURL || view;
		}
		, save_link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a")
		, can_use_save_link = "download" in save_link
		, click = function(node) {
			var event = new MouseEvent("click");
			node.dispatchEvent(event);
		}
		, is_safari = /constructor/i.test(view.HTMLElement) || view.safari
		, is_chrome_ios =/CriOS\/[\d]+/.test(navigator.userAgent)
		, setImmediate = view.setImmediate || view.setTimeout
		, throw_outside = function(ex) {
			setImmediate(function() {
				throw ex;
			}, 0);
		}
		, force_saveable_type = "application/octet-stream"
		// the Blob API is fundamentally broken as there is no "downloadfinished" event to subscribe to
		, arbitrary_revoke_timeout = 1000 * 40 // in ms
		, revoke = function(file) {
			var revoker = function() {
				if (typeof file === "string") { // file is an object URL
					get_URL().revokeObjectURL(file);
				} else { // file is a File
					file.remove();
				}
			};
			setTimeout(revoker, arbitrary_revoke_timeout);
		}
		, dispatch = function(filesaver, event_types, event) {
			event_types = [].concat(event_types);
			var i = event_types.length;
			while (i--) {
				var listener = filesaver["on" + event_types[i]];
				if (typeof listener === "function") {
					try {
						listener.call(filesaver, event || filesaver);
					} catch (ex) {
						throw_outside(ex);
					}
				}
			}
		}
		_
		, auto_bom = function(blob) {
			// prepend BOM for UTF-8 XML and text/* types (including HTML)
			// note: your browser will automatically convert UTF-16 U+FEFF to EF BB BF
			if (/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) {
				return new Blob([String.fromCharCode(0xFEFF), blob], {type: blob.type});
			}
			return blob;
		}
		, FileSaver = function(blob, name, no_auto_bom) {
			if (!no_auto_bom) {
				blob = auto_bom(blob);
			}
			// First try a.download, then web filesystem, then object URLs
			var
				  filesaver = this
				, type = blob.type
				, force = type === force_saveable_type
				, object_url
				, dispatch_all = function() {
					dispatch(this, "writestart progress write writeend".split(" "));
				}
				// on any filesys errors revert to saving with object URLs
				, fs_error = function() {
					if ((is_chrome_ios || (force && is_safari)) && view.FileReader) {
						// Safari doesn't allow downloading of blob urls
						var reader = new FileReader();
						reader.onloadend = function() {
							var url = is_chrome_ios ? reader.result : reader.result.replace(/^data:[^;]*;/, 'data:attachment/file;');
							var popup = view.open(url, '_blank');
							if(!popup) view.location.href = url;
							url=undefined; // release reference before dispatching
							filesaver.readyState = filesaver.DONE;
							dispatch_all();
						};
						reader.readAsDataURL(blob);
						filesaver.readyState = filesaver.INIT;
						return;
					}
					// don't create object URLs on non-forceable types
					if (!object_url) {
						object_url = get_URL().createObjectURL(blob);
					}
					if (force) {
						view.location.href = object_url;
					} else {
						var opened = view.open(object_url, "_blank");
						if (!opened) {
							// Apple does not allow window.open, see https://developer.apple.com/library/safari/documentation/Tools/Conceptual/SafariExtensionGuide/WorkingwithWindowsandTabs/WorkingwithWindowsandTabs.html
							view.location.href = object_url;
						}
					}
					filesaver.readyState = filesaver.DONE;
					dispatch_all();
					revoke(object_url);
				}
			;
			filesaver.readyState = filesaver.INIT;

			if (can_use_save_link) {
				object_url = get_URL().createObjectURL(blob);
				setTimeout(function() {
					save_link.href = object_url;
					save_link.download = name;
					click(save_link);
					dispatch_all();
					revoke(object_url);
					filesaver.readyState = filesaver.DONE;
				});
				return;
			}

			fs_error();
		}
		, FS_proto = FileSaver.prototype
		, saveAs = function(blob, name, no_auto_bom) {
			return new FileSaver(blob, name || blob.name || "download", no_auto_bom);
		}
	;
	FS_proto.abort = function(){};
	FS_proto.readyState = FS_proto.INIT = 0;
	FS_proto.WRITING = 1;
	FS_proto.DONE = 2;

	FS_proto.error =
	FS_proto.onwritestart =
	FS_proto.onprogress =
	FS_proto.onwrite =
	FS_proto.onabort =
	FS_proto.onerror =
	FS_proto.onwriteend =
		null;

	return saveAs;
}(
	   typeof self !== "undefined" && self
	|| typeof window !== "undefined" && window
	|| this
));
