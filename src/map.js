import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { reverseGeocode } from './utils.js';

const DEFAULT_ZOOM = 18;
const DEFAULT_CENTER = [34.3140, 132.3080]; // 広島県廿日市市阿品台東中心

export const map = L.map('map', { dragging: true, tap: false });
export const markerClusterGroup = L.markerClusterGroup({
  disableClusteringAtZoom: 18
});

let currentUserPositionMarker = null;
let isFollowingUser = true;

/**
 * 地図を初期化し、イベントリスナーを設定する
 * @param {function} onMapClick - 地図クリック時のコールバック
 */
export function initializeMap(onMapClick) {
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: '出典: <a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>',
    maxZoom: DEFAULT_ZOOM
  }).addTo(map);

  map.addLayer(markerClusterGroup);

  setupGeolocation();

  map.on('movestart', () => {
    isFollowingUser = false;
    updateFollowingStatusButton();
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
    updateFollowingStatusButton();
    map.setView(currentUserPositionMarker.getLatLng(), DEFAULT_ZOOM);
  } else {
    alert('現在位置がまだ取得できていません。');
  }
}

export function updateFollowingStatusButton() {
  const button = document.getElementById('center-map-button');
  if (button) {
    button.classList.toggle('active', isFollowingUser);
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
