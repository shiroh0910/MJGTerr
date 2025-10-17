import { DRIVE_FOLDER_NAME, GOOGLE_API_SCOPES, GOOGLE_DRIVE_API_FILES_URL, GOOGLE_DRIVE_API_UPLOAD_URL } from './constants.js';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

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

class GoogleDriveService {
  constructor() {
    this.accessToken = null;
    this.folderId = null;
    this.currentUserInfo = null;
    this.isInitialized = false;
    this.tokenClient = null;
  }

  /**
   * Google Identity Services (GIS) クライアントライブラリがロードされるのを待つ
   * @returns {Promise<void>}
   */
  waitForGsiClient() {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        // window.google.accounts.id が利用可能になったら待機を終了
        if (window.google && window.google.accounts && window.google.accounts.id) {
          clearInterval(interval);
          resolve();
        }
      }, 100); // 100ミリ秒ごとにチェック
    });
  }

  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: this._handleSignIn.bind(this),
      auto_select: true
    });

    window.google.accounts.id.prompt();
  }

  requestAccessToken() {
    if (this.tokenClient) {
      // ユーザーのクリック操作によって呼び出されることを想定
      this.tokenClient.requestAccessToken({ prompt: 'consent' })
        .then(response => this._handleTokenResponse(response))
        .catch(err => console.error("requestAccessToken failed", err));

    }
  }

  signOut() {
    const token = this.accessToken;
    if (token) {
      window.google.accounts.oauth2.revoke(token, () => {});
    }
    localStorage.removeItem('gdrive_access_token');
    localStorage.removeItem('gdrive_id_token');
    this.accessToken = null;
    this.currentUserInfo = null;
    this._dispatchAuthChangeEvent(false, null);
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  getCurrentUser() {
    return this.currentUserInfo;
  }

  _initializeTokenClient() {
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_API_SCOPES,
      callback: this._handleTokenResponse.bind(this),
    });
  }

  async _handleSignIn(response) {
    localStorage.setItem('gdrive_id_token', response.credential);
    const userInfo = parseJwtPayload(response.credential);

    if (this.currentUserInfo && this.currentUserInfo.sub !== userInfo.sub) {
      this.signOut();
    }
    this.currentUserInfo = userInfo;

    this._initializeTokenClient();
    this.tokenClient.requestAccessToken({ prompt: '' }); // サイレントでアクセストークンを要求
  }

  _handleTokenResponse(response) {
    if (response.error || !response.access_token) {      
      console.error('アクセストークンが取得できませんでした:', response);
      return this.signOut();
    }
    this.accessToken = response.access_token;
    localStorage.setItem('gdrive_access_token', this.accessToken);
    this._findSharedFolder().then(() => this._dispatchAuthChangeEvent(true, this.currentUserInfo));
  }

  /**
   * 認証ヘッダーを付与してfetchを実行し、エラーハンドリングを行う共通メソッド
   * @private
   */
  async _fetchWithAuth(url, options = {}, isRetry = false) {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${this.accessToken}`,
    };

    let response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      // 401エラー（認証エラー）かつ、まだリトライしていない場合
      if (response.status === 401 && !isRetry) {
        try {
          // 新しいアクセストークンの取得を試みる
          await this._refreshAccessToken();
          // トークン再取得後、リクエストを一度だけ再試行する
          return this._fetchWithAuth(url, options, true);
        } catch (refreshError) {
          // トークン再取得に失敗した場合はサインアウト
          console.error('トークンの再取得に失敗しました。サインアウトします。', refreshError);
          this.signOut();
          alert('セッションの有効期限が切れました。再度ログインしてください。');
          // 元のエラーをスローして処理を中断
          throw new Error('セッションが切れました。');
        }
      }

      // その他のエラー、またはリトライ後の401エラー
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(errorData.error.message);
    }

    return response;
  }

  /**
   * アクセストークンをサイレントで再取得する
   * @private
   */
  _refreshAccessToken() {
    return new Promise((resolve, reject) => {
      if (!this.tokenClient) {
        return reject(new Error('Token client is not initialized.'));
      }
      this.tokenClient.requestAccessToken({
        prompt: '', // ユーザー操作なしで実行
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(response.error || new Error('Failed to refresh access token.'));
          } else {
            this.accessToken = response.access_token;
            localStorage.setItem('gdrive_access_token', this.accessToken);
            resolve(this.accessToken);
          }
        }
      });
    });
  }

  /**
   * 認証状態の変更をカスタムイベントで通知する
   * @private
   */
  _dispatchAuthChangeEvent(isSignedIn, userInfo) {
    const event = new CustomEvent('auth-status-change', {
      detail: { isSignedIn, userInfo }
    });
    document.dispatchEvent(event);
  }

  async _findSharedFolder() {
    try {
      const query = `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const fields = 'files(id, name)';
      const url = `${GOOGLE_DRIVE_API_FILES_URL}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`;
      const response = await this._fetchWithAuth(url);
      const data = await response.json();

      if (data.files && data.files.length > 0) {
        this.folderId = data.files[0].id;
      } else {
        throw new Error(`フォルダ「${DRIVE_FOLDER_NAME}」が見つかりません。管理者にフォルダを共有してもらっているか確認してください。`);
      }
    } catch (error) {
      console.error('共有フォルダの検索に失敗:', error);
      throw error;
    }
  }

  async save(filename, data) {
    if (!this.folderId) throw new Error('フォルダIDが未設定です。');
  
    const fullFilename = `${filename}.json`;
    const query = `name='${fullFilename}' and '${this.folderId}' in parents and trashed=false`;
    const listUrl = `${GOOGLE_DRIVE_API_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id)`;
  
    try {
      // 1. まずファイルが存在するか検索する
      const listResponse = await this._fetchWithAuth(listUrl);
      const listData = await listResponse.json();
      const fileId = (listData.files && listData.files.length > 0) ? listData.files[0].id : null;
      
      // 2. fileIdの有無に応じて、新規作成または更新を行う
      return await this._uploadFile(fullFilename, data, fileId);
    } catch (error) {
      console.error('Driveへの保存に失敗:', error);
      throw error;
    }
  }

  /**
   * ファイルをアップロードする（新規作成または更新）
   * @private
   */
  async _uploadFile(fullFilename, data, fileId) {
    const metadata = fileId ? { name: fullFilename } : { name: fullFilename, mimeType: 'application/json', parents: [this.folderId] };
    const method = fileId ? 'PATCH' : 'POST';
    const uploadUrl = fileId ? `${GOOGLE_DRIVE_API_UPLOAD_URL}/${fileId}` : GOOGLE_DRIVE_API_UPLOAD_URL;

    const finalUploadUrl = `${uploadUrl}?uploadType=multipart`;

    const boundary = '-------314159265358979323846';
    const multipartRequestBody = [
      `\r\n--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\n`,
      'Content-Type: application/json\r\n\r\n',
      JSON.stringify(data, null, 2),
      `\r\n--${boundary}--`
    ].join('');

    const response = await this._fetchWithAuth(finalUploadUrl, {
      method: method,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipartRequestBody
    });

    return response.json();
  }

  async delete(filename) {
    if (!this.folderId) throw new Error('フォルダIDが未設定です。');
    try {
      const fullFilename = `${filename}.json`;
      const query = `name='${fullFilename}' and '${this.folderId}' in parents and trashed=false`;
      const listUrl = `${GOOGLE_DRIVE_API_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id)`;
      const listResponse = await this._fetchWithAuth(listUrl);
      const listData = await listResponse.json();

      if (listData.files && listData.files.length > 0) {
        await this._fetchWithAuth(`${GOOGLE_DRIVE_API_FILES_URL}/${listData.files[0].id}`, { method: 'DELETE' });
      }
    } catch (error) {
      console.error('Driveからのファイル削除に失敗:', error);
      throw error;
    }
  }

  async loadByPrefix(prefix) {
    if (!this.folderId) throw new Error('フォルダIDが未設定です。');
    try {
      const searchKey = prefix.endsWith('.json') ? 'name =' : 'name starts with';
      const query = `${searchKey} '${prefix}' and '${this.folderId}' in parents and trashed=false`;
      const fields = 'files(id, name)';
      const listUrl = `${GOOGLE_DRIVE_API_FILES_URL}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`;
      const listResponse = await this._fetchWithAuth(listUrl);
      const listData = await listResponse.json();

      const files = listData.files;
      if (!files || files.length === 0) return [];

      const loadPromises = files.map(async (file) => {
        const fileResponse = await this._fetchWithAuth(`${GOOGLE_DRIVE_API_FILES_URL}/${file.id}?alt=media`);
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
}

// シングルトンインスタンスをエクスポート
export const googleDriveService = new GoogleDriveService();