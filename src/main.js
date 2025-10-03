import { initializeMap, map, markerClusterGroup, centerMapToCurrentUser, updateFollowingStatusButton } from './map.js';
import { initGoogleDriveAPI, handleSignIn, handleSignOut } from './google-drive.js';
import { showModal, showToast } from './utils.js';
import { toggleEditMode as toggleMarkerEditMode, addNewMarker, renderMarkersFromDrive, filterMarkersByPolygon, resetMarkersInPolygon } from './marker.js';
import { toggleBoundaryDrawing as toggleBoundaryDrawMode, loadAllBoundaries, filterBoundariesByArea, getBoundaryLayerByArea } from './boundary.js';

// --- アプリケーションの初期化 ---

export let isMarkerEditMode = false;
export let isBoundaryDrawMode = false;

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
      // マーカー編集モードが有効な場合のみマーカーを追加
      if (isMarkerEditMode) {
        addNewMarker(e.latlng, markerClusterGroup);
      }
    };

    initializeMap(onMapClick);
    initGoogleDriveAPI(onSignedIn).catch(console.error);

    const markerButton = document.getElementById('edit-mode-button');
    const boundaryButton = document.getElementById('boundary-draw-button');

    const toggleMarkerMode = () => {
      isMarkerEditMode = !isMarkerEditMode;
      if (isMarkerEditMode && isBoundaryDrawMode) {
        toggleBoundaryMode();
      }
      markerButton.classList.toggle('active-green', isMarkerEditMode);
      toggleMarkerEditMode(); // marker.js内の処理を呼び出す
    };

    const toggleBoundaryMode = () => {
      isBoundaryDrawMode = !isBoundaryDrawMode;
      if (isBoundaryDrawMode && isMarkerEditMode) {
        toggleMarkerMode();
      }
      boundaryButton.classList.toggle('active-green', isBoundaryDrawMode);
      toggleBoundaryDrawMode(map); // boundary.js内の処理を呼び出す
    };

    // UIイベントリスナーの設定
    markerButton.addEventListener('click', toggleMarkerMode);
    boundaryButton.addEventListener('click', toggleBoundaryMode);

    document.getElementById('center-map-button').addEventListener('click', centerMapToCurrentUser);
    document.getElementById('sign-in-button').addEventListener('click', () => handleSignIn(onSignedIn));
    document.getElementById('sign-out-button').addEventListener('click', handleSignOut);
    document.getElementById('filter-by-area-button').addEventListener('click', async () => {
      const areaNumber = await showModal('絞り込む区域番号を入力してください (空欄で解除):', { type: 'prompt', defaultValue: '' });
      
      // キャンセルボタンが押された場合は何もしない
      if (areaNumber === null) return;

      if (areaNumber) {
        const boundaryLayer = getBoundaryLayerByArea(areaNumber);
        if (boundaryLayer) {
          // 境界線の範囲に地図をズーム
          map.fitBounds(boundaryLayer.getBounds());
          filterBoundariesByArea(areaNumber);
          filterMarkersByPolygon(boundaryLayer, markerClusterGroup);
        } else {
          showToast(`区域番号「${areaNumber}」は見つかりませんでした。`, 'error');
        }
      } else {
        // 絞り込み解除
        filterBoundariesByArea(null);
        filterMarkersByPolygon(null, markerClusterGroup);
      }
    });
    document.getElementById('reset-markers-in-area-button').addEventListener('click', async () => {
      const areaNumber = await showModal('リセットする区域番号を入力してください:', { type: 'prompt' });
      if (areaNumber === null || areaNumber === '') {
        return; // ユーザーがキャンセルしたか、何も入力しなかった場合
      }

      const boundaryLayer = getBoundaryLayerByArea(areaNumber);
      if (!boundaryLayer) {
        showToast(`区域番号「${areaNumber}」は見つかりませんでした。`, 'error');
        return;
      }

      const confirmed = await showModal(`区域「${areaNumber}」内のすべてのマーカーを「未訪問」にリセットしますか？\nこの操作は元に戻せません。`);
      if (confirmed) {
        try {
          await resetMarkersInPolygon(boundaryLayer);
          showToast(`区域「${areaNumber}」内のマーカーをリセットしました。`, 'success');
        } catch (error) {
          console.error('マーカーのリセット中にエラーが発生しました:', error);
          showToast('マーカーのリセットに失敗しました。', 'error');
        }
      }
    });

    // 初期状態のボタン表示を更新
    updateFollowingStatusButton();

  } catch (error) {
    console.error('DOMContentLoadedエラー:', JSON.stringify(error, null, 2));
  }
});
