const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'openid profile email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly';
const FOLDER_NAME = 'PWA_Visits';
import { showToast } from './utils.js';

let accessToken = null;
let folderId = null;
let onSignedInCallback = null;
let onAuthStatusChangeCallback = null;
let isInitialized = false; // 初期化済みフラグ

/**
 * JWTトークンのペイロードをデコードしてJSONオブジェクトとして返す
 * @param {string} token JWTトークン
 * @returns {object} ペイロードのJSONオブジェクト
 */
function parseJwtPayload(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return JSON.parse(jsonPayload);
}

/**
 * Google Drive APIクライアントを初期化し、認証状態を確認する
 * @param {() => void} onSignedIn - サインイン成功時のコールバック
 * @param {(isSignedIn: boolean, userInfo: object | null) => void} onAuthStatusChange - 認証状態変更時のコールバック
 */
export async function initGoogleDriveAPI(onSignedIn, onAuthStatusChange) {
  // 既に初期化済みの場合は何もしない
  if (isInitialized) {
    return;
  }
  isInitialized = true;
  onSignedInCallback = onSignedIn;
  onAuthStatusChangeCallback = onAuthStatusChange || (() => {});
  try {
    // gapi.loadはPromiseを返さないため、コールバックをPromiseでラップ
    await new Promise(resolve => gapi.load('client', resolve));
    await gapi.client.init({ apiKey: GOOGLE_API_KEY });
    await gapi.client.load('drive', 'v3');

    // 認証ライブラリの初期化をここで行う
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      // auto_select: true にすることで、ユーザーが過去にログインしたことがあれば
      // ページ読み込み時に自動で認証が実行される
      auto_select: true,
    });
  } catch (error) {
    console.error('Google API初期化エラー:', error);
    if (onAuthStatusChangeCallback) {
      onAuthStatusChangeCallback(false, null);
    }
  }
}

/**
 * Drive APIアクセスのためのアクセストークンを要求する
 * @returns {Promise<void>}
 */
export function requestAccessToken() {
  return new Promise((resolve) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      ux_mode: 'redirect', // ポップアップの代わりにリダイレクトを使用
      callback: (response) => {
        // エラーオブジェクトが存在するか、またはaccess_tokenがない場合
        if (response.error || !response.access_token) {
          console.error('アクセストークンが取得できませんでした。');
          // 認証フローを中断し、サインアウト状態にする
          handleSignOut();
          return;
        }
        accessToken = response.access_token;
        localStorage.setItem('gdrive_access_token', accessToken);
        gapi.client.setToken({ access_token: accessToken });
        
        // 認証が成功したら、フォルダの準備とデータ読み込みを開始する
        findOrCreateFolder().then(onSignedInCallback);
        resolve(); // Promiseを解決して待機を終了
      },
    });
    tokenClient.requestAccessToken();
  });
}

/**
 * Googleの認証情報レスポンスを処理するコールバック関数
 */
async function handleCredentialResponse(response) {
  try {
    // IDトークンからユーザー情報を取得
    localStorage.setItem('gdrive_id_token', response.credential);
    const userInfo = parseJwtPayload(response.credential);

    // UIにログイン状態を反映させる
    if (onAuthStatusChangeCallback) onAuthStatusChangeCallback(true, userInfo);

  } catch (error) {
    console.error('認証処理エラー:', error);
    if (onAuthStatusChangeCallback) {
      onAuthStatusChangeCallback(false, null);
    }
  }
}

/**
 * ログアウト処理
 */
export function handleSignOut() {
  const token = localStorage.getItem('gdrive_access_token');
  if (token) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  localStorage.removeItem('gdrive_access_token');
  localStorage.removeItem('gdrive_id_token');
  accessToken = null;
  gapi.client.setToken({ access_token: null });
  if (onAuthStatusChangeCallback) {
    onAuthStatusChangeCallback(false, null);
  }
}

/**
 * ユーザーにサインインを促すプロンプトを表示する
 */
export function promptSignIn() {
  window.google.accounts.id.prompt();
}

/**
 * ユーザーが現在認証済みかどうかを確認する
 * @returns {boolean}
 */
export function isAuthenticated() {
  return !!accessToken;
}

/**
 * アプリ用のフォルダを検索または作成
 */
