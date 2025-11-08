/** Google Client ID */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/** アプリケーションのバージョン情報 */
export const APP_VERSION = {
  branch: import.meta.env.VITE_GIT_BRANCH,
  buildDate: import.meta.env.VITE_BUILD_DATE,
};
/** Google Maps API Key */
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/** ユーザー設定を保存するGoogle Drive上のファイル名のプレフィックス */
export const USER_SETTINGS_PREFIX = 'user_settings_';

/** 管理者ユーザーリストを保存するGoogle Drive上のファイル名 */
export const ADMIN_USERS_FILENAME = 'admin_users';

/** お知らせを保存するGoogle Drive上のファイル名 */
export const ANNOUNCEMENTS_FILENAME = 'announcements';

/** アプリケーション共通設定を保存するファイル名 */
export const APP_SETTINGS_FILENAME = 'app_settings';

// --- Google Drive & API 関連 ---

/** Google Driveに作成されるアプリケーションのルートフォルダ名 */
export const DRIVE_FOLDER_NAME = 'PWA_Visits';

/** 境界線データを保存するGoogle Drive上のファイル名のプレフィックス */
export const BOUNDARY_PREFIX = 'boundary_';

/** ユーザーからの報告を保存するGoogle Drive上のファイル名のプレフィックス */
export const REPORT_PREFIX = 'report_';

/** レポートの種類 */
export const REPORT_TYPES = ['不具合', '改善', '要望'];

/** レポートのステータス */
export const REPORT_STATUS = { OPEN: 'open', ARCHIVED: 'archived' };

/** Google APIの認証スコープ */
export const GOOGLE_API_SCOPES = 'openid profile email https://www.googleapis.com/auth/drive';

/** Google Drive API v3 のファイル操作エンドポイント */
export const GOOGLE_DRIVE_API_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

/** Google Drive API v3 のアップロード用エンドポイント */
export const GOOGLE_DRIVE_API_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/** localStorageで使用するキー */
export const LOCAL_STORAGE_KEYS = {
  ID_TOKEN: 'gdrive_id_token',
  ACCESS_TOKEN: 'gdrive_access_token',
  ADMIN_CARD_ORDER: 'adminCardOrder',
};

// --- 地図・マーカー関連 ---

/** 地図のデフォルトズームレベル */
export const MAP_DEFAULT_ZOOM = 18;

/** 地図のグローバルな最大ズームレベル (Google Mapsに合わせて21) */
export const MAP_MAX_GLOBAL_ZOOM = 21;

/** 地図のデフォルト中心座標（広島県廿日市市宮島口） */
export const MAP_DEFAULT_CENTER = [34.299, 132.301];

/** 地図タイルレイヤーの定義 */
export const MAP_TILE_LAYERS = {
  PALE: {
    url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    attribution: '出典: <a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>'
  },
  SEAMLESS_PHOTO: {
    url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    attribution: '出典: <a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>'
  },
  // Google Mapsの定義を追加（URLは直接使わないが、識別子として利用）
  GOOGLE_ROADMAP: { type: 'roadmap', attribution: 'Google' },
  GOOGLE_SATELLITE: { type: 'satellite', attribution: 'Google' },
  GOOGLE_HYBRID: { type: 'hybrid', attribution: 'Google' },
  GOOGLE_TERRAIN: { type: 'terrain', attribution: 'Google' }
};

/** Google Mapsのダークモード用スタイル定義 (Aubergine) */
export const GOOGLE_MAPS_DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
];

/** デフォルトの訪問ステータス定義 */
export const DEFAULT_VISIT_STATUSES = [
  { name: '未訪問', icon: 'fa-house', color: '#337ab7' },
  { name: '訪問済み', icon: 'fa-house-circle-check', color: '#5cb85c' },
  { name: '不在', icon: 'fa-clock', color: '#f0ad4e' },
  { name: '訪問拒否', icon: 'fa-ban', color: '#dc3545', isFixed: true }, // 訪問拒否は削除不可
  { name: '集合住宅', icon: 'fa-building', color: '#6f42c1' } // ポップアップヘッダー色のため
];

/**
 * 固定のマーカースタイル（ステータス設定で変更されないもの）
 * new: 新規作成時のマーカー
 * apartment: 集合住宅マーカー
 */
export const FIXED_MARKER_STYLES = {
  new: { icon: 'fa-plus', color: '#d9534f' },
  apartment: { icon: 'fa-building', color: '#6f42c1' }
};

