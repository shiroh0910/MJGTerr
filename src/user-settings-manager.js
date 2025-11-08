import { googleDriveService } from './google-drive-service.js';
import { USER_SETTINGS_PREFIX } from './constants.js';

export class UserSettingsManager {
  constructor() {
    this.settings = {
      // readAnnouncementId: null, // 既読のお知らせID
      // lastMapCenter: [lat, lng],
      // lastMapZoom: 18,
      // ... other settings
      // isLoadedフラグを追加。Driveからの読み込みが成功した場合のみtrueになる。
      // これにより、読み込み前の意図しない保存を防ぐ。
      isLoaded: false,
    };
  }

  /**
   * ユーザー固有の設定ファイル名を取得する
   * @returns {string | null} ファイル名 or null
   * @private
   */
  _getFilename() {
    const user = googleDriveService.getCurrentUser();
    // ユーザーID(sub)の代わりにメールアドレスをファイル名に使用する
    // メールアドレスの'@'や'.'を'_'に置換して、ファイル名として安全な文字列にする
    if (user && user.email) {
      return `${USER_SETTINGS_PREFIX}${user.email.replace(/[@.]/g, '_')}`;
    }
    return null;
  }

  /**
   * ユーザー設定をGoogle Driveから読み込む
   * @returns {Promise<object>}
   */
  async load() {
    const filename = this._getFilename();
    if (!filename) {
      // ユーザーが認証されていない場合、設定は読み込まれない。
      // 既存のsettingsがあればそれを返し、なければ空のオブジェクトで初期化する。
      return this.settings;
    }
    try {
      // 拡張子を含めた完全なファイル名で検索する
      const files = await googleDriveService.loadByPrefix(`${filename}.json`);
      if (files && files.length > 0) {
        // 読み込んだ設定に isLoaded: true をマージして、読み込み成功を記録
        this.settings = { ...files[0].data, isLoaded: true };
      }
    } catch (error) {
      // 読み込みに失敗した場合、isLoadedはfalseのままになる
      this.settings.isLoaded = false;
      // エラーが発生してもアプリの起動を妨げないように、既存の設定を維持する
      console.error('ユーザー設定の読み込みに失敗しました:', error);
    }
    return this.settings;
  }

  /**
   * ユーザー設定をGoogle Driveに保存する
   * @param {object} newSettings 保存する設定オブジェクト
   */
  async save(newSettings) {
    const filename = this._getFilename();
    if (!filename) return;

    // isLoadedフラグをチェックし、一度も正常に読み込まれていない場合は、
    // 絶対に保存処理を行わない。これにより、初期状態やエラー時に
    // 不完全な設定で上書きされるのを完全に防ぐ。
    if (!this.settings.isLoaded) {
      console.warn('UserSettings have not been loaded from Drive. Save operation is blocked to prevent data loss.');
      return;
    }

    // このメソッドからは selectedTileLayer の保存を絶対に許可しない。
    // タイルレイヤーの保存は saveTileLayerSetting メソッド経由でのみ許可する。
    if (newSettings.hasOwnProperty('selectedTileLayer')) {
      console.warn('Attempted to save tile layer setting via save(). This is not allowed. Use saveTileLayerSetting() instead.');
      return;
    }

    try {
      // 1. Driveから最新の設定を読み込む (他のデバイスでの変更を反映するため)
      const currentSettings = await this.load();
      
      // 2. Driveの設定、現在のメモリ上の設定、新しい変更の3つをマージする。
      //    - Driveにファイルがない初回起動時でも、メモリ上の設定(例: レイヤー選択)が失われないようにする。
      //    - newSettings を最後に展開することで、今回の変更が確実に適用されるようにする。
      this.settings = { ...currentSettings, ...this.settings, ...newSettings };

      await googleDriveService.save(filename, this.settings);
    } catch (error) {
      console.error('ユーザー設定の保存に失敗しました:', error);
    }
  }

  /**
   * タイルレイヤー設定のみを専門に保存するメソッド。
   * このメソッドを経由しない限り、タイルレイヤー設定は保存されない。
   * @param {string} layerName 保存するタイルレイヤー名
   */
  async saveTileLayerSetting(layerName) {
    const filename = this._getFilename();
    if (!filename || !this.settings.isLoaded) {
      return; // ファイル名がない、または設定が未読込の場合は何もしない
    }

    // 現在の設定に、新しいタイルレイヤー設定のみをマージして保存
    const settingsToSave = { ...this.settings, selectedTileLayer: layerName };
    await googleDriveService.save(filename, settingsToSave);
  }
}