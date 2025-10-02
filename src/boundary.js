import L from 'leaflet';
import { saveToDrive, loadAllDataFromDrive, deleteFromDrive } from './google-drive.js';

const BOUNDARY_PREFIX = 'boundary_';
let isDrawing = false;
let tempPoints = [];
let tempLayerGroup = null;
let boundaries = {}; // { areaNumber: { layer, data } }

/**
 * 境界線描画モードのON/OFFを切り替える
 * @param {L.Map} map
 */
export function toggleBoundaryDrawing(map) {
  isDrawing = !isDrawing;
  const button = document.getElementById('boundary-draw-button');
  button.classList.toggle('active-green', isDrawing);

  if (isDrawing) {
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
function finishDrawing(map) {
  if (tempPoints.length < 3) {
    alert('多角形を描画するには、少なくとも3つの頂点が必要です。');
    return;
  }

  const areaNumber = prompt('区域番号を入力してください:');  // 描画を完了し、保存プロセスを開始する
  if (!areaNumber) {
    alert('区域番号が入力されなかったため、描画をキャンセルしました。');
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

  // 描画モードをOFFにしてから保存処理を行う
  toggleBoundaryDrawing(map);

  saveBoundary(map, areaNumber, geoJson); // 描画モードをOFFにする
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

    alert(`区域「${areaNumber}」を保存しました。`);
  } catch (error) {
    console.error('境界線の保存に失敗しました:', error);
    alert('境界線の保存に失敗しました。');
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
  polygon.on('click', (e) => {
    const drawButton = document.getElementById('boundary-draw-button');
    if (drawButton && drawButton.classList.contains('active')) {
      if (confirm(`区域「${geoJson.properties.areaNumber}」を削除しますか？`)) {
        deleteBoundary(map, geoJson.properties.areaNumber).then(() => {
          // 削除が成功したら、現在の描画モードをキャンセルしてOFFにする
          toggleBoundaryDrawing(map);
        });
      }
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
    }
  } catch (error) {
    console.error('境界線の削除に失敗しました:', error);
    alert('境界線の削除に失敗しました。');
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
