import L from 'leaflet';
import { saveToDrive, loadAllDataFromDrive, deleteFromDrive } from './google-drive.js';
import { isBoundaryDrawMode } from './main.js';
import { showToast, showModal } from './utils.js';
import { map } from './map.js';

const BOUNDARY_PREFIX = 'boundary_';
let tempPoints = [];
let tempLayerGroup = null;
let boundaries = {}; // { areaNumber: { layer, data } }

/**
 * 境界線描画モードのON/OFFを切り替える
 * @param {L.Map} map
 */
export function toggleBoundaryDrawing(map) {
  // isBoundaryDrawMode は main.js で管理されている
  if (isBoundaryDrawMode) {
    startDrawing(map);
  } else {
    cancelDrawing(map);
  }
}

/**
 * 描画モードを開始する
 * @param {L.Map} map
 */
function startDrawing(map) {
  map.on('click', handleMapClick);
  tempLayerGroup = L.layerGroup().addTo(map);
  tempPoints = [];

  // 完了ボタンを一時的に表示
  const finishButton = document.createElement('button');
  finishButton.id = 'finish-drawing-button';
  finishButton.textContent = '描画完了';
  finishButton.style.position = 'absolute';
  finishButton.style.top = '50px';
  finishButton.style.left = '80px';
  finishButton.style.zIndex = '1000';
  document.body.appendChild(finishButton);
  finishButton.addEventListener('click', () => finishDrawing(map));
}

/**
 * 描画モードをキャンセル/終了する
 * @param {L.Map} map
 */
function cancelDrawing(map) {
  map.off('click', handleMapClick);
  if (tempLayerGroup) {
    tempLayerGroup.clearLayers();
    map.removeLayer(tempLayerGroup);
    tempLayerGroup = null;
  }
  tempPoints = [];
  const finishButton = document.getElementById('finish-drawing-button');
  if (finishButton) {
    finishButton.remove();
  }
}

/**
 * 描画中の地図クリックイベント
 * @param {L.LeafletEvent} e
 */
function handleMapClick(e) {
  tempPoints.push(e.latlng);
  // 頂点マーカーを追加
  L.circleMarker(e.latlng, { radius: 5, color: 'red' }).addTo(tempLayerGroup);
  // ポリラインを更新
  if (tempPoints.length > 1) {
    tempLayerGroup.getLayers().filter(layer => layer instanceof L.Polyline).forEach(layer => tempLayerGroup.removeLayer(layer));
    L.polyline(tempPoints, { color: 'blue', weight: 3 }).addTo(tempLayerGroup);
  }
}

/**
 * 描画を完了し、保存プロセスを開始する
 * @param {L.Map} map
 */
async function finishDrawing(map) {
  if (tempPoints.length < 3) {
    showToast('多角形を描画するには、少なくとも3つの頂点が必要です。', 'error');
    return;
  }

  const areaNumber = await showModal('区域番号を入力してください:', { type: 'prompt' });
  if (!areaNumber) {
    showToast('区域番号が入力されなかったため、描画をキャンセルしました。', 'info');
    toggleBoundaryDrawing(map); // 描画モードをOFFにする
    return;
  }

  const lnglats = tempPoints.map(p => [p.lng, p.lat]); // GeoJSON仕様に合わせて [経度, 緯度] の順にする
  const geoJson = {
    type: 'Feature',
    properties: { areaNumber },
    geometry: {
      type: 'Polygon',
      coordinates: [lnglats.concat([lnglats[0]])] // 閉じたポリゴンにする
    }
  };

  // 一時的な描画レイヤーを消去
  cancelDrawing(map);
  // 保存処理を実行
  saveBoundary(map, areaNumber, geoJson);
}

/**
 * 境界線データを保存し、地図に描画する
 * @param {L.Map} map
 * @param {string} areaNumber
 * @param {object} geoJson
 */
async function saveBoundary(map, areaNumber, geoJson) {
  try {
    const fileName = `${BOUNDARY_PREFIX}${areaNumber}`;
    await saveToDrive(fileName, geoJson);

    const polygon = renderBoundary(map, geoJson);
    boundaries[areaNumber] = { layer: polygon, data: geoJson };

    showToast(`区域「${areaNumber}」を保存しました。`, 'success');
  } catch (error) {
    console.error('境界線の保存に失敗しました:', error);
    showToast('境界線の保存に失敗しました。', 'error');
  }
}

/**
 * 境界線データを地図上に描画する
 * @param {L.Map} map
 * @param {object} geoJson
 * @returns {L.Layer}
 */
function renderBoundary(map, geoJson) {
  const polygon = L.geoJSON(geoJson, {
    style: { color: 'blue', weight: 3, opacity: 0.7, fillColor: 'blue', fillOpacity: 0.2 }
  }).addTo(map);

  polygon.bindTooltip(geoJson.properties.areaNumber, { permanent: true, direction: 'center' });

  // 描画モード中にクリックで削除
  polygon.on('click', async (e) => {
    // 境界線モードが有効な場合のみ反応
    if (!isBoundaryDrawMode) return;

    L.DomEvent.stop(e); // 地図クリックイベントへの伝播を停止
    const confirmed = await showModal(`区域「${geoJson.properties.areaNumber}」を削除しますか？`);
    if (confirmed) {
      deleteBoundary(map, geoJson.properties.areaNumber);
    }
  });
  return polygon;
}

/**
 * 境界線を削除する
 * @param {L.Map} map
 * @param {string} areaNumber
 */
async function deleteBoundary(map, areaNumber) {
  try {
    const fileName = `${BOUNDARY_PREFIX}${areaNumber}`;
    await deleteFromDrive(fileName);
    if (boundaries[areaNumber]) {
      map.removeLayer(boundaries[areaNumber].layer);
      delete boundaries[areaNumber];
      showToast(`区域「${areaNumber}」を削除しました。`, 'success');
    }
  } catch (error) {
    console.error('境界線の削除に失敗しました:', error);
    showToast('境界線の削除に失敗しました。', 'error');
  }
}

/**
 * Google Driveからすべての境界線データを読み込んで描画する
 * @param {L.Map} map
 */
export async function loadAllBoundaries(map) {
  try {
    const boundaryFiles = await loadAllDataFromDrive(BOUNDARY_PREFIX);
    boundaryFiles.forEach(file => {
      const areaNumber = file.name.replace(BOUNDARY_PREFIX, '').replace('.json', '');
      const polygon = renderBoundary(map, file.data);
      boundaries[areaNumber] = { layer: polygon, data: file.data };
    });
  } catch (error) {
    console.error('境界線の読み込みに失敗しました:', error);
  }
}

/**
 * 指定された区域番号に基づいて境界線の表示をフィルタリングする
 * @param {string|null} areaNumber - フィルタリングする区域番号。nullの場合は全表示。
 */
export function filterBoundariesByArea(areaNumber) {
  Object.keys(boundaries).forEach(key => {
    const boundary = boundaries[key];
    // areaNumber が指定されている場合、一致しないものは非表示、一致するものは表示
    // areaNumber が null の場合、すべて表示
    if (areaNumber && key !== areaNumber) {
      map.removeLayer(boundary.layer);
    } else {
      if (!map.hasLayer(boundary.layer)) {
        map.addLayer(boundary.layer);
      }
    }
  });
}

/**
 * 区域番号で境界線レイヤーを取得する
 * @param {string} areaNumber
 * @returns {L.Layer|null}
 */
export function getBoundaryLayerByArea(areaNumber) {
  return boundaries[areaNumber] ? boundaries[areaNumber].layer : null;
}
