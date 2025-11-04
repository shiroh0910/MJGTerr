import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser, setGeolocationFallback, awaitGoogleMapsInitialization } from './map.js';
import { MapManager } from './map-manager.js';
import { MarkerManager } from './marker-manager.js'; // この行は直接使われないが、依存関係として明確化
import { BoundaryManager } from './boundary-manager.js'; // この行は直接使われないが、依存関係として明確化
import { ApartmentEditor } from './apartment-editor.js'; // この行は直接使われないが、依存関係として明確化
import { UserSettingsManager } from './user-settings-manager.js';
import { PopupContentFactory } from './popup-content-factory.js'; // この行は直接使われないが、依存関係として明確化
import { UIManager } from './ui.js';
import { showModal, showToast, loadGoogleGsiClient } from './utils.js';
import { googleDriveService } from './google-drive-service.js';
import { ExportPanel } from './export-panel.js';
import { AuthController } from './auth.js';

/**
 * アプリケーションのメインクラス
 * 全体の初期化と各マネージャーの連携を管理する
 */

// URLに ?debug=true が含まれている場合のみ、デバッグツール(Eruda)を初期化します。
// Macがない環境でiPad/iPhoneのコンソールログを確認するために使用します。
if (new URLSearchParams(window.location.search).get('debug') === 'true') {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/eruda';
  document.head.appendChild(script);
  script.onload = function () {
    eruda.init();
    console.log('Eruda is initialized.');
  }
}

class App {
  constructor() {
    this.uiManager = new UIManager();
    this.mapManager = new MapManager(map, markerClusterGroup, this.uiManager, {
      onMarkerLanguageChange: this.handleMarkerLanguageChange.bind(this),
      onMarkerRefused: this.handleMarkerRefused.bind(this),
      onApartmentRoomLanguageChange: this.handleApartmentRoomLanguageChange.bind(this),
      onApartmentRoomRefused: this.handleApartmentRoomRefused.bind(this)
    });
    this.exportPanel = new ExportPanel();
    this.authController = new AuthController(this.uiManager, this._onSignedIn.bind(this));
  }

  /**
   * マーカーの言語が変更されたときに呼び出されるコールバック
   * @param {object} changeDetails 変更の詳細
   * @param {string} changeDetails.markerId マーカーID
   * @param {string} changeDetails.markerAddress マーカーの住所
   * @param {string} changeDetails.oldLanguage 変更前の言語
   * @param {string} changeDetails.newLanguage 変更後の言語
   */
  async handleMarkerLanguageChange({ markerId, markerAddress, oldLanguage, newLanguage }) {
    try {
      const user = this.authController.getCurrentUser();
      const userName = user ? user.displayName || user.email : '不明なユーザー';
      const reportMessage = `${userName} がマーカー「${markerAddress}」の言語を「${oldLanguage}」から「${newLanguage}」に変更しました。`;
      await this.mapManager.reportIssue({
        type: '言語変更報告',
        content: reportMessage
      });
    } catch (error) {
      console.error('言語変更レポートの作成に失敗しました:', error);
    }
  }

  /**
   * マーカーが訪問拒否に設定されたときに呼び出されるコールバック
   * @param {object} details 変更の詳細
   * @param {string} details.markerAddress マーカーの住所
   */
  async handleMarkerRefused({ markerAddress }) {
    try {
      const user = this.authController.getCurrentUser();
      const userName = user ? user.displayName || user.email : '不明なユーザー';
      const reportMessage = `${userName} がマーカー「${markerAddress}」を「訪問拒否」に設定しました。`;
      await this.mapManager.reportIssue({
        type: '訪問拒否設定報告',
        content: reportMessage
      });
    } catch (error) {
      console.error('訪問拒否設定レポートの作成に失敗しました:', error);
    }
  }

  /**
   * 集合住宅の部屋の言語が変更されたときに呼び出されるコールバック
   * @param {object} details 変更の詳細
   */
  async handleApartmentRoomLanguageChange({ apartmentAddress, roomNumber, oldLanguage, newLanguage }) {
    try {
      const user = this.authController.getCurrentUser();
      const userName = user ? user.displayName || user.email : '不明なユーザー';
      const reportMessage = `${userName} が集合住宅「${apartmentAddress}」の ${roomNumber}号室 の言語を「${oldLanguage}」から「${newLanguage}」に変更しました。`;
      await this.mapManager.reportIssue({
        type: '言語変更報告',
        content: reportMessage
      });
    } catch (error) {
      console.error('集合住宅の言語変更レポートの作成に失敗しました:', error);
    }
  }

