/** ユーザー設定を保存するGoogle Drive上のファイル名のプレフィックス */
export const USER_SETTINGS_PREFIX = 'user_settings_';

/** 訪問ステータスのリスト */
export const VISIT_STATUSES = ['未訪問', '訪問済み', '不在'];

// --- Google Drive & API 関連 ---

/** Google Driveに作成されるアプリケーションのルートフォルダ名 */
export const DRIVE_FOLDER_NAME = 'PWA_Visits';

/** 境界線データを保存するGoogle Drive上のファイル名のプレフィックス */
export const BOUNDARY_PREFIX = 'boundary_';

/** Google APIの認証スコープ */
export const GOOGLE_API_SCOPES = 'openid profile email https://www.googleapis.com/auth/drive';

/** Google Drive API v3 のファイル操作エンドポイント */
export const GOOGLE_DRIVE_API_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

/** Google Drive API v3 のアップロード用エンドポイント */
export const GOOGLE_DRIVE_API_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

// --- 地図・マーカー関連 ---

/** マーカーのスタイル定義 */
export const MARKER_STYLES = {
  '未訪問': { icon: 'fa-house', color: '#337ab7' },
  '訪問済み': { icon: 'fa-house-circle-check', color: '#5cb85c' },
  '不在': { icon: 'fa-clock', color: '#f0ad4e' },
  'new': { icon: 'fa-plus', color: '#d9534f' },
  'apartment': { icon: 'fa-building', color: '#6f42c1' }
};

// --- データ定義関連 ---

/** 通知用の外国語キーワードリスト */
const FOREIGN_LANGUAGE_KEYWORDS_BASE = ['英語', '中国語', '韓国語', 'ベトナム語', 'タガログ語', 'ポルトガル語', 'ネパール語', 'インドネシア語', 'タイ語', 'スペイン語', 'ミャンマー語', '手話'];

/** ポップアップやエディタで使用する言語の選択肢リスト */
export const LANGUAGE_OPTIONS = ['未選択', ...FOREIGN_LANGUAGE_KEYWORDS_BASE, 'その他の言語'];

/** FOREIGN_LANGUAGE_KEYWORDS_BASE を直接エクスポートして、キーワード検索に利用 */
export const FOREIGN_LANGUAGE_KEYWORDS = FOREIGN_LANGUAGE_KEYWORDS_BASE;

/** リバースジオコーディング用の市区町村コードと名称のマッピング */
export const CITY_CODE_MAP = new Map([
  ['34213', '広島県廿日市市'],
  ['34211', '広島県大竹市'],
]);