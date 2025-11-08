import { DRIVE_FOLDER_NAME, GOOGLE_API_SCOPES, GOOGLE_DRIVE_API_FILES_URL, GOOGLE_DRIVE_API_UPLOAD_URL, ADMIN_USERS_FILENAME, USER_SETTINGS_PREFIX, GOOGLE_CLIENT_ID } from './constants.js';

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
    this.adminUsers = []; // 管理者メールアドレスのリスト
    this.tokenClient = null;
    this.adminUsersLoadedPromise = null;
    this._resolveAdminUsersLoaded = null;
  }

  async initialize() {
    console.log('[DEBUG] GoogleDriveService.initialize() started.');
    if (this.isInitialized) return;
    this.isInitialized = true;
    
    // localStorageからトークンを復元する試み
    const idToken = localStorage.getItem('gdrive_id_token');
    const accessToken = localStorage.getItem('gdrive_access_token');
    console.log(`[DEBUG] Tokens from localStorage - idToken: ${!!idToken}, accessToken: ${!!accessToken}`);
    // sessionStorageからキャッシュを復元する試み
    const cachedFolderId = sessionStorage.getItem('gdrive_folder_id');
    const cachedAdminUsers = sessionStorage.getItem('gdrive_admin_users');

    if (idToken && accessToken) {
      const userInfo = parseJwtPayload(idToken);
      const isExpired = userInfo.exp * 1000 < Date.now();

      if (!isExpired) {
        console.log('[DEBUG] Token is valid. Restoring session.');
        // トークンが有効な場合、認証情報を復元して処理を続行
        this.accessToken = accessToken;
        this.currentUserInfo = userInfo;
        
        // トークンリフレッシュのためにTokenClientを初期化
        this._initializeTokenClient();
        
        // sessionStorageにキャッシュがあればそれを使う
        if (cachedFolderId && cachedAdminUsers) {
          console.log('[DEBUG] Restoring from sessionStorage cache.');
          this.folderId = cachedFolderId;
          this.adminUsers = JSON.parse(cachedAdminUsers);
          this._dispatchAuthChangeEvent(true, this.currentUserInfo);
        } else {
          console.log('[DEBUG] No cache in sessionStorage. Fetching from Drive API.');
          // キャッシュがなければAPIを呼び出す
          await this._findSharedFolder();
          await this._loadAdminUsers();
          this._dispatchAuthChangeEvent(true, this.currentUserInfo);
        }

        console.log('[DEBUG] Session restored successfully.');
        return; // ここで処理を終了し、prompt()をスキップ
      }
      console.log('[DEBUG] Token is expired.');
    }

    // localStorageに有効なトークンがない場合、通常のサインインフローを開始
    console.log('[DEBUG] Initializing Google Accounts ID for prompt.');
    window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: this._handleSignIn.bind(this), auto_select: true });
    window.google.accounts.id.prompt();
    console.log('[DEBUG] Google Accounts ID prompt initiated.');
  }

  requestAccessToken() {
    if (this.tokenClient) {
      // ユーザーのクリック操作によって呼び出されることを想定
      this.tokenClient.requestAccessToken({ prompt: 'consent' })
        .then(response => this._handleTokenResponse(response))
        .catch(err => console.error("[DEBUG] requestAccessToken failed", err));

    }
  }

  signOut() {
    const token = this.accessToken;
    if (token) {
      window.google.accounts.oauth2.revoke(token, () => {});
    }
    console.log('[DEBUG] Signing out.');
    localStorage.removeItem('gdrive_access_token');
    localStorage.removeItem('gdrive_id_token');
    this.accessToken = null;
    this.currentUserInfo = null;
    this.adminUsers = [];
    this._dispatchAuthChangeEvent(false, null);
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  getCurrentUser() {
    return this.currentUserInfo;
  }

  /**
   * 現在のユーザーが管理者かどうかを返す
   * @returns {boolean}
   */
  async isAdmin() {
    // Vercelのプレビュー環境では、デバッグのために常に管理者権限を付与する
    if (import.meta.env.VITE_VERCEL_ENV === 'preview') return true;

    // 管理者リストの読み込みが完了するまで待機
    if (this.adminUsersLoadedPromise) await this.adminUsersLoadedPromise;

    if (!this.currentUserInfo || !this.currentUserInfo.email) return false;
    // adminUsersに現在のユーザーのメールアドレスが含まれているかチェック
    return this.adminUsers.includes(this.currentUserInfo.email);
  }

  _initializeTokenClient() {
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_API_SCOPES,
      callback: this._handleTokenResponse.bind(this),
    });
  }

  async _handleSignIn(response) {
    console.log('[DEBUG] _handleSignIn() called.');
    localStorage.setItem('gdrive_id_token', response.credential);
    const userInfo = parseJwtPayload(response.credential);

    if (this.currentUserInfo && this.currentUserInfo.sub !== userInfo.sub) {
      this.signOut();
    }
    this.currentUserInfo = userInfo;

    // 管理者リスト読み込み用のPromiseを初期化
    this.adminUsersLoadedPromise = new Promise(resolve => { this._resolveAdminUsersLoaded = resolve; });

    this._initializeTokenClient();
    console.log('[DEBUG] Requesting access token silently.');
    this.tokenClient.requestAccessToken({ prompt: '' }); // サイレントでアクセストークンを要求
  }

  _handleTokenResponse(response) {
    console.log('[DEBUG] _handleTokenResponse() called.');
    if (response.error || !response.access_token) {      
      console.error('[DEBUG] Failed to get access token:', response);
      return this.signOut();
    }
    console.log('[DEBUG] Access token obtained successfully.');
    this.accessToken = response.access_token;
    localStorage.setItem('gdrive_access_token', this.accessToken);
    console.log('[DEBUG] Starting _findSharedFolder and _loadAdminUsers.');
    this._findSharedFolder()
      .then(() => this._loadAdminUsers())
      .then(() => this._dispatchAuthChangeEvent(true, this.currentUserInfo));
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
          console.error('[DEBUG] Failed to refresh token. Signing out.', refreshError);
          // トークン再取得に失敗した場合はサインアウト
          this.signOut();
          alert('セッションの有効期限が切れました。再度ログインしてください。');
          // 元のエラーをスローして処理を中断
          throw new Error('Session expired.');
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
          console.log('[DEBUG] _refreshAccessToken callback received.');
          if (response.error || !response.access_token) {
            console.error('[DEBUG] Failed to refresh access token in callback.', response.error);
            reject(response.error || new Error('Failed to refresh access token.'));
          } else {
            console.log('[DEBUG] Access token refreshed successfully.');
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
  async _dispatchAuthChangeEvent(isSignedIn, userInfo) {
    console.log(`[DEBUG] Dispatching auth-status-change event. isSignedIn: ${isSignedIn}`);
    const isAdmin = await this.isAdmin(); // isAdmin() の結果を待つ
    const event = new CustomEvent('auth-status-change', {
      detail: { isSignedIn, userInfo, isAdmin }
    });
    document.dispatchEvent(event);
  }

  async _findSharedFolder() {
    console.log('[DEBUG] _findSharedFolder() started.');
    try {
      const query = `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const fields = 'files(id, name)';
      const url = `${GOOGLE_DRIVE_API_FILES_URL}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`;
      const response = await this._fetchWithAuth(url);
      const data = await response.json();

      if (data.files && data.files.length > 0) {
        this.folderId = data.files[0].id;
        console.log(`[DEBUG] Found folder '${DRIVE_FOLDER_NAME}' with ID: ${this.folderId}`);
        sessionStorage.setItem('gdrive_folder_id', this.folderId); // フォルダIDをキャッシュ
      } else {
        throw new Error(`フォルダ「${DRIVE_FOLDER_NAME}」が見つかりません。管理者にフォルダを共有してもらっているか確認してください。`);
      }
    } catch (error) {
      console.error('[DEBUG] Failed to find shared folder:', error);
      throw error;
    }
  }

  /**
   * 管理者リストファイルを読み込む
   * @private
   */
  async _loadAdminUsers() {
    console.log('[DEBUG] _loadAdminUsers() started.');
    try {
      // loadByPrefixは配列を返すので、最初の要素を取得する
      const adminFiles = await this.loadByPrefix(`${ADMIN_USERS_FILENAME}.json`);
      if (adminFiles.length > 0 && Array.isArray(adminFiles[0].data.admins)) {
        this.adminUsers = adminFiles[0].data.admins;
        console.log('[DEBUG] Admin users loaded:', this.adminUsers);
        sessionStorage.setItem('gdrive_admin_users', JSON.stringify(this.adminUsers)); // 管理者リストをキャッシュ
      } else {
        console.log('[DEBUG] Admin users file not found or invalid. Setting admins to empty array.');
        this.adminUsers = []; // ファイルがない、または形式が不正な場合は空にする
      }
    } catch (error) {
      sessionStorage.removeItem('gdrive_admin_users'); // エラー時はキャッシュを削除
      console.warn('[DEBUG] Failed to load admin users. No admin rights will be granted.', error);
      this.adminUsers = [];
    } finally {
      console.log('[DEBUG] _loadAdminUsers() finished.');
      // 読み込みが完了（成功または失敗）したことを通知
      if (this._resolveAdminUsersLoaded) this._resolveAdminUsersLoaded();
    }
  }

  /**
   * 管理者リストを再読み込みする
   */
  async reloadAdminUsers() {
    // _loadAdminUsersはPromiseを返すので、awaitで完了を待つ
    await this._loadAdminUsers();
    // 変更をUIに反映させるために認証状態変更イベントを再発行する
    this._dispatchAuthChangeEvent(this.isAuthenticated(), this.getCurrentUser());
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
      console.error('[DEBUG] Failed to save to Drive:', error);
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
      console.error('[DEBUG] Failed to delete file from Drive:', error);
      throw error;
    }
  }

  async loadByPrefix(prefix) {
    if (!this.folderId) throw new Error('フォルダIDが未設定です。');

    try {
      let query = `'${this.folderId}' in parents and trashed=false`;
      if (prefix) {
        const searchKey = prefix.endsWith('.json') ? 'name =' : 'name starts with';
        query += ` and ${searchKey} '${prefix}'`;
      }

      const allFiles = [];
      let pageToken = null;
      const fields = 'nextPageToken, files(id, name)';

      do {
        let listUrl = `${GOOGLE_DRIVE_API_FILES_URL}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000`;
        if (pageToken) {
          listUrl += `&pageToken=${pageToken}`;
        }
        const listResponse = await this._fetchWithAuth(listUrl);
        const listData = await listResponse.json();

        if (listData.files) {
          allFiles.push(...listData.files);
        }
        pageToken = listData.nextPageToken;
      } while (pageToken);

      if (allFiles.length === 0) return [];

      const loadPromises = allFiles.map(async (file) => {
        const fileResponse = await this._fetchWithAuth(`${GOOGLE_DRIVE_API_FILES_URL}/${file.id}?alt=media`);
        const data = await fileResponse.json().catch(() => ({})); // JSONパースエラーでも処理を続行
        return { name: file.name, data };
      });

      return Promise.all(loadPromises);
    } catch (error) {
      console.error(`[DEBUG] Failed to load data with prefix '${prefix}':`, error);
      throw error;
    }
  }

  /**
   * ファイル名でGoogle Driveから単一のファイルを読み込む
   * @param {string} filename - .json拡張子を含まないファイル名
   * @returns {Promise<object|null>} ファイルデータ、または見つからない場合はnull
   */
  async loadByFilename(filename) {
    if (!this.folderId) throw new Error('フォルダIDが未設定です。');

    try {
      const fullFilename = `${filename}.json`;
      const query = `name='${fullFilename}' and '${this.folderId}' in parents and trashed=false`;
      const fields = 'files(id)';
      const listUrl = `${GOOGLE_DRIVE_API_FILES_URL}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`;

      const listResponse = await this._fetchWithAuth(listUrl);
      const listData = await listResponse.json();

      if (!listData.files || listData.files.length === 0) {
        return null; // ファイルが見つからない
      }

      const fileId = listData.files[0].id;
      const fileResponse = await this._fetchWithAuth(`${GOOGLE_DRIVE_API_FILES_URL}/${fileId}?alt=media`);
      return await fileResponse.json();
    } catch (error) {
      console.error(`ファイル '${filename}' の読み込みに失敗:`, error);
      throw error;
    }
  }

  /**
   * 全てのユーザー設定ファイルを取得し、ユーザー情報のリストを返す
   * @returns {Promise<Array<{email: string, lastLogin: string}>>}
   */
  async getAllUsers() {
    try {
      const userSettingsFiles = await this.loadByPrefix(USER_SETTINGS_PREFIX);
      const users = userSettingsFiles.map(file => {
        // ファイル名からメールアドレスを復元
        // user_settings_user_example_com.json -> user@example.com
        const emailPart = file.name
          .replace(USER_SETTINGS_PREFIX, '')
          .replace('.json', '');
        const email = emailPart.replace(/_/g, '.').replace(/\.(?=([^.]*$))/, '@');

        // ファイルデータから最終更新日を取得
        const lastLogin = file.data.updatedAt ? new Date(file.data.updatedAt).toLocaleString('ja-JP') : '不明';

        return { email, lastLogin };
      });

      return users;
    } catch (error) {
      console.error('[DEBUG] Failed to get all users:', error);
      throw error;
    }
  }

  /**
   * 指定されたプレフィックスに一致するファイルのメタデータ（IDと名前）を検索する。
   * ファイルの中身はダウンロードしないため、高速に動作する。
   * @param {string} prefix - 検索するファイル名のプレフィックス
   * @returns {Promise<Array<{id: string, name: string}>>} ファイルのメタデータリスト
   * @private
   */
  async _findFilesByPrefix(prefix) {
    if (!this.folderId) throw new Error('フォルダIDが未設定です。');

    try {
      let query = `'${this.folderId}' in parents and trashed=false`;
      if (prefix) {
        // .jsonで終わる場合は完全一致検索、それ以外は前方一致検索
        const searchKey = prefix.endsWith('.json') ? 'name =' : 'name starts with';
        query += ` and ${searchKey} '${prefix}'`;
      }

      const fields = 'files(id, name)';
      const listUrl = `${GOOGLE_DRIVE_API_FILES_URL}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`;
      const listResponse = await this._fetchWithAuth(listUrl);
      const listData = await listResponse.json();
      return listData.files || [];
    } catch (error) {
      console.error(`プレフィックス '${prefix}' のファイル検索に失敗:`, error);
      throw error;
    }
  }

  /**
   * 指定された住所と座標に基づき、一意のファイル名を決定してデータを保存する。
   * 同じ住所のファイルが存在する場合、座標を比較し、異なれば新しいファイル名（例: address_2.json）を生成する。
   * @param {string} address - ベースとなる住所（ファイル名）
   * @param {object} data - 保存するデータ（lat, lngを含む）
   * @returns {Promise<object>} 保存された最終的なデータ（ファイル名として使われた住所を含む）
   */
  async saveWithUniqueName(address, data) {
    // プレフィックスに一致するすべてのファイルのメタデータを一度に取得
    const relatedFilesMeta = await this._findFilesByPrefix(address);

    const baseFilename = `${address}.json`;
    const baseFileMeta = relatedFilesMeta.find(f => f.name === baseFilename);

    if (baseFileMeta) {
      // ベースファイルが存在した場合のみ、そのファイルの中身をダウンロードして座標を比較
      const fileId = baseFileMeta.id;
      const fileResponse = await this._fetchWithAuth(`${GOOGLE_DRIVE_API_FILES_URL}/${fileId}?alt=media`);
      const existingFileData = await fileResponse.json();

      // 既存ファイルと座標が異なる場合、新しいファイル名を生成
      const distance = L.latLng(existingFileData.lat, existingFileData.lng).distanceTo(L.latLng(data.lat, data.lng));

      if (distance > 1) { // 1メートル以上離れていたら別物とみなす
        // 取得済みのファイル名リストから、使用されている最大の連番を探す
        let maxCounter = 1;
        const regex = new RegExp(`^${address}_(\\d+)\\.json$`);
        relatedFilesMeta.forEach(file => {
          const match = file.name.match(regex);
          if (match) {
            const counter = parseInt(match[1], 10);
            if (counter > maxCounter) {
              maxCounter = counter;
            }
          }
        });

        const newAddress = `${address}_${maxCounter + 1}`;
        const finalData = { ...data, address: newAddress };
        await this.save(newAddress, finalData);
        return finalData;
        }
    }

    // ベースファイルが存在しない、または座標がほぼ同じ場合は、指定された住所で上書き保存
    await this.save(address, data);
    return { ...data, address: address };
  }
}

// シングルトンインスタンスをエクスポート
export const googleDriveService = new GoogleDriveService();