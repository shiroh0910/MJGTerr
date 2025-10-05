const TOKEN_KEY = 'user_auth_token';

/**
 * ログイン時に呼び出し、認証トークンを保存します。
 * @param {string} token - サーバーから受け取った認証トークン
 */
export function login(token) {
  localStorage.setItem(TOKEN_KEY, token);
  // 状態変更をアプリケーション全体に通知するためのカスタムイベント
  window.dispatchEvent(new Event('authchange'));
}

/**
 * ログアウト時に呼び出し、認証トークンを削除します。
 */
export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  // 状態変更をアプリケーション全体に通知するためのカスタムイベント
  window.dispatchEvent(new Event('authchange'));
}

/**
 * ユーザーがログインしているかどうかを確認します。
 * @returns {boolean} ログインしていればtrue
 */
export function isLoggedIn() {
  return !!localStorage.getItem(TOKEN_KEY);
}

/**
 * 認証状態の変更を監視するリスナーを登録します。
 * @param {Function} callback - 状態が変更されたときに実行される関数
 */
export function onAuthStateChanged(callback) {
  window.addEventListener('authchange', callback);
  // 初期表示のため、一度コールバックを実行
  callback();
}