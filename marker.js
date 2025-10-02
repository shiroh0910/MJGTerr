import L from 'leaflet';
import { saveToDrive, loadFromDrive, reverseGeocode, deleteFromDrive, loadAllMarkerData } from './google-drive.js';

let markers = {};
let editMode = false;

/**
 * 編集モードを切り替える
 */
export function toggleEditMode() {
  editMode = !editMode;
  const button = document.getElementById('edit-mode-button');
  if (button) {
    button.textContent = `編集モード ${editMode ? 'ON' : 'OFF'}`;
    button.classList.toggle('active', editMode);
  }
  // ポップアップの再描画を強制
  Object.values(markers).forEach(markerObj => {
    if (markerObj.marker.isPopupOpen()) {
      markerObj.marker.closePopup();
      markerObj.marker.openPopup();
    }
  });
}

/**
 * 新規マーカーを地図に追加
 * @param {L.LatLng} latlng
 * @param {L.MarkerClusterGroup} markerClusterGroup
 */
export function addNewMarker(latlng, markerClusterGroup) {
  const markerId = `marker-new-${Date.now()}`;
  const marker = L.marker(latlng, { icon: createMarkerIcon('new') });

  markers[markerId] = { marker, data: { address: null, name: '', status: '未訪問', memo: '' } };

  marker.bindPopup(generatePopupContent(markerId, { isNew: true, address: "住所を取得中...", name: "", status: "未訪問", memo: "" }, true));

  marker.on('popupopen', () => {
    document.getElementById(`save-${markerId}`)?.addEventListener('click', () => saveNewMarker(markerId, latlng, markerClusterGroup));
    document.getElementById(`cancel-${markerId}`)?.addEventListener('click', () => cancelNewMarker(markerId, markerClusterGroup));

    reverseGeocode(latlng.lat, latlng.lng)
      .then(address => {
        const addressInput = document.getElementById(`address-${markerId}`);
        if (addressInput) addressInput.value = address;
      })
      .catch(error => {
        console.error("リバースジオコーディング失敗:", error);
        const addressInput = document.getElementById(`address-${markerId}`);
        if (addressInput) addressInput.value = "住所の取得に失敗しました";
      });
  });

  markerClusterGroup.addLayer(marker);
  marker.openPopup();
}

/**
 * 新規マーカーの情報を保存
 * @param {string} markerId
 * @param {L.LatLng} latlng
 * @param {L.MarkerClusterGroup} markerClusterGroup
 */
async function saveNewMarker(markerId, latlng, markerClusterGroup) {
  const address = document.getElementById(`address-${markerId}`).value;
  const name = document.getElementById(`name-${markerId}`).value;
  const status = document.getElementById(`status-${markerId}`).value;
  const memo = document.getElementById(`memo-${markerId}`).value;

  if (!address) return alert('住所を入力してください');

  try {
    const existingMarker = Object.values(markers).find(m => m.data.address === address);
    if (existingMarker) return alert(`住所「${address}」は既に登録されています。`);

    const existingData = await loadFromDrive(address);
    if (existingData) return alert(`住所「${address}」は既に登録されています。`);

    const saveData = { lat: latlng.lat, lng: latlng.lng, status, memo, name };
    await saveToDrive(address, saveData);

    const markerData = markers[markerId];
    markerData.data = { address, ...saveData };
    markerData.marker.setIcon(createMarkerIcon(status));
    markerData.marker.closePopup();
    markerData.marker.unbindPopup();
    setupMarkerPopup(markerId, markerData.marker, markerData.data, markerClusterGroup);

    console.log(`新規マーカー保存: ${address}`);
  } catch (error) {
    console.error('新規マーカー保存エラー:', error);
    alert('データの保存に失敗しました');
    markerClusterGroup.removeLayer(markers[markerId].marker);
    delete markers[markerId];
  }
}

function cancelNewMarker(markerId, markerClusterGroup) {
  if (markers[markerId]) {
    markerClusterGroup.removeLayer(markers[markerId].marker);
    delete markers[markerId];
  }
}

