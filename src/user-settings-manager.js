import { googleDriveService } from './google-drive-service.js';
import { USER_SETTINGS_PREFIX } from './constants.js';

export class UserSettingsManager {
  constructor() {
    this.settings = {};
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
      this.settings = {};
      return this.settings;
    }
    try {
      // 拡張子を含めた完全なファイル名で検索する
      const files = await googleDriveService.loadByPrefix(`${filename}.json`);
      if (files && files.length > 0) {
        this.settings = files[0].data;
      } else {
        this.settings = {}; // ファイルがない場合は空のオブジェクト
      }
    } catch (error) {
      // エラーが発生してもアプリの起動を妨げないように、空の設定を返す
      console.error('ユーザー設定の読み込みに失敗しました:', error);
      this.settings = {};
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

    this.settings = { ...this.settings, ...newSettings };
    try {
      await googleDriveService.save(filename, this.settings);
    } catch (error) {
      console.error('ユーザー設定の保存に失敗しました:', error);
    }
  }
}