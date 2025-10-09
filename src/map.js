import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { reverseGeocode } from './utils.js';

const DEFAULT_ZOOM = 18;
const DEFAULT_CENTER = [34.3140, 132.3080]; // 広島県廿日市市阿品台東中心

export const map = L.map('map', { dragging: true, tap: false, zoomControl: false })
  .addControl(L.control.zoom({ position: 'bottomright' }));

export const markerClusterGroup = L.markerClusterGroup({
  disableClusteringAtZoom: 18,
  iconCreateFunction: function(cluster) {
    const childMarkers = cluster.getAllChildMarkers();
    // '未訪問' のマーカーだけをカウント
    const notVisitedCount = childMarkers.filter(
      marker => marker.customData && marker.customData.status === '未訪問'
    ).length;

    let c = ' marker-cluster-';
    if (notVisitedCount < 10) {
      c += 'small';
    } else if (notVisitedCount < 100) {
      c += 'medium';
    } else {
      c += 'large';
    }

    // 未訪問が0件の場合はクラスタの色をグレーにする
    const customClass = notVisitedCount === 0 ? ' all-visited' : '';
    return new L.DivIcon({ html: `<div><span>${notVisitedCount}</span></div>`, className: `marker-cluster${c}${customClass}`, iconSize: new L.Point(40, 40) });
  }
});

let currentUserPositionMarker = null;
let isFollowingUser = true;

/**
 * 地図を初期化し、イベントリスナーを設定する
 * @param {(e: L.LeafletMouseEvent) => void} onMapClick - 地図クリック時のコールバック
 * @param {(isFollowing: boolean) => void} onFollowingStatusChange - 追従状態変更時のコールバック
 */
export function initializeMap(onMapClick, onFollowingStatusChange) {
  let onFollowChange = onFollowingStatusChange || (() => {});
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: '出典: <a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>',
    maxZoom: DEFAULT_ZOOM
  }).addTo(map);
  map.addLayer(markerClusterGroup);

  setupGeolocation();

  map.on('movestart', () => {
    isFollowingUser = false;
    onFollowChange(isFollowingUser);
  });

  map.on('moveend', () => {
    const center = map.getCenter();
    updateAddressDisplay(center.lat, center.lng);
  });

  map.on('click', onMapClick);

  map.on('zoomend', () => {
    if (currentUserPositionMarker) {
      const newRadius = calculateRadiusByZoom(map.getZoom());
      currentUserPositionMarker.setStyle({ radius: newRadius });
    }
  });
}

function setupGeolocation() {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (currentUserPositionMarker) {
          currentUserPositionMarker.setLatLng([latitude, longitude]);
          if (isFollowingUser) {
            map.setView([latitude, longitude]);
          }
        } else {
          map.setView([latitude, longitude], DEFAULT_ZOOM);
          const initialRadius = calculateRadiusByZoom(map.getZoom());
          currentUserPositionMarker = L.circleMarker([latitude, longitude], {
            radius: initialRadius,
            color: '#007bff',
            fillColor: '#007bff',
            fillOpacity: 0.5
          }).addTo(map).bindPopup("現在地");
        }
      },
      () => map.setView(DEFAULT_CENTER, DEFAULT_ZOOM) // Error fallback
    );
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM); // No geolocation support
  }
}

export function centerMapToCurrentUser() {
  if (currentUserPositionMarker) {
    isFollowingUser = true;
    // 状態変更をUIに通知する必要があるが、この関数はUI更新コールバックを知らない。
    // そのため、main.js側でUI更新を呼び出すか、イベントを発行する。
    // ここでは、map.fireを使うのがLeafletらしいやり方かもしれない。
    // 今回はシンプルに、main.jsで呼び出すことにし、ここでは何もしない。
    // → main.jsで直接uiManagerを呼ぶように変更。この関数はmap.jsに残すが、UI更新は責務外とする。
    map.setView(currentUserPositionMarker.getLatLng(), DEFAULT_ZOOM);
  }
}

async function updateAddressDisplay(lat, lng) {
  const addressDisplay = document.getElementById('current-address-display');
  if (!addressDisplay) return;
  try {
    addressDisplay.textContent = await reverseGeocode(lat, lng);
  } catch (error) {
    addressDisplay.textContent = '住所取得に失敗';
  }
}

const calculateRadiusByZoom = (zoom) => zoom >= 18 ? 10 : zoom >= 15 ? 8 : 6;
