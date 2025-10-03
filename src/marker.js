import L from 'leaflet';
import { saveToDrive, loadFromDrive, deleteFromDrive, loadAllMarkerData } from './google-drive.js';
import { reverseGeocode, isPointInPolygon, showToast, showModal } from './utils.js';

let markers = {};
let editMode = false;

/**
 * 編集モードを切り替える
 */
export function toggleEditMode() {
  editMode = !editMode;
  const button = document.getElementById('edit-mode-button');
  if (button) {
    button.classList.toggle('active-green', editMode);
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

  if (!address) {
    showToast('住所を入力してください', 'error');
    return;
  }

  try {
    const existingMarker = Object.values(markers).find(m => m.data.address === address);
    if (existingMarker) {
      showToast(`住所「${address}」は既に登録されています。`, 'error');
      return;
    }

    const existingData = await loadFromDrive(address);
    if (existingData) { showToast(`住所「${address}」は既に登録されています。`, 'error'); return; }

    const saveData = { lat: latlng.lat, lng: latlng.lng, status, memo, name };
    await saveToDrive(address, saveData);

    const markerData = markers[markerId];
    markerData.data = { address, ...saveData };
    markerData.marker.setIcon(createMarkerIcon(status));
    markerData.marker.closePopup();
    markerData.marker.unbindPopup();
    setupMarkerPopup(markerId, markerData.marker, markerData.data, markerClusterGroup);
    showToast('新しい住所を保存しました', 'success');
  } catch (error) {
    console.error('新規マーカー保存エラー:', error);
    showToast('データの保存に失敗しました', 'error');
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

    results.forEach(({ name, data }) => {
      const address = name.replace('.json', '');
      if (data.lat && data.lng) {
        const markerId = `marker-drive-${address}`; // IDを住所ベースにして一意性を高める
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
    showToast('更新しました', 'success');
    markerData.marker.closePopup();
  } catch (error) {
    console.error(`保存エラー:`, error);
    showToast('更新に失敗しました', 'error');
  }
}

async function deleteMarker(markerId, address, markerClusterGroup) {
  const confirmed = await showModal(`住所「${address}」を削除しますか？`);
  if (!confirmed) return;

  try {
    await deleteFromDrive(address);
    if (markers[markerId]) {
      markerClusterGroup.removeLayer(markers[markerId].marker);
      delete markers[markerId];
      showToast('削除しました', 'success');
    }
  } catch (error) {
    console.error('削除エラー:', error);
    showToast('削除に失敗しました', 'error');
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

function getPopupButtons(markerId, isNew, isEditMode) {
  if (isNew) {
    return `<button id="save-${markerId}">保存</button><button id="cancel-${markerId}">キャンセル</button>`;
  }
  if (isEditMode) {
    return `<button id="save-${markerId}">保存</button><button id="delete-${markerId}">削除</button>`;
  }
  // 編集モードOFFの既存マーカーには保存ボタンのみ表示
  return `<button id="save-${markerId}">保存</button>`;
}

function generatePopupContent(markerId, data, isEditMode) {
  const { address, name, status, memo, isNew = false } = data;
  const title = isNew ? '新しい住所の追加' : (name || address);
  const statuses = ['未訪問', '訪問済み', '不在'];
  const statusOptions = statuses.map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${s}</option>`).join('');

  const buttons = getPopupButtons(markerId, isNew, isEditMode);

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

/**
 * 指定されたポリゴン内に含まれるマーカーのみを表示する
 * @param {L.Polygon|null} polygon - フィルタリングに使用するポリゴン。nullの場合は全マーカーを表示。
 * @param {L.MarkerClusterGroup} markerClusterGroup
 */
export function filterMarkersByPolygon(polygon, markerClusterGroup) {
  markerClusterGroup.clearLayers();

  const allMarkers = Object.values(markers);

  if (!polygon) {
    // フィルタリング解除: 全マーカーを再表示
    allMarkers.forEach(markerObj => markerClusterGroup.addLayer(markerObj.marker));
    return;
  }

  // GeoJSONから頂点座標リストを取得 [lng, lat]
  const polygonVertices = polygon.toGeoJSON().features[0].geometry.coordinates[0];

  allMarkers.forEach(markerObj => {
    const markerLatLng = markerObj.marker.getLatLng();
    const point = [markerLatLng.lng, markerLatLng.lat];
    if (isPointInPolygon(point, polygonVertices)) {
      markerClusterGroup.addLayer(markerObj.marker);
    }
  });
}

/**
 * 指定されたポリゴン内のすべてのマーカーを「未訪問」ステータスにリセットする
 * @param {L.Polygon} polygon - 対象のポリゴン
 */
export async function resetMarkersInPolygon(polygon) {
  if (!polygon) {
    throw new Error('リセット対象のポリゴンが指定されていません。');
  }

  // GeoJSONから頂点座標リストを取得 [lng, lat]
  const polygonVertices = polygon.toGeoJSON().features[0].geometry.coordinates[0];
  const allMarkers = Object.values(markers);
  const updatePromises = [];

  allMarkers.forEach(markerObj => {
    const markerLatLng = markerObj.marker.getLatLng();
    const point = [markerLatLng.lng, markerLatLng.lat];

    // マーカーがポリゴン内にあり、かつステータスが「未訪問」でない場合
    if (isPointInPolygon(point, polygonVertices) && markerObj.data.status !== '未訪問') {
      // ローカルのデータを更新
      markerObj.data.status = '未訪問';
      // アイコンを更新
      markerObj.marker.setIcon(createMarkerIcon('未訪問'));
      // Google Driveへの保存処理をプロミスの配列に追加
      updatePromises.push(saveToDrive(markerObj.data.address, markerObj.data));
    }
  });

  // すべての更新処理が完了するのを待つ
  await Promise.all(updatePromises);
}
