import { googleDriveService } from './google-drive-service.js';
import { showToast } from './utils.js';

/**
 * 認証関連の処理を統括するクラス
 */
export class AuthController {
  /**
   * @param {import('./ui.js').UIManager} uiManager
   * @param {() => void} onSignedIn - サインイン成功時のコールバック
   */
  constructor(uiManager, onSignedIn) {
    this.uiManager = uiManager;
    this.onSignedIn = onSignedIn;
    this.isSignedIn = false;
  }

  /**
   * 認証プロセスの初期化とサイレントサインインの試行
   */
  async initialize() {
    await googleDriveService.initialize(this._handleAuthStatusChange.bind(this));
  }

  /**
   * サインインを要求する
   */
  requestSignIn() {
    // requestAccessTokenはPromiseを返すが、ここでは待機せず、
    // コールバック経由で認証フローが進むのを待つ
    googleDriveService.requestAccessToken();
  }

  /**
   * サインアウト処理
   */
  handleSignOut() {
    googleDriveService.signOut();
  }

  /**
   * 認証済みかどうかを返す
   * @returns {boolean}
   */
  isAuthenticated() {
    return googleDriveService.isAuthenticated();
  }

  /**
   * 認証状態の変更をハンドリングする
   * @param {boolean} isSignedIn
   * @param {object | null} userInfo
   * @private
   */
  _handleAuthStatusChange(isSignedIn, userInfo) {
    const wasSignedIn = this.isSignedIn;
    this.isSignedIn = isSignedIn;
    this.uiManager.updateSignInStatus(isSignedIn, userInfo);

    if (isSignedIn && userInfo) {
      // トースト表示を割愛し、即座にデータ読み込み処理を開始する
      this.onSignedIn();
    } else if (wasSignedIn) { // 以前はログインしていた場合のみメッセージ表示
      showToast('Googleアカウントからログアウトしました。', 'info');
    }
  }
}