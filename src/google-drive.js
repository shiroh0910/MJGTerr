const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'openid profile email https://www.googleapis.com/auth/drive';
const FOLDER_NAME = 'PWA_Visits';

let accessToken = null;
let folderId = null;
let onSignedInCallback = null;
let onAuthStatusChangeCallback = null;
let isInitialized = false; // 初期化済みフラグ
let currentUserInfo = null; // ユーザー情報を保持する

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

    // 認証ライブラリの初期化をここで行う
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });

    // --- サイレント認証の試行 ---
    // ユーザーが既に必要な権限を許可しているか確認する
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          // サイレント認証成功
          accessToken = tokenResponse.access_token;
          localStorage.setItem('gdrive_access_token', accessToken);

          // IDトークンからユーザー情報を取得してUIを更新
          const idToken = localStorage.getItem('gdrive_id_token');
          if (idToken) {
            const userInfo = parseJwtPayload(idToken); // ここではuserInfoをローカル変数として扱う
            currentUserInfo = userInfo; // モジュールスコープの変数に保存
            if (onAuthStatusChangeCallback) {
              onAuthStatusChangeCallback(true, userInfo);
            }
          }
          findSharedFolder().then(onSignedInCallback);
        }
        // 失敗した場合は、ユーザーの手動操作（「はじめる」ボタン）を待つので何もしない
      },
    });

    // UIを表示せずにトークン取得を試みる
    tokenClient.requestAccessToken({ prompt: '' });

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
        if (response.error) {
          console.error('アクセストークンが取得できませんでした:', response.error);
          // 認証フローを中断し、サインアウト状態にする
          handleSignOut();
          return;
        }

        accessToken = response.access_token;
        localStorage.setItem('gdrive_access_token', accessToken);

        const idToken = localStorage.getItem('gdrive_id_token');
        // アクセストークン取得時に、id_tokenからユーザー情報を確実に設定する
        if (idToken) {
          const userInfo = parseJwtPayload(idToken); // ここではuserInfoをローカル変数として扱う
          currentUserInfo = userInfo; // モジュールスコープの変数に保存
          if (onAuthStatusChangeCallback) {
            onAuthStatusChangeCallback(true, userInfo);
          }
        }

        // 認証が成功したら、フォルダの準備とデータ読み込みを開始する
        findSharedFolder().then(onSignedInCallback);
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
    const userInfo = parseJwtPayload(response.credential); // ここではuserInfoをローカル変数として扱う
    currentUserInfo = userInfo; // モジュールスコープの変数に保存

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
  currentUserInfo = null; // ユーザー情報もクリア
  if (onAuthStatusChangeCallback) {
    onAuthStatusChangeCallback(false, null);
  }
}

/**
 * ユーザーが現在認証済みかどうかを確認する
 * @returns {boolean}
 */
export function isAuthenticated() {
  return !!accessToken;
}

/**
 * 現在ログインしているユーザーの情報を取得する
 * @returns {object | null}
 */
export function getCurrentUser() {
  return currentUserInfo;
}

/**
 * 共有されたアプリ用フォルダを検索する
 */
async function findSharedFolder() {
  try {
    // 'sharedWithMe' を条件に加え、自分自身がオーナーであるフォルダも検索対象に含める
    const query = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const fields = encodeURIComponent('files(id, name)');
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await response.json();

    if (!response.ok) throw new Error(`APIエラー: ${data.error.message}`);

    if (data.files && data.files.length > 0) {
      folderId = data.files[0].id; // 最初に見つかったフォルダを使用
    } else {
      // フォルダが見つからない場合は、処理を中断してエラーを投げる
      throw new Error(`フォルダ「${FOLDER_NAME}」が見つかりません。管理者にフォルダを共有してもらっているか確認してください。`);
    }

    return folderId;
  } catch (error) {
    console.error('共有フォルダの検索に失敗:', error);
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
 * @param {string} filename - ファイル名 (拡張子なし)
 * @param {object} data
 */
export async function saveToDrive(filename, data) {
  console.log(`[saveToDrive] 開始: filename=${filename}`, data);
  if (!folderId) {
    console.error('[saveToDrive] エラー: folderIdが未設定です。');
    throw new Error('フォルダIDが未設定です。');
  }

  try {
    const fileContent = JSON.stringify(data, null, 2);
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    // 拡張子を含めた完全なファイル名で検索
    const fullFilename = `${filename}.json`;
    const query = `name='${fullFilename}' and '${folderId}' in parents and trashed=false`;
    console.log(`[saveToDrive] ファイル検索クエリ: ${query}`);
    const listResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const listData = await listResponse.json();
    console.log('[saveToDrive] ファイル検索結果:', listData);
    if (!listResponse.ok) throw new Error(listData.error.message);

    const files = listData.files;
    const fileExists = files && files.length > 0;
    const fileId = fileExists ? files[0].id : null;
    console.log(`[saveToDrive] ファイルは存在しますか？: ${fileExists}, fileId: ${fileId}`);

    const metadata = fileExists ? { name: fullFilename } : { name: fullFilename, mimeType: 'application/json', parents: [folderId] };
    const path = fileExists ? `/upload/drive/v3/files/${fileId}` : '/upload/drive/v3/files';
    const method = fileExists ? 'PATCH' : 'POST';
    console.log(`[saveToDrive] アップロード実行: method=${method}, path=${path}`);

    const multipartRequestBody = [
      delimiter,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      delimiter,
      'Content-Type: application/json\r\n\r\n',
      fileContent,
      closeDelimiter
    ].join('');

    const uploadResponse = await fetch(`https://www.googleapis.com${path}?uploadType=multipart`, {
      method: method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      throw new Error(errorData.error.message);
    }
    const result = await uploadResponse.json();
    console.log('[saveToDrive] 保存成功:', result);
    return result;
  } catch (error) {
    console.error('[saveToDrive] Driveへの保存に失敗:', error);
    throw error;
  }
}

/**
 * Google Driveからファイルを削除する
 * @param {string} filename - ファイル名 (拡張子なし)
 */
export async function deleteFromDrive(filename) {
  if (!folderId) throw new Error('フォルダIDが未設定です。');

  try {
    const fullFilename = `${filename}.json`;
    const query = encodeURIComponent(`name='${fullFilename}' and '${folderId}' in parents and trashed=false`);
    const listResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const listData = await listResponse.json();
    if (!listResponse.ok) throw new Error(listData.error.message);

    const files = listData.files;
    if (files && files.length > 0) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
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
    const query = encodeURIComponent(`name starts with '${prefix}' and '${folderId}' in parents and mimeType='application/json' and trashed=false`);
    const fields = encodeURIComponent('files(id, name)');
    const listResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const listData = await listResponse.json();
    if (!listResponse.ok) throw new Error(listData.error.message);

    const files = listData.files;
    if (!files || files.length === 0) return [];

    const loadPromises = files.map(async (file) => {
      const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      return {
        name: file.name,
        data: await fileResponse.json()
      };
    });

    return Promise.all(loadPromises);
  } catch (error) {
    console.error(`プレフィックス '${prefix}' のデータ読み込みに失敗:`, error);
    throw error;
  }
}