async function findOrCreateFolder() {
  try {
    const response = await gapi.client.drive.files.list({
      q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)'
    });

    const folders = response.result.files;
    if (folders && folders.length > 0) {
      folderId = folders[0].id;
    } else {
      const file = await gapi.client.drive.files.create({
        resource: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id'
      });
      folderId = file.result.id;
    }
    return folderId;
  } catch (error) {
    console.error('フォルダの検索または作成に失敗:', error);
    // ここでトークン切れの可能性を考慮し、再ログインを促す
    if (error.status === 401) {
      handleSignOut(); // 古いトークンをクリア
      alert('セッションが切れました。再度ログインしてください。');
    }
    throw error; // エラーを再スローして呼び出し元に伝える
  }
}

/**
 * データをGoogle Driveに保存（新規作成または更新）
 * @param {string} address
 * @param {object} data
 */
export async function saveToDrive(address, data) {
  if (!folderId) {
    throw new Error('フォルダIDが未設定です。');
  }

  try {
    const fileContent = JSON.stringify(data, null, 2);
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const response = await gapi.client.drive.files.list({
      q: `name='${address}.json' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)'
    });

    const files = response.result.files;
    const fileExists = files && files.length > 0;
    const fileId = fileExists ? files[0].id : null;

    const metadata = fileExists ? { name: `${address}.json` } : { name: `${address}.json`, mimeType: 'application/json', parents: [folderId] };
    const path = fileExists ? `/upload/drive/v3/files/${fileId}` : '/upload/drive/v3/files';
    const method = fileExists ? 'PATCH' : 'POST';

    const multipartRequestBody =
      delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) +
      delimiter + 'Content-Type: application/json\r\n\r\n' + fileContent +
      closeDelimiter;

    return gapi.client.request({
      path: path, method: method, params: { uploadType: 'multipart' },
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipartRequestBody
    });
  } catch (error) {
    console.error('Driveへの保存に失敗:', error);
    throw error;
  }
}

/**
 * Google Driveからデータを読み込む
 * @param {string} address
 */
export async function loadFromDrive(address) {
  if (!folderId) throw new Error('フォルダIDが未設定です。');

  try {
    const response = await gapi.client.drive.files.list({
      q: `name='${address}.json' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)'
    });

    const files = response.result.files;
    if (!files || files.length === 0) {
      return null; // ファイルが存在しない
    }

    const fileResponse = await gapi.client.drive.files.get({ fileId: files[0].id, alt: 'media' });
    return JSON.parse(fileResponse.body);
  } catch (error) {
    console.error('Driveからのデータ読み込みに失敗:', error);
    throw error;
  }
}

/**
 * Google Driveからファイルを削除する
 * @param {string} address
 */
export async function deleteFromDrive(address) {
  if (!folderId) throw new Error('フォルダIDが未設定です。');

  try {
    const response = await gapi.client.drive.files.list({
      q: `name='${address}.json' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)'
    });

    const files = response.result.files;
    if (files && files.length > 0) {
      await gapi.client.drive.files.delete({ fileId: files[0].id });
    }
    // ファイルが存在しない場合は何もしない（成功とみなす）
  } catch (error) {
    console.error('Driveからのファイル削除に失敗:', error);
    throw error;
  }
}

/**
 * Google Driveから指定されたプレフィックスに一致するすべてのデータを読み込む
 * @param {string} prefix - ファイル名のプレフィックス (例: 'boundary_')
 * @returns {Promise<Array<{name: string, data: object}>>}
 */
export async function loadAllDataByPrefix(prefix) {
  if (!folderId) throw new Error('フォルダIDが未設定です。');

  try {
    const response = await gapi.client.drive.files.list({
      q: `name starts with '${prefix}' and '${folderId}' in parents and mimeType='application/json' and trashed=false`,
      fields: 'files(id, name)'
    });

    const files = response.result.files;
    if (!files || files.length === 0) return [];

    const loadPromises = files.map(async (file) => {
      const fileResponse = await gapi.client.drive.files.get({ fileId: file.id, alt: 'media' });
      return {
        name: file.name,
        data: JSON.parse(fileResponse.body)
      };
    });

    return Promise.all(loadPromises);
  } catch (error) {
    console.error(`プレフィックス '${prefix}' のデータ読み込みに失敗:`, error);
    throw error;
  }
}

// `loadAllMarkerData` は `loadAllDataByPrefix` を使って実装できないため、
// マーカー専用のクエリを持つ関数として維持する。
// `loadAllDataFromDrive` は責務が曖昧なため削除。
// `loadAllMarkerData` は `map-manager.js` で使用されている。
