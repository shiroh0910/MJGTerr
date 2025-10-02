const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly';
const FOLDER_NAME = 'PWA_Visits';

let accessToken = null;
let folderId = null;

/**
 * Google Drive APIクライアントを初期化し、認証状態を確認する
 * @param {function} onSignedIn - サインイン成功時のコールバック
 */
export async function initGoogleDriveAPI(onSignedIn) {
  try {
    // gapi.loadはPromiseを返さないため、コールバックをPromiseでラップ
    await new Promise(resolve => gapi.load('client', resolve));
    await gapi.client.init({ apiKey: GOOGLE_API_KEY });
    await gapi.client.load('drive', 'v3');

    accessToken = localStorage.getItem('gdrive_access_token');
    if (accessToken) {
      gapi.client.setToken({ access_token: accessToken });
      await findOrCreateFolder();
      updateSigninStatus(true);
      onSignedIn();
    } else {
      updateSigninStatus(false);
    }
  } catch (error) {
    console.error('Google API初期化エラー:', error);
    updateSigninStatus(false);
  }
}

/**
 * ログイン処理
 * @param {function} onSignedIn - サインイン成功時のコールバック
 */
export function handleSignIn(onSignedIn) {
  const tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.access_token) {
        accessToken = tokenResponse.access_token;
        localStorage.setItem('gdrive_access_token', accessToken);
        gapi.client.setToken({ access_token: accessToken });
        findOrCreateFolder().then(() => {
          updateSigninStatus(true);
          onSignedIn(); // サインイン後の処理を実行
        }).catch(error => {
          console.error('フォルダ初期化エラー:', JSON.stringify(error, null, 2));
          updateSigninStatus(false);
        });
      } else {
        console.error('トークン取得エラー:', tokenResponse);
      }
    }
  });
  tokenClient.requestAccessToken();
}

/**
 * ログアウト処理
 */
export function handleSignOut() {
  if (accessToken) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  localStorage.removeItem('gdrive_access_token');
  accessToken = null;
  gapi.client.setToken({ access_token: null });
  updateSigninStatus(false);
}

/**
 * UIのサインイン状態を更新
 * @param {boolean} isSignedIn
 */
function updateSigninStatus(isSignedIn) {
  document.getElementById('sign-in-button').style.display = isSignedIn ? 'none' : 'block';
  document.getElementById('sign-out-button').style.display = isSignedIn ? 'block' : 'none';
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
 * Google Driveからすべてのマーカーデータを読み込む
 */
export async function loadAllDataFromDrive(prefix = '') {
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
    console.error('全マーカーデータの読み込みに失敗:', error);
    throw error;
  }
}

export async function loadAllMarkerData() {
    if (!folderId) throw new Error('フォルダIDが未設定です。');
    try {
        // `boundary_` で始まるファイルを除外するクエリ
        const response = await gapi.client.drive.files.list({
            q: `name != 'boundary_' and not name starts with 'boundary_' and '${folderId}' in parents and mimeType='application/json' and trashed=false`,
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
        console.error('マーカーデータの読み込みに失敗:', error);
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
