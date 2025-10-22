import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { reverseGeocode, showToast } from './utils.js';
import { MAP_DEFAULT_ZOOM, MAP_DEFAULT_CENTER, MAP_TILE_LAYERS } from './constants.js';

export const map = L.map('map', { dragging: true, tap: false, zoomControl: false, maxZoom: MAP_DEFAULT_ZOOM })
  .addControl(L.control.zoom({ position: 'bottomright' }));

export const markerClusterGroup = L.markerClusterGroup({
  disableClusteringAtZoom: MAP_DEFAULT_ZOOM,
  iconCreateFunction: function(cluster) {
    const childMarkers = cluster.getAllChildMarkers();
    // '未訪問' のマーカーだけをカウント
    // さらに、集合住宅ではないマーカーのみを対象にする
    const notVisitedCount = childMarkers.filter(
      marker => marker.customData && marker.customData.status === '未訪問' && !marker.customData.isApartment
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
let fallbackCenter = MAP_DEFAULT_CENTER;
let fallbackZoom = MAP_DEFAULT_ZOOM;

/**
 * 地図を初期化し、イベントリスナーを設定する
 * @param {(e: L.LeafletMouseEvent) => void} onMapClick - 地図クリック時のコールバック
 * @param {{onFollowingStatusChange: (isFollowing: boolean) => void, onBaseLayerChange: (layerName: string) => void}} callbacks - 各種イベントのコールバック
 * @returns {{baseLayers: object}} - 定義されたベースレイヤーオブジェクト
 */
export function initializeMap(onMapClick, callbacks = {}) {
  const { onFollowingStatusChange = () => {}, onBaseLayerChange = () => {} } = callbacks;
  
  // ベースとなるタイルレイヤーを定義
  const baseLayers = {
    "淡色地図": L.tileLayer(MAP_TILE_LAYERS.PALE.url, {
      attribution: MAP_TILE_LAYERS.PALE.attribution,
      maxZoom: MAP_DEFAULT_ZOOM
    }),
    "航空写真": L.tileLayer(MAP_TILE_LAYERS.SEAMLESS_PHOTO.url, {
      attribution: MAP_TILE_LAYERS.SEAMLESS_PHOTO.attribution,
      maxZoom: MAP_DEFAULT_ZOOM
    })
  };

  // レイヤー切り替えコントロールを地図に追加
  L.control.layers(baseLayers, null, { position: 'bottomright' }).addTo(map);

  // レイヤー変更イベントをリッスンし、コールバックを呼び出す
  map.on('baselayerchange', (e) => {
    onBaseLayerChange(e.name);
  });

  map.addLayer(markerClusterGroup);

  setupGeolocation();

  map.on('movestart', () => {
    isFollowingUser = false;
    onFollowingStatusChange(isFollowingUser);
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

  return { baseLayers };
}

/**
 * 位置情報取得失敗時のフォールバック位置を設定する
 * @param {number[]} center 
 * @param {number} zoom 
 */
export function setGeolocationFallback(center, zoom) {
  fallbackCenter = center;
  fallbackZoom = zoom;
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
          map.setView([latitude, longitude], MAP_DEFAULT_ZOOM);
          const initialRadius = calculateRadiusByZoom(map.getZoom());
          currentUserPositionMarker = L.circleMarker([latitude, longitude], {
            radius: initialRadius,
            color: '#007bff',
            fillColor: '#007bff',
            fillOpacity: 0.5
          }).addTo(map).bindPopup("現在地");
        }
      },
      () => {
        showToast('位置情報の取得に失敗しました。', 'warning');
        map.setView(fallbackCenter, fallbackZoom);
      } // Error fallback
    );
  } else {
    showToast('このブラウザは位置情報サービスに対応していません。', 'info');
    map.setView(fallbackCenter, fallbackZoom); // No geolocation support
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
    map.setView(currentUserPositionMarker.getLatLng(), MAP_DEFAULT_ZOOM);
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