/**
 * Google Driveから読み込んだマーカーを地図に描画
 * @param {L.MarkerClusterGroup} markerClusterGroup
 */
export async function renderMarkersFromDrive(markerClusterGroup) {
  try {
    const results = await loadAllMarkerData();
    markerClusterGroup.clearLayers();
    markers = {};

    results.forEach(({ address, data }, index) => {
      if (data.lat && data.lng) {
        const markerId = `marker-drive-${index}`;
        const marker = L.marker([data.lat, data.lng], { icon: createMarkerIcon(data.status) });
        markers[markerId] = { marker, data: { address, ...data } };
        setupMarkerPopup(markerId, marker, markers[markerId].data, markerClusterGroup);
        markerClusterGroup.addLayer(marker);
      }
    });
  } catch (error) {
    console.error('マーカーデータ描画エラー:', error);
  }
}

function setupMarkerPopup(markerId, marker, data, markerClusterGroup) {
  marker.bindPopup(() => generatePopupContent(markerId, data, editMode));
  marker.on('popupopen', () => {
    document.getElementById(`save-${markerId}`)?.addEventListener('click', () => saveEdit(markerId, data.address));
    document.getElementById(`delete-${markerId}`)?.addEventListener('click', () => deleteMarker(markerId, data.address, markerClusterGroup));
  });
}

async function saveEdit(markerId, address) {
  try {
    const markerData = markers[markerId];
    const status = document.getElementById(`status-${markerId}`).value;
    const memo = document.getElementById(`memo-${markerId}`).value;

    const updatedData = { ...markerData.data, status, memo };
    await saveToDrive(address, updatedData);

    markerData.data.status = status;
    markerData.data.memo = memo;
    markerData.marker.setIcon(createMarkerIcon(status));
    markerData.marker.closePopup();
    console.log(`更新: ${address}`);
  } catch (error) {
    console.error(`保存エラー:`, error);
    alert('更新に失敗しました。');
  }
}

async function deleteMarker(markerId, address, markerClusterGroup) {
  if (!confirm(`住所「${address}」を削除しますか？`)) return;

  try {
    await deleteFromDrive(address);
    if (markers[markerId]) {
      markerClusterGroup.removeLayer(markers[markerId].marker);
      delete markers[markerId];
      console.log(`マーカー削除: ${address}`);
    }
  } catch (error) {
    console.error('削除エラー:', error);
    alert('削除に失敗しました。');
  }
}

function createMarkerIcon(status) {
  let className = 'marker-icon ';
  switch (status) {
    case '未訪問': className += 'marker-unvisited'; break;
    case '訪問済み': className += 'marker-visited'; break;
    case '不在': className += 'marker-absent'; break;
    case 'new':
    default: className += 'marker-new'; break;
  }
  return L.divIcon({ className, iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12] });
}

function generatePopupContent(markerId, data, isEditMode) {
  const { address, name, status, memo, isNew = false } = data;
  const title = isNew ? '新しい住所の追加' : (name || address);
  const statuses = ['未訪問', '訪問済み', '不在'];
  const statusOptions = statuses.map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${s}</option>`).join('');

  let buttons = '';
  if (isNew) {
    buttons = `<button id="save-${markerId}">保存</button><button id="cancel-${markerId}">キャンセル</button>`;
  } else if (isEditMode) {
    buttons = `<button id="save-${markerId}">保存</button><button id="delete-${markerId}">削除</button>`;
  } else {
    buttons = `<button id="save-${markerId}">保存</button>`;
  }

  return `
    <div id="popup-${markerId}">
      <b>${title}</b><br>
      住所: ${isNew ? `<input type="text" id="address-${markerId}" value="${address || ''}">` : address}<br>
      ${isNew ? `名前: <input type="text" id="name-${markerId}" value="${name || ''}"><br>` : ''}
      ステータス: <select id="status-${markerId}">${statusOptions}</select><br>
      メモ: <textarea id="memo-${markerId}">${memo || ''}</textarea><br>
      ${buttons}
    </div>
  `;
}
