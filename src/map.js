import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import 'leaflet.gridlayer.googlemutant';
import { reverseGeocode, showToast } from './utils.js'; // MAP_MAX_GLOBAL_ZOOM をインポート
import { MAP_DEFAULT_ZOOM, MAP_DEFAULT_CENTER, MAP_TILE_LAYERS, MAP_MAX_GLOBAL_ZOOM, GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_DARK_STYLE } from './constants.js';

export const map = L.map('map', { dragging: true, tap: false, zoomControl: false, maxZoom: MAP_MAX_GLOBAL_ZOOM })
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
let currentLayerName = "淡色地図"; // 現在表示中のレイヤー名を追跡

/**
 * 地図を初期化し、イベントリスナーを設定する
 * @param {(e: L.LeafletMouseEvent) => void} onMapClick - 地図クリック時のコールバック
 * @param {{onFollowingStatusChange: (isFollowing: boolean) => void, onBaseLayerChange: (layerName: string) => void, onMapViewChange: (view: {center: number[], zoom: number}) => void}} callbacks - 各種イベントのコールバック
 * @returns {{baseLayers: object}} - 定義されたベースレイヤーオブジェクト
 */
export function initializeMap(onMapClick, callbacks = {}) {
  const { onFollowingStatusChange = () => {}, onBaseLayerChange = () => {}, onMapViewChange = () => {} } = callbacks;

  // ベースとなるタイルレイヤーを定義
  const baseLayers = {
    // attributionはmain.jsで静的に追加するため、ここでは削除
    "淡色地図": L.tileLayer(MAP_TILE_LAYERS.PALE.url, { maxZoom: MAP_DEFAULT_ZOOM }),
    "航空写真": L.tileLayer(MAP_TILE_LAYERS.SEAMLESS_PHOTO.url, { maxZoom: MAP_DEFAULT_ZOOM })
  };

  // Google Maps APIキーが設定されている場合、Google Mapsレイヤーを追加
  if (GOOGLE_MAPS_API_KEY) {
    baseLayers["Google Maps"] = L.gridLayer.googleMutant({
      type: MAP_TILE_LAYERS.GOOGLE_ROADMAP.type,
      apiKey: GOOGLE_MAPS_API_KEY,
      maxZoom: MAP_MAX_GLOBAL_ZOOM
    });
    baseLayers["Google Maps (航空写真)"] = L.gridLayer.googleMutant({
      type: MAP_TILE_LAYERS.GOOGLE_SATELLITE.type,
      apiKey: GOOGLE_MAPS_API_KEY,
      maxZoom: MAP_MAX_GLOBAL_ZOOM
    });
    baseLayers["Google Maps (ハイブリッド)"] = L.gridLayer.googleMutant({
      type: MAP_TILE_LAYERS.GOOGLE_HYBRID.type,
      apiKey: GOOGLE_MAPS_API_KEY,
      maxZoom: MAP_MAX_GLOBAL_ZOOM
    });
    baseLayers["Google Maps (ダーク)"] = L.gridLayer.googleMutant({
      type: MAP_TILE_LAYERS.GOOGLE_ROADMAP.type,
      styles: GOOGLE_MAPS_DARK_STYLE,
      apiKey: GOOGLE_MAPS_API_KEY,
      maxZoom: MAP_MAX_GLOBAL_ZOOM
    });
  };

  // デフォルトの地図レイヤーを初期表示として追加
  baseLayers["淡色地図"].addTo(map);

  // レイヤー切り替えコントロールを地図に追加
  L.control.layers(baseLayers, null, { position: 'bottomright' }).addTo(map);

  // レイヤー変更イベントをリッスンし、コールバックを呼び出す
  map.on('baselayerchange', (e) => {
    currentLayerName = e.name;
    onBaseLayerChange(e.name);
  });

  map.addLayer(markerClusterGroup);

  setupGeolocation(onFollowingStatusChange);

  map.on('movestart', () => {
    isFollowingUser = false;
    onFollowingStatusChange(isFollowingUser);
  });

  map.on('moveend', function() { // `this` を `map` に束縛するためにアロー関数を使わない
    const center = map.getCenter();
    updateAddressDisplay(center.lat, center.lng);
    // 地図の視点変更を通知
    onMapViewChange({
      center: [center.lat, center.lng],
      zoom: map.getZoom()
    });
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
function setupGeolocation(onFollowingStatusChange) {
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
    map.setView(currentUserPositionMarker.getLatLng(), MAP_DEFAULT_ZOOM);
  } else {
    showToast('現在地が取得できていません。', 'warning');
  }
}

/**
 * ダークモードの状態に応じて地図のテーマを切り替える
 * @param {boolean} isDark 
 */
export function switchMapTheme(isDark) {
  const layerMapping = {
    "Google Maps": "Google Maps (ダーク)",
    "Google Maps (ダーク)": "Google Maps",
  };

  const targetLayerName = layerMapping[currentLayerName];

  // 現在のレイヤーがマッピング対象で、かつ切り替え先レイヤーが存在する場合のみ切り替える
  if (targetLayerName && map.options.layers.some(l => l.options.name === targetLayerName)) {
    // isDarkフラグと現在のレイヤー名から、切り替えるべきか判断
    const shouldSwitchToDark = isDark && currentLayerName === "Google Maps";
    const shouldSwitchToLight = !isDark && currentLayerName === "Google Maps (ダーク)";

    if (shouldSwitchToDark || shouldSwitchToLight) {
      map.eachLayer(layer => { if (layer.options.name === targetLayerName) layer.bringToFront(); });
    }
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