  /**
   * 集合住宅の部屋が訪問拒否に設定されたときに呼び出されるコールバック
   * @param {object} details 変更の詳細
   */
  async handleApartmentRoomRefused({ apartmentAddress, roomNumber }) {
    try {
      const user = this.authController.getCurrentUser();
      const userName = user ? user.displayName || user.email : '不明なユーザー';
      const reportMessage = `${userName} が集合住宅「${apartmentAddress}」の ${roomNumber}号室 を「訪問拒否」に設定しました。`;
      await this.mapManager.reportIssue({
        type: '訪問拒否設定報告',
        content: reportMessage
      });
    } catch (error) {
      console.error('集合住宅の訪問拒否設定レポートの作成に失敗しました:', error);
    }
  }

  /**
   * アプリケーションのメイン処理を開始する
   */
  async run() {
    // 常にライトモードで表示するようにcolor-schemeを明示的に設定
    document.documentElement.style.colorScheme = 'light';

    // アプリケーション起動時に地図を一度だけセットアップする
    this._setupMap();
    this._setupEventListeners();
    this._displayVersionInfo();
    await this.authController.initialize();
  }

  /**
   * 認証状態の変更をハンドリングし、各マネージャーに伝達する
   * @param {CustomEvent} e
   * @private
   */
  _onAuthStatusChange(e) {
    this.mapManager.setAdminStatus(e.detail.isAdmin);
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
    // 先にローディングを開始
    this.uiManager.toggleLoading(true, 'ユーザー設定を読み込み中...');

    let settings = {};
    try {
      // 1. ユーザー設定とアプリ共通設定を並行して読み込む
      [settings] = await Promise.all([
        this.mapManager.loadUserSettings(),
        this.mapManager.loadAppSettings()
      ]);

      // Google Mapレイヤーの準備が整うまで待つ
      await awaitGoogleMapsInitialization();

      // 2. 読み込んだ設定でタイルレイヤーを切り替える
      const initialLayerName = settings?.selectedTileLayer || "淡色地図";
      if (this.mapManager.baseLayers[initialLayerName]) {
        this.mapManager.baseLayers[initialLayerName].addTo(map);
      }

      // 3. 区域データを読み込んで表示する
      this.uiManager.toggleLoading(true, '境界線データを読み込み中...');
      await this.mapManager.loadAllBoundaries();

      // 4. マーカーデータを読み込む (ローディング表示はrenderMarkersFromDrive内で行われる)
      this.uiManager.toggleLoading(true, 'マーカーを読み込み中...');
      await this.mapManager.renderMarkersFromDrive();

      // 5. フィルター設定を適用
      this.uiManager.toggleLoading(true, '地図表示を準備中...');
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
      // 読み込みが成功しても失敗しても、ローディング表示は必ず終了させる
      this.uiManager.toggleLoading(false);
      await this._checkAndShowAnnouncements(settings);
      await this.mapManager.checkManualUpdates(settings);
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

    // 認証状態の変更をAppレベルで監視
    document.addEventListener('auth-status-change', this._onAuthStatusChange.bind(this));
  }

  /**
   * 未読のお知らせがあれば表示する
   * @param {object} userSettings ユーザー設定
   * @private
   */
  async _checkAndShowAnnouncements(userSettings) {
    if (!userSettings) return; // ユーザー設定がなければ何もしない
    try {
      const announcementData = await this.mapManager.getAnnouncements();
      if (!announcementData || !announcementData.id || !announcementData.content) {
        return; // お知らせがない、または形式が不正
      }

      const readAnnouncementId = userSettings.readAnnouncementId || null;

      // お知らせのIDが既読IDと異なる場合、モーダルで表示
      if (announcementData.id !== readAnnouncementId && announcementData.content) {
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

    versionDisplay.textContent = (branch === 'main' || branch === 'master' || branch === 'develop')
      ? `Release: ${buildDate.slice(0, 10)}`
      : `Branch: ${branch}`;

    versionDisplay.addEventListener('click', () => {
      const buildInfo = `Branch: ${branch}<br>Build Date: ${buildDate}`;
      showModal(buildInfo, { type: 'alert' });
    });
  }
}

// アプリケーションのエントリーポイント
async function main() {
  try {
    await loadGoogleGsiClient();
    const app = new App();
    app.run();
  } catch (error) {
    console.error('アプリケーションの初期化に失敗しました:', error);
    showModal('アプリケーションの起動に必要なファイルの読み込みに失敗しました。ページを再読み込みしてください。', { type: 'alert' });
  }
}

main();
