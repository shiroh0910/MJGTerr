import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { showToast } from './utils.js';
import { MAP_DEFAULT_ZOOM, MAP_DEFAULT_CENTER, MAP_TILE_LAYERS } from './constants.js';

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

export class MapController {
  constructor(onMapClick, onFollowingStatusChange, onAddressChange) {
    this.onMapClick = onMapClick;
    this.onAddressChange = onAddressChange;

    this.map = L.map('map', { dragging: true, tap: false, zoomControl: false, maxZoom: MAP_DEFAULT_ZOOM })
      .addControl(L.control.zoom({ position: 'bottomright' }));
    
    this.map.addLayer(markerClusterGroup);

    this.currentUserPositionMarker = null;
    this.onFollowingStatusChange = onFollowingStatusChange;
    this.isFollowingUser = true;
  }

  /**
   * 地図を初期化し、イベントリスナーを設定する
   * @param {(layerName: string) => void} onBaseLayerChange - ベースレイヤー変更時のコールバック
   * @returns {{baseLayers: object}} - 定義されたベースレイヤーオブジェクト
   */
  initialize(onBaseLayerChange) {
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

    L.control.layers(baseLayers, null, { position: 'bottomright' }).addTo(this.map);

    this.map.on('baselayerchange', (e) => onBaseLayerChange(e.name));
    this.map.on('movestart', this._onMoveStart.bind(this));
    this.map.on('moveend', this._onMoveEnd.bind(this));
    this.map.on('click', this.onMapClick);
    this.map.on('zoomend', this._onZoomEnd.bind(this));

    this._setupGeolocation();

    return { baseLayers, mapInstance: this.map };
  }

  centerMapToCurrentUser() {
    if (this.currentUserPositionMarker) {
      this.isFollowingUser = true;
      this.onFollowingStatusChange(true);
      this.map.setView(this.currentUserPositionMarker.getLatLng(), MAP_DEFAULT_ZOOM);
    }
  }

  _onMoveStart() {
    this.isFollowingUser = false;
    this.onFollowingStatusChange(false);
  }

  async _onMoveEnd() {
    const center = this.map.getCenter();
    this.onAddressChange(center.lat, center.lng);
  }

  _onZoomEnd() {
    if (this.currentUserPositionMarker) {
      const newRadius = this._calculateRadiusByZoom(this.map.getZoom());
      this.currentUserPositionMarker.setStyle({ radius: newRadius });
    }
  }

  _setupGeolocation() {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          if (this.currentUserPositionMarker) {
            this.currentUserPositionMarker.setLatLng([latitude, longitude]);
            if (this.isFollowingUser) {
              this.map.setView([latitude, longitude]);
            }
          } else {
            this.map.setView([latitude, longitude], MAP_DEFAULT_ZOOM);
            const initialRadius = this._calculateRadiusByZoom(this.map.getZoom());
            this.currentUserPositionMarker = L.circleMarker([latitude, longitude], {
              radius: initialRadius,
              color: '#007bff',
              fillColor: '#007bff',
              fillOpacity: 0.5
            }).addTo(this.map).bindPopup("現在地");
          }
        },
        () => {
          showToast('位置情報の取得に失敗しました。', 'warning');
          this.map.setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM);
        }
      );
    } else {
      showToast('このブラウザは位置情報サービスに対応していません。', 'info');
      this.map.setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM);
    }
  }

  _calculateRadiusByZoom = (zoom) => zoom >= 18 ? 10 : zoom >= 15 ? 8 : 6;
}
