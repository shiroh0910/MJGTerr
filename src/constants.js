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

/** 地図のデフォルトズームレベル */
export const MAP_DEFAULT_ZOOM = 18;

/** 地図のデフォルト中心座標（広島県廿日市市阿品台東） */
export const MAP_DEFAULT_CENTER = [34.3140, 132.3080];

/** 地図タイルレイヤーの定義 */
export const MAP_TILE_LAYERS = {
  PALE: {
    url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    attribution: '出典: <a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>'
  },
  SEAMLESS_PHOTO: {
    url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    attribution: '出典: <a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>'
  }
};

/** マーカーのスタイル定義 */
export const MARKER_STYLES = {
  '未訪問': { icon: 'fa-house', color: '#337ab7' },
  '訪問済み': { icon: 'fa-house-circle-check', color: '#5cb85c' },
  '不在': { icon: 'fa-clock', color: '#f0ad4e' },
  'new': { icon: 'fa-plus', color: '#d9534f' },
  'apartment': { icon: 'fa-building', color: '#6f42c1' }
};

// --- UIメッセージ & テキスト ---
export const UI_TEXT = {
  ADDRESS_LOADING: '住所を取得中...',
  ADDRESS_FAILED: '住所の取得に失敗しました',
  SAVE_SUCCESS: '保存しました',
  SAVE_ERROR: 'データの保存に失敗しました',
  UPDATE_SUCCESS: '更新しました',
  UPDATE_ERROR: '更新に失敗しました',
  DELETE_SUCCESS: '削除しました',
  DELETE_ERROR: '削除に失敗しました',
  LOAD_MARKERS_ERROR: 'マーカーデータの読み込みに失敗しました。',
  RESET_MARKERS_ERROR: 'マーカーのリセットに失敗しました。',
  RESET_CONFIRM_PREFIX: '区域「',
  RESET_CONFIRM_SUFFIX: '」内にあるすべての家を「未訪問」状態にしますか？\nこの操作は元に戻せません。',
  RESET_SUCCESS_PREFIX: '区域「',
  RESET_SUCCESS_SUFFIX: '」内のマーカーをリセットしました。',
  SAVING_BUTTON_TEXT: '<i class="fa-solid fa-spinner fa-spin"></i> 保存中...',
  UPDATING_BUTTON_TEXT: '<i class="fa-solid fa-spinner fa-spin"></i> 更新中...',
  SAVE_BUTTON_TEXT: '<i class="fa-solid fa-save"></i> 保存',
  EXPORT_BUTTON_TEXT: '<i class="fa-solid fa-download"></i> エクスポート',
  EXPORTING_BUTTON_TEXT: '<i class="fa-solid fa-spinner fa-spin"></i> 作成中...',
  CONFIRM_DELETE_MARKER_PREFIX: '住所「',
  CONFIRM_DELETE_MARKER_SUFFIX: '」を削除しますか？',
  ALERT_INVALID_ADDRESS: '有効な住所を入力してください',
  PLACEHOLDER_ROOM_NUMBER: '部屋番号',
  PLACEHOLDER_MEMO: 'メモ',
  TITLE_ADD_COLUMN: '列を追加',
  TITLE_ADD_ROW: '行を追加',
  TITLE_REMOVE_ROW: '行を削除',
  NO_AVAILABLE_AREAS: '利用可能な区域がありません。',
  PROMPT_FILTER_AREAS: '表示する区域番号をカンマ区切りで入力してください (例: 1,2,5)。\n空欄でOKを押すと絞り込みを解除します。',
  PROMPT_RESET_AREAS: '未訪問にする区域番号をカンマ区切りで入力してください (例: 1,2,5)。\n`all` と入力すると全区域が対象になります。',
  NO_AREAS_FOUND: '入力された区域番号が見つかりませんでした。',
  NO_TARGET_AREAS: '対象の区域がありません。',
  BOUNDARY_DRAW_PROMPT: '区域番号を入力してください:',
  BOUNDARY_DRAW_WARN: '多角形を描画するには、少なくとも3つの頂点が必要です。',
  BOUNDARY_SAVE_SUCCESS_PREFIX: '区域「',
  BOUNDARY_SAVE_SUCCESS_SUFFIX: '」を保存しました。',
  BOUNDARY_SAVE_ERROR: '境界線の保存に失敗しました。',
  BOUNDARY_DELETE_CONFIRM_PREFIX: '区域「',
  BOUNDARY_DELETE_CONFIRM_SUFFIX: '」を削除しますか？',
  BOUNDARY_DELETE_SUCCESS_PREFIX: '区域「',
  BOUNDARY_DELETE_SUCCESS_SUFFIX: '」を削除しました。',
  BOUNDARY_DELETE_ERROR: '境界線の削除に失敗しました。',
  BOUNDARY_LOAD_ERROR: '境界線の読み込みに失敗しました。',
  EXPORT_NO_DATA: 'エクスポート対象のデータがありませんでした。',
  EXPORT_FILENAME_PREFIX: 'export_',
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

// --- IDプレフィックス ---

export const MARKER_ID_PREFIX_NEW = 'marker-new-';
export const MARKER_ID_PREFIX_DRIVE = 'marker-drive-';

// --- スタイル定義 ---
export const STYLES = {
  BOUNDARY_DRAW_MARKER: { radius: 5, color: 'red' },
  BOUNDARY_DRAW_POLYLINE: { color: 'blue', weight: 3 },
  BOUNDARY_DISPLAY: { color: 'blue', weight: 3, opacity: 0.7, fillColor: 'blue', fillOpacity: 0.1 }
};
