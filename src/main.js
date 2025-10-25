import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser, setGeolocationFallback } from './map.js';
import { MapManager } from './map-manager.js';
import { MarkerManager } from './marker-manager.js'; // この行は直接使われないが、依存関係として明確化
import { BoundaryManager } from './boundary-manager.js'; // この行は直接使われないが、依存関係として明確化
import { ApartmentEditor } from './apartment-editor.js'; // この行は直接使われないが、依存関係として明確化
import { UserSettingsManager } from './user-settings-manager.js';
import { PopupContentFactory } from './popup-content-factory.js'; // この行は直接使われないが、依存関係として明確化
import { UIManager } from './ui.js';
import { showModal, showToast } from './utils.js';
import { googleDriveService } from './google-drive-service.js';
import { ExportPanel } from './export-panel.js';
import { AuthController } from './auth.js';

/**
 * アプリケーションのメインクラス
 * 全体の初期化と各マネージャーの連携を管理する
 */
class App {
  constructor() {
    this.uiManager = new UIManager();
    this.mapManager = new MapManager(map, markerClusterGroup, this.uiManager);
    this.exportPanel = new ExportPanel();
    this.authController = new AuthController(this.uiManager, this._onSignedIn.bind(this));
  }

  /**
   * アプリケーションのメイン処理を開始する
   */
  async run() {
    // アプリケーション起動時に地図を一度だけセットアップする
    this._setupMap();
    this._setupEventListeners();
    this._displayVersionInfo();
    await this.authController.initialize();
  }

  /**
   * 地図関連の初期設定を行う
   * @private
   */
  _setupMap() {
    // 国土地理院の出典を静的に追加
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>');
    map.attributionControl.addAttribution('出典: <a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>');
    const { baseLayers } = initializeMap( // initializeMapに初期レイヤー名を渡す
      (e) => { // onMapClick
        if (this.mapManager.isMarkerEditMode) {
          this.mapManager.addNewMarker(e.latlng);
        }
      },
      { // callbacks
        onFollowingStatusChange: (isFollowing) => this.uiManager.updateFollowingStatus(isFollowing),
        onBaseLayerChange: (layerName) => {
          this.mapManager.saveUserSettings({ selectedTileLayer: layerName });
        },
        onMapViewChange: (view) => {
          this.mapManager.saveUserSettings({
            lastMapCenter: view.center,
            lastMapZoom: view.zoom
          });
        }
      }
    );
    this.mapManager.setBaseLayers(baseLayers);
    this.uiManager.updateFollowingStatus(true); // 地図のセットアップ後に追従モードをON
  }

  /**
   * サインインが成功したときに呼び出されるコールバック
   * @private
   */
  async _onSignedIn() {
    let settings = {};
    try {
      // 1. ユーザー設定とアプリ共通設定を並行して読み込む
      [settings] = await Promise.all([
        this.mapManager.loadUserSettings(),
        this.mapManager.loadAppSettings()
      ]);

      // 2. 読み込んだ設定でタイルレイヤーを切り替える
      const initialLayerName = settings?.selectedTileLayer || "淡色地図";
      if (this.mapManager.baseLayers[initialLayerName]) {
        this.mapManager.baseLayers[initialLayerName].addTo(map);
      }

      // 3. 区域データを読み込んで表示する
      await this.mapManager.loadAllBoundaries();
      // 4. マーカーデータを読み込む (ローディング表示はrenderMarkersFromDrive内で行われる)
      await this.mapManager.renderMarkersFromDrive();

      // 5. フィルター設定を適用
      if (settings && settings.filteredAreaNumbers) {
        this.mapManager.applyAreaFilter(settings.filteredAreaNumbers);
      }

      // 6. 保存された地図の視点があれば、フォールバックとして設定する
      if (settings && settings.lastMapCenter && settings.lastMapZoom) {
        setGeolocationFallback(settings.lastMapCenter, settings.lastMapZoom);
      }
    } catch (error) {
      console.error('データの初期読み込みに失敗しました:', error);
      showToast('データの読み込みに失敗しました。', 'error');
    } finally {
      // ローディング完了後に、お知らせをチェック・表示する
      // settingsはtryブロックで既に読み込まれているため、それを渡す
      await this._checkAndShowAnnouncements(settings);
    }
  }

  /**
   * UIのイベントリスナーを初期化する
   * @private
   */
  _setupEventListeners() {
    this.uiManager.initializeEventListeners(
      this.mapManager,
      { // mapController
        centerMapToCurrentUser: () => {
          centerMapToCurrentUser();
          this.uiManager.updateFollowingStatus(true);
        }
      },
      this.exportPanel, // exportPanel
      this.authController
    );
  }

  /**
   * 未読のお知らせがあれば表示する
   * @param {object} userSettings ユーザー設定
   * @private
   */
  async _checkAndShowAnnouncements(userSettings) {
    try {
      const announcementData = await this.mapManager.getAnnouncements();
      if (!announcementData || !announcementData.id || !announcementData.content) {
        return; // お知らせがない、または形式が不正
      }

      const readAnnouncementId = userSettings.readAnnouncementId || null;

      // お知らせのIDが既読IDと異なる場合、モーダルで表示
      if (announcementData.id !== readAnnouncementId) {
        const contentHtml = announcementData.content.replace(/\n/g, '<br>');
        await showModal(contentHtml, { type: 'alert' });
        // モーダルを閉じたら、お知らせを既読として保存
        await this.mapManager.saveUserSettings({ readAnnouncementId: announcementData.id });
      }
    } catch (error) {
      console.warn('お知らせの取得または表示に失敗しました:', error);
    }
  }

  /**
   * ビルド情報を画面に表示する
   * @private
   */
  _displayVersionInfo() {
    // バージョン表示用の要素を動的に作成
    const versionDisplay = document.createElement('div');
    versionDisplay.id = 'app-version-display';
    document.body.appendChild(versionDisplay);

    const branch = import.meta.env.VITE_GIT_BRANCH;
    const buildDate = import.meta.env.VITE_BUILD_DATE;

    if (branch === 'main' || branch === 'master' || branch === 'develop') {
      versionDisplay.textContent = `Release: ${buildDate.slice(0, 10)}`;
    } else {
      versionDisplay.textContent = `Branch: ${branch}`;
    }

    versionDisplay.addEventListener('click', () => {
      const buildInfo = `Branch: ${branch}<br>Build Date: ${buildDate}`;
      showModal(buildInfo, { type: 'alert' });
    });
  }
}

/**
 * Google Identity Services (GIS) のクライアントスクリプトを動的に読み込む
 * @returns {Promise<void>}
 */
function loadGoogleGsiClient() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google GSI client failed to load.'));
    document.head.appendChild(script);
  });
}

// アプリケーションのエントリーポイント
async function main() {
  await loadGoogleGsiClient();
  const app = new App();
  app.run();
}

main();