// --- UIメッセージ & テキスト ---
export const UI_TEXT = {
  ADDRESS_LOADING: '住所を取得中...',
  ADDRESS_FAILED: '住所の取得に失敗しました',
  SAVE_SUCCESS: '保存しました',
  SAVING: '保存中...',
  UPDATING: '更新中...',
  LOADING: '読み込み中...',
  SENDING: '送信中...',
  GENERATING_ZIP: 'ZIPファイルを生成中...',
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
  NO_AVAILABLE_AREAS: '利用可能な区域がありません。',
  PROMPT_FILTER_AREAS: '表示する区域番号をカンマ区切りで入力してください (例: 1,2,5)。\n空欄でOKを押すと絞り込みを解除します。\n\nヒント: 地図上の区域ラベルをダブルタップすることでも絞り込みのON/OFFができます。',
  PROMPT_RESET_AREAS: '未訪問にする区域番号をカンマ区切りで入力してください (例: 1,2,5)。\n`all` と入力すると全区域が対象になります。',
  ALL_AREAS_KEYWORD: 'all',
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
  BACKUP_CONFIRM: 'バックアップを開始しますか？',
  BACKUP_NO_DATA: 'バックアップ対象のデータがありません。',
  BACKUP_ERROR: 'バックアップに失敗しました。',
  BACKUP_FILENAME_PREFIX: 'visit-pwa-backup-',
  REPORT_ISSUE_MODAL_TITLE: '不具合や改善要望など、開発者への報告を送信します。',
  REPORT_ISSUE_TYPE_LABEL: '報告の種類:',
  REPORT_ISSUE_CONTENT_LABEL: '内容:',
  REPORT_ISSUE_CONTENT_PLACEHOLDER: '具体的な内容を記入してください',
  REPORT_ISSUE_EMPTY_CONTENT: '報告内容を入力してください。',
  REPORT_ISSUE_SUCCESS: 'ご報告ありがとうございました。',
};

/** 管理者ページ専用のUIテキスト */
export const ADMIN_UI_TEXT = {
  LOADING_ADMIN_DATA: '管理者データを読み込み中...',
  LOADING_USERS: 'ユーザーリストを取得中...',
  USERS_LOADED: (count) => `${count}人のユーザーが見つかりました。`,
  USERS_LOAD_ERROR: 'ユーザーリストの取得に失敗しました。',
  NO_USERS_FOUND: 'ユーザーが見つかりませんでした。',
  LOADING_ADMINS: '管理者リストを読み込み中...',
  ADMINS_LOAD_ERROR: '管理者リストの読み込みに失敗しました。',
  SAVE_ADMINS_CONFIRM: '管理者リストを保存しますか？<br>この操作により、一部のユーザーの権限が変更される可能性があります。',
  SAVING_ADMINS: '管理者リストを保存中...',
  SAVE_ADMINS_SUCCESS: '管理者リストを保存しました。',
  SAVE_ADMINS_ERROR: '管理者リストの保存に失敗しました。',
  LOADING_ANNOUNCEMENT: 'お知らせを読み込み中...',
  ANNOUNCEMENT_LOAD_ERROR: 'お知らせの読み込みに失敗しました。',
  SAVE_ANNOUNCEMENT_CONFIRM: 'お知らせを全ユーザーに通知しますか？',
  SAVING_ANNOUNCEMENT: 'お知らせを保存中...',
  SAVE_ANNOUNCEMENT_SUCCESS: 'お知らせを保存しました。',
  SAVE_ANNOUNCEMENT_ERROR: 'お知らせの保存に失敗しました。',
  LOADING_REPORTS: 'レポートを取得中...',
  REPORTS_LOADED: (count) => `${count}件のレポートが見つかりました。`,
  REPORTS_LOAD_ERROR: 'レポートの取得に失敗しました。',
  NO_REPORTS: 'レポートはありません。',
  ARCHIVE_REPORTS_PROMPT: (count) => `${count}件のレポートを対応済みにしますか？`,
  ARCHIVE_REPORTS_SUCCESS: 'レポートを対応済みにしました。',
  SELECT_ARCHIVE_REPORTS: '対応済みにするレポートを選択してください。',
  UNARCHIVE_REPORTS_PROMPT: (count) => `${count}件のレポートを未対応に戻しますか？`,
  UNARCHIVE_REPORTS_SUCCESS: 'レポートを未対応に戻しました。',
  SELECT_UNARCHIVE_REPORTS: '未対応に戻すレポートを選択してください。',
  NO_ADMIN_PRIVILEGE: '管理者権限がありません。',
  LOGIN_PROMPT_ADMIN: '管理者ページにアクセスするには、Googleアカウントでログインしてください。',
  ADMIN_DATA_LOAD_ERROR: '管理者データの読み込みに失敗しました。',
  MARKER_OPACITY_RANGE_ERROR: '不透明度は0.1から1.0の間で設定してください。',
  MARKER_SIZE_RANGE_ERROR: 'サイズは10から50の間で設定してください。',
  MARKER_SETTINGS_SAVE_SUCCESS: 'マーカー設定を保存しました。',
  STATUS_SETTINGS_REQUIRED: '少なくとも1つのステータスが必要です。',
  STATUS_SETTINGS_SAVE_SUCCESS: 'ステータス設定を保存しました。',
  RESTORE_NO_FILE_SELECTED: '復元するファイルを選択してください。',
  RESTORE_CONFIRM: '本当にデータを復元しますか？<br>現在のGoogle Drive上のデータはすべて上書きされます。この操作は元に戻せません。',
  RESTORE_UNZIPPING: 'ZIPファイルを解凍中...',
  RESTORE_UPLOADING: (current, total) => `ファイルをアップロード中... (${current}/${total})`,
  RESTORE_SUCCESS: 'データの復元が完了しました。ページをリロードします。',
  RESTORE_ERROR: 'データの復元に失敗しました。',
};

/** パネルのデフォルトの高さ (vh) */
export const DEFAULT_PANEL_HEIGHT = {
  APARTMENT_EDITOR: 40,
  EXPORT_PANEL: 33.33,
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
