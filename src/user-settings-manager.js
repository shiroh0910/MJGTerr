import { googleDriveService } from './google-drive-service.js';
import { USER_SETTINGS_PREFIX } from './constants.js';

export class UserSettingsManager {
  constructor() {
    this.settings = {
      // readAnnouncementId: null, // 既読のお知らせID
      // lastMapCenter: [lat, lng],
      // lastMapZoom: 18,
      // ... other settings
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
        this.settings = files[0].data;
      }
    } catch (error) {
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
}