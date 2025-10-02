import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser, updateFollowingStatusButton } from './map.js';
import { initGoogleDriveAPI, handleSignIn, handleSignOut } from './google-drive.js';
import { toggleEditMode, addNewMarker, renderMarkersFromDrive } from './marker.js';
import { toggleBoundaryDrawing, loadAllBoundaries } from './boundary.js';

// --- アプリケーションの初期化 ---

// DOMの読み込みが完了したら、APIの初期化とイベントリスナーの設定を行う
document.addEventListener('DOMContentLoaded', () => {
  try {
    // サインイン成功後にマーカーを読み込むコールバック
    const onSignedIn = () => {
      renderMarkersFromDrive(markerClusterGroup);
      loadAllBoundaries(map);
    };

    // 地図クリック時の処理
    const onMapClick = (e) => {
      // 編集モードが有効な場合のみマーカーを追加
      const editModeButton = document.getElementById('edit-mode-button');
      if (editModeButton && editModeButton.classList.contains('active')) {
        addNewMarker(e.latlng, markerClusterGroup);
      }
    };

    initializeMap(onMapClick);
    initGoogleDriveAPI(onSignedIn);

    // UIイベントリスナーの設定
    document.getElementById('edit-mode-button').addEventListener('click', toggleEditMode);
    document.getElementById('center-map-button').addEventListener('click', centerMapToCurrentUser);
    document.getElementById('boundary-draw-button').addEventListener('click', () => toggleBoundaryDrawing(map));
    document.getElementById('sign-in-button').addEventListener('click', () => handleSignIn(onSignedIn));
    document.getElementById('sign-out-button').addEventListener('click', handleSignOut);

    // 初期状態のボタン表示を更新
    updateFollowingStatusButton();

  } catch (error) {
    console.error('DOMContentLoadedエラー:', JSON.stringify(error, null, 2));
  }
});
