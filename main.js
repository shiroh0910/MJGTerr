import L    from 'leaflet';
import Papa from 'papaparse';
// MarkerClusterプラグインのインポート
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

// --- 定数と状態管理 ---

// Vite経由で.envファイルから環境変数を読み込む
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly';
const FOLDER_NAME = 'PWA_Visits';

// アプリケーションの状態
const markers = {};
let folderId = null;
let accessToken = null;
let editMode = false;		// 編集モードON/OFF
let isFollowingUser = true; // 現在位置追従モード
let currentUserPositionMarker = null; // 現在位置マーカーを保持する変数

// --- 地図の初期化とイベント ---

// 地図オブジェクトの作成
const map = L.map('map', { dragging: true, tap: false });

// マーカークラスターグループを作成
const markerClusterGroup = L.markerClusterGroup({
  disableClusteringAtZoom: 18 // ズームレベル18以上ではクラスタリングを無効にする
});
map.addLayer(markerClusterGroup);

// 現在位置を取得して地図の中心に設定
if (navigator.geolocation) {
  // watchPositionを使用して、位置情報の変更を監視
  navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      console.log(`現在位置更新: ${latitude}, ${longitude}`);

      if (currentUserPositionMarker) {
        // マーカーが既に存在する場合は、位置を更新
        currentUserPositionMarker.setLatLng([latitude, longitude]);
        // 追従モードがONの場合、地図の中心も移動
        if (isFollowingUser) {
          map.setView([latitude, longitude]);
        }
      } else {
        // マーカーが存在しない初回のみ、地図の中心を移動しマーカーを新規作成
        map.setView([latitude, longitude], 18);
        const initialRadius = calculateRadiusByZoom(map.getZoom());
        currentUserPositionMarker = L.circleMarker([latitude, longitude], {
          radius: initialRadius,
          color: '#007bff',
          fillColor: '#007bff',
          fillOpacity: 0.5
        }).addTo(map).bindPopup("現在位置");
      }
    },
    (error) => {
      console.error('現在位置の取得に失敗しました。デフォルトの場所を表示します。', error);
      // 失敗した場合はデフォルトの場所（広島県廿日市市阿品台東中心）に設定
      map.setView([34.3140, 132.3080], 18);
    }
  );
} else {
  console.error('このブラウザはGeolocationをサポートしていません。');
  map.setView([34.3140, 132.3080], 18);
}

// ユーザーが地図を操作し始めたら、追従モードをOFFにする
map.on('movestart', () => {
  isFollowingUser = false;
  console.log('ユーザー操作により現在位置追従を停止しました。');
  updateFollowingStatusButton();
});

// 地図の移動が完了したら、中心の住所を更新する
map.on('moveend', () => {
  const center = map.getCenter();
  updateCurrentAddressDisplay(center.lat, center.lng);
});

// 地図クリックイベント
map.on('click', (e) => {
  if (editMode) {
    // 編集モードON: 新規マーカー追加
    // MarkerClusterはマーカーのクリックイベントを奪うため、
    // 空き地クリックの判定はMarkerClusterのイベントで行うのがより確実ですが、
    // ここでは簡潔化のため、単純にaddNewMarkerを呼び出します。
    addNewMarker(e.latlng);
  }
});

// 地図のズームイベント
map.on('zoomend', () => {
  if (currentUserPositionMarker) {
    const newRadius = calculateRadiusByZoom(map.getZoom());
    // マーカーの半径をズームレベルに応じて更新
    currentUserPositionMarker.setStyle({ radius: newRadius });
    console.log(`ズームレベル ${map.getZoom()} に応じてマーカーサイズを ${newRadius} に変更`);
  }
});

// 地図中心の住所表示を更新する
async function updateCurrentAddressDisplay(lat, lng) {
  const addressDisplay = document.getElementById('current-address-display');
  if (!addressDisplay) return;

  try {
    // 逆ジオコーディングで住所を取得
    const address = await reverseGeocode(lat, lng);
    addressDisplay.textContent = `${address}`;
  } catch (error) {
    console.error('地図中心の住所取得に失敗:', error);
    addressDisplay.textContent = '住所取得に失敗';
  }
}

// --- UI関連の関数 ---

// 編集モードの切り替え
function toggleEditMode() {
  editMode = !editMode;
  const button = document.getElementById('edit-mode-button');
  if (button) {
    button.textContent = `編集モード ${editMode ? 'ON' : 'OFF'}`;
    console.log(`編集モード: ${editMode ? 'ON' : 'OFF'}`);
    button.classList.toggle('active', editMode);
  }
  // 編集モード変更時にすべてのポップアップを閉じて再設定を促す
  Object.values(markers).forEach(markerObj => {
    if (markerObj.marker.isPopupOpen()) {
      markerObj.marker.closePopup();
      markerClusterGroup.removeLayer(markerObj.marker); // 一旦削除
      markerClusterGroup.addLayer(markerObj.marker);   // 再追加してポップアップの再生成を促す
    }
  });
}

// 現在地追従ボタンの表示を更新
function updateFollowingStatusButton() {
  const button = document.getElementById('center-map-button');
  if (button) {
    // isFollowingUserがtrueならactiveクラスを付与、falseなら削除
    button.classList.toggle('active', isFollowingUser);
  }
}

// 現在位置に地図を移動する
function centerMapToCurrentUser() {
  if (currentUserPositionMarker) {
    isFollowingUser = true; // 追従モードをONにする
    console.log('現在位置追従を再開しました。');
    updateFollowingStatusButton();
    const latlng = currentUserPositionMarker.getLatLng();
    // ユーザーの現在地に地図の中心を移動し、ズームレベルを18に設定
    map.setView(latlng, 18);
    console.log('地図を現在位置に移動しました。');
  } else {
    // 位置情報がまだ取得できていない場合にメッセージを表示
    alert('現在位置がまだ取得できていません。');
    console.warn('現在位置マーカーが存在しないため、地図を移動できません。');
  }
}

// 新規マーカーを地図に追加
function addNewMarker(latlng) {
  console.log(`新規マーカー追加: 座標 ${latlng.lat}, ${latlng.lng}, ズームレベル: ${map.getZoom()}`);
  const markerId = `marker-new-${Date.now()}`; // 一意なIDを生成
  const marker = L.marker([latlng.lat, latlng.lng], { icon: createMarkerIcon('new') });

  // 一時的にマーカーを保存
  markers[markerId] = { marker, address: null, name: '', status: '未訪問', memo: '' };

  // ポップアップの初期コンテンツを生成
  const popupContent = generatePopupContent(markerId, {
    isNew: true,
    address: "住所を取得中...",
    name: "",
    status: "未訪問",
    memo: ""
  }, true);

  // ポップアップをマーカーにバインド
  marker.bindPopup(popupContent);

  // ポップアップが開かれた後にイベントリスナーを設定し、住所を取得
  marker.on('popupopen', () => {
    document.getElementById(`save-${markerId}`)?.addEventListener('click', () => saveNewMarker(markerId, latlng.lat, latlng.lng));
    document.getElementById(`cancel-${markerId}`)?.addEventListener('click', () => cancelNewMarker(markerId));

    // 住所を非同期で取得して入力フィールドにセット
    reverseGeocode(latlng.lat, latlng.lng)
      .then(address => {
        const addressInput = document.getElementById(`address-${markerId}`);
        if (addressInput) addressInput.value = address;
      })
      .catch(error => {
        console.error("リバースジオコーディング失敗:", error);
        const addressInput = document.getElementById(`address-${markerId}`);
        if (addressInput) addressInput.value = "住所の取得に失敗しました";
      });
  });

  markerClusterGroup.addLayer(marker); // マップではなくクラスターグループに追加
  marker.openPopup(); // マーカーをマップに追加した後にポップアップを開く
}

// --- データ処理と永続化 ---

// 新規マーカーの情報を保存
function saveNewMarker(markerId, lat, lng) {
  const address = document.getElementById(`address-${markerId}`).value;
  const name    = document.getElementById(`name-${markerId}`).value;
  const status  = document.getElementById(`status-${markerId}`).value;
  const memo    = document.getElementById(`memo-${markerId}`).value;

  if (!address) {
    alert('住所を入力してください');
    return;
  }

  // 住所の重複チェック（markersオブジェクトとGoogle Driveで確認）
  const existingMarker = Object.values(markers).find(m => m.address === address);
  if (existingMarker) {
    alert(`住所「${address}」は既に登録されています。`);
    return;
  }

  // Google Driveでも重複確認
  loadFromDrive(address).then(existingData => {
    if (existingData) {
      alert(`住所「${address}」は既に登録されています。`);
      return;
    }

    // 重複がない場合、データ保存
    const saveData = {
      lat: lat,
      lng: lng,
      status: status,
      memo: memo,
      name: name
    };

    // Google Driveに保存
    saveToDrive(address, saveData).then(() => {
      // マーカー情報を更新（nameを追加）
      markers[markerId].address = address;
      markers[markerId].name = name; // 名前を保存
      markers[markerId].status = status;
      markers[markerId].memo = memo;

      // マーカーのアイコンを選択されたステータスに応じて更新
      markers[markerId].marker.setIcon(createMarkerIcon(status));

      // ポップアップを更新
      const popupContent = generatePopupContent(markerId, { address, name, status, memo }, editMode);
      markers[markerId].marker.getPopup().setContent(popupContent);

      // イベントリスナーを追加（新規マーカー用）
      setTimeout(() => {
        const saveButton = document.getElementById(`save-${markerId}`);
        const deleteButton = editMode ? document.getElementById(`delete-${markerId}`) : null;
        if (saveButton) {
          saveButton.addEventListener('click', () => saveEdit(markerId, address));
        }
        if (deleteButton) {
          deleteButton.addEventListener('click', () => deleteMarker(markerId, address));
        }
      }, 100);

      console.log(`新規マーカー保存: ${address}`);
    }).catch(error => {
      console.error('新規マーカー保存エラー:', JSON.stringify(error, null, 2));
      reject(error);
      alert('データの保存に失敗しました');      markerClusterGroup.removeLayer(markers[markerId].marker);
      delete markers[markerId];
    });
  }).catch(error => {
    console.error('重複チェックエラー:', JSON.stringify(error, null, 2));
    alert('重複チェックに失敗しました');
  });
}

// 新規マーカー作成をキャンセル
function cancelNewMarker(markerId) {
  console.log(`新規マーカーキャンセル: ${markerId}`);
  markerClusterGroup.removeLayer(markers[markerId].marker);
  delete markers[markerId];
}

// --- Google Drive API 連携 ---

// Google Drive APIクライアントの初期化
function initGoogleDriveAPI() {
  console.log('initGoogleDriveAPI: 開始');
  gapi.load('client', () => {
    gapi.client.init({
      apiKey: GOOGLE_API_KEY
    }).then(() => {
      return gapi.client.load('drive', 'v3');
    }).then(() => {
      console.log('Google Drive API loaded');
      // localStorageからaccessTokenを復元
      accessToken = localStorage.getItem('gdrive_access_token');
      if (accessToken) {
        gapi.client.setToken({ access_token: accessToken });
        console.log('accessTokenをlocalStorageから復元');
        // フォルダ検索を実行
        findOrCreateFolder().then(() => {
          console.log('フォルダ初期化完了、続行');
          updateSigninStatus(true);
          // マーカー描画のみ実行
          renderMarkersFromDrive();
        }).catch(error => {
          console.error('フォルダ初期化エラー:', JSON.stringify(error, null, 2));
          updateSigninStatus(false);
        });
      } else {
        console.log('accessTokenが見つかりません、ログインが必要です');
        updateSigninStatus(false);
      }
      // ログインボタンのイベントリスナー
      const signInButton = document.getElementById('sign-in-button');
      if (signInButton) {
        signInButton.addEventListener('click', handleSignIn);
        console.log('Sign-in button listener attached');
      } else {
        console.error('Sign-in button not found');
      }
      // ログアウトボタンのイベントリスナー
      const signOutButton = document.getElementById('sign-out-button');
      if (signOutButton) {
        signOutButton.addEventListener('click', handleSignOut);
        console.log('Sign-out button listener attached');
      } else {
        console.error('Sign-out button not found');
      }
    }).catch(error => {
      console.error('Google API初期化エラー:', JSON.stringify(error, null, 2));
      updateSigninStatus(false);
    });
  });
}

// ログイン処理
function handleSignIn() {
  console.log('handleSignIn called');
  const tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      console.log('Token response:', tokenResponse);
      if (tokenResponse.access_token) {
        accessToken = tokenResponse.access_token;
        localStorage.setItem('gdrive_access_token', accessToken); // 直接文字列として保存
        gapi.client.setToken({ access_token: accessToken });
        // フォルダ検索を実行
        findOrCreateFolder().then(() => {
          updateSigninStatus(true);
          // ログイン後にマーカー描画のみ実行
          renderMarkersFromDrive();
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

// ログアウト処理
function handleSignOut() {
  console.log('handleSignOut called');
  if (accessToken) {
    window.google.accounts.oauth2.revoke(accessToken, () => {
      console.log('トークン取り消し成功');
    });
  }
  localStorage.removeItem('gdrive_access_token'); // localStorageから削除
  accessToken = null;
  gapi.client.setToken({ access_token: null });
  updateSigninStatus(false);
}

// UIのサインイン状態を更新
function updateSigninStatus(isSignedIn) {
  if (isSignedIn) {
    document.getElementById('sign-in-button').style.display = 'none';
    document.getElementById('sign-out-button').style.display = 'block';
    console.log('ログイン成功、Google Drive APIを利用可能');
    findOrCreateFolder();
  } else {
    document.getElementById('sign-in-button').style.display = 'block';
    document.getElementById('sign-out-button').style.display = 'none';
    console.log('未ログイン、Google Drive APIは利用不可');
  }
}

// アプリ用のフォルダを検索または作成
function findOrCreateFolder() {
  return new Promise((resolve, reject) => {
    gapi.client.drive.files.list({
      q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)'
    }).then(response => {
      const folders = response.result.files;
      if (folders && folders.length > 0) {
        folderId = folders[0].id;
        console.log(`フォルダ見つかりました: ${FOLDER_NAME} (ID: ${folderId})`);
        resolve(folderId);
      } else {
        gapi.client.drive.files.create({
          resource: {
            name: FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder'
          },
          fields: 'id'
        }).then(response => {
          folderId = response.result.id;
          console.log(`フォルダ作成しました: ${FOLDER_NAME} (ID: ${folderId})`);
          resolve(folderId);
        }).catch(error => {
          console.error('フォルダ作成エラー:', JSON.stringify(error, null, 2));
          reject(error);
        });
      }
    }).catch(error => {
      console.error('フォルダ検索エラー:', JSON.stringify(error, null, 2));
      reject(error);
    });
  });
}

// データをGoogle Driveに保存（新規作成または更新）
function saveToDrive(address, data) {
  return new Promise((resolve, reject) => {
    console.log('saveToDrive called with address:', address, 'data:', data, 'folderId:', folderId);
    if (!folderId) {
      console.error('フォルダIDが未設定です。フォルダ検索を再試行します。');
      findOrCreateFolder()
        .then(() => saveToDrive(address, data))
        .then(resolve)
        .catch(error => {
          console.error('フォルダ作成エラーで保存失敗:', JSON.stringify(error, null, 2));
          reject(error);
        });
      return;
    }

    // dataにlatとlngが含まれている場合、それを使用
    let lat = data.lat;
    let lng = data.lng;
    if (!lat || !lng) {
      // 含まれていない場合、マーカーから緯度・経度を取得
      const markerEntry = Object.values(markers).find(m => m.address === address);
      const latLng = markerEntry ? markerEntry.marker.getLatLng() : null;
      if (latLng) {
        lat = latLng.lat;
        lng = latLng.lng;
      } else {
        console.error(`マーカー座標が見つかりません: ${address}`);
        reject(new Error(`マーカー座標が見つかりません: ${address}`));
        return;
      }
    }

    // 保存データを作成
    const saveData = {
      lat: lat,
      lng: lng,
      status: data.status,
      memo: data.memo || '',
      name: data.name || '' // nameを追加
    };

    const fileContent = JSON.stringify(saveData, null, 2);
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    const contentType = 'application/json';

    // 既存ファイルの検索
    gapi.client.drive.files
      .list({
        q: `name='${address}.json' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id, name)'
      })
      .then(response => {
        const files = response.result.files;
        if (files && files.length > 0) {
          // 既存ファイルが存在する場合、更新（PATCH）
          const fileId = files[0].id;
          const fileMetadata = {
            name: `${address}.json`
          };
          const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(fileMetadata) +
            delimiter +
            `Content-Type: ${contentType}\r\n\r\n` +
            fileContent +
            closeDelimiter;

          gapi.client
            .request({
              path: `/upload/drive/v3/files/${fileId}`,
              method: 'PATCH',
              params: { uploadType: 'multipart' },
              headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`
              },
              body: multipartRequestBody
            })
            .then(response => {
              console.log(`データ更新成功: ${address}.json (ID: ${response.result.id})`);
              resolve(response);
            })
            .catch(error => {
              console.error('データ更新エラー:', JSON.stringify(error, null, 2));
              reject(error);
            });
        } else {
          // ファイルが存在しない場合、新規作成（POST）
          const fileMetadata = {
            name: `${address}.json`,
            mimeType: 'application/json',
            parents: [folderId]
          };
          const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(fileMetadata) +
            delimiter +
            `Content-Type: ${contentType}\r\n\r\n` +
            fileContent +
            closeDelimiter;

          gapi.client
            .request({
              path: '/upload/drive/v3/files',
              method: 'POST',
              params: { uploadType: 'multipart' },
              headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`
              },
              body: multipartRequestBody
            })
            .then(response => {
              console.log(`データ保存成功: ${address}.json (ID: ${response.result.id})`);
              resolve(response);
            })
            .catch(error => {
              console.error('データ保存エラー:', JSON.stringify(error, null, 2));
              reject(error);
            });
        }
      })
      .catch(error => {
        console.error('ファイル検索エラー:', JSON.stringify(error, null, 2));
        reject(error);
      });
  });
}

// Google Driveからデータを読み込む
function loadFromDrive(address) {
  return new Promise((resolve, reject) => {
    if (!folderId) {
      console.error('フォルダIDが未設定です。フォルダ検索を再試行します。');
      return findOrCreateFolder().then(() => {
        loadFromDrive(address).then(resolve).catch(reject);
      }).catch(error => {
        console.error('フォルダ作成エラーで読み込み失敗:', error);
        reject(error);
      });
    }

    gapi.client.drive.files.list({
      q: `name='${address}.json' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id, name)'
    }).then(response => {
      const files = response.result.files;
      if (files && files.length > 0) {
        const fileId = files[0].id;
        gapi.client.drive.files.get({
          fileId: fileId,
          alt: 'media'
        }).then(fileResponse => {
          console.log(`データ読み込み成功: ${address}.json`);
          resolve(JSON.parse(fileResponse.body));
        }).catch(error => {
          console.error(`ファイル読み込みエラー: ${JSON.stringify(error, null, 2)}`);
          reject(error);
        });
      } else {
        console.log(`ファイルが見つかりません: ${address}.json`);
        resolve(null); // ファイルが存在しない場合はnullを返す
      }
    }).catch(error => {
      console.error(`ファイル検索エラー: ${JSON.stringify(error, null, 2)}`);
      reject(error);
    });
  });
}

// Google Driveからマーカーデータを読み込んでマップに反映
function renderMarkersFromDrive() {
  console.log('renderMarkersFromDrive: 開始');
  loadAllMarkerData().then(results => {
    console.log('取得したデータ:', results);
    if (!results || results.length === 0) {
      console.warn('マーカーデータがありません。Google DriveのPWA_Visitsフォルダを確認してください。');
      return;
    }
    results.forEach(({ address, data }, index) => {
      console.log(`処理中のデータ: 住所=${address}, データ=${JSON.stringify(data)}`);
      if (data.lat && data.lng) {
    const markerId = `marker-${index}`;
		const marker = L.marker([data.lat, data.lng], { icon: createMarkerIcon(data.status) });

		// 空のポップアップをバインド
		marker.bindPopup('');

		// ポップアップ開いた時に内容を動的に設定
		marker.on('popupopen', () => {
		  console.log(`ポップアップ開く: markerId=${markerId}, editMode=${editMode}`);
		  const safeAddress = address.replace(/'/g, "\\'");
      const popupContent = generatePopupContent(markerId, { ...data, address }, editMode);
		  marker.getPopup().setContent(popupContent);

		  // イベントリスナーを追加
		  setTimeout(() => {
		    const saveButton = document.getElementById(`save-${markerId}`);
		    const deleteButton = editMode ? document.getElementById(`delete-${markerId}`) : null;
		    if (saveButton) {
		      saveButton.onclick = () => saveEdit(markerId, address);
		    }
		    if (deleteButton) {
		      deleteButton.onclick = () => deleteMarker(markerId, address);
		    }
		  }, 100);
		});

		markers[markerId] = { marker, address, status: data.status, memo: data.memo || '' };
    markerClusterGroup.addLayer(marker); // マップではなくクラスターグループに追加

      } else {
        console.warn(`無効なデータ: 住所=${address}, 緯度または経度が欠落`);
      }
    });
    map.invalidateSize();
    console.log('renderMarkersFromDrive: 完了');
  }).catch(error => {
    console.error('マーカーデータ描画エラー:', JSON.stringify(error, null, 2));
  });
}

// 既存マーカーの編集内容を保存
window.saveEdit = function(markerId, address) {
  try {
    if (!markers[markerId]) throw new Error(`マーカー ${markerId} が見つかりません`);
    const status = document.getElementById(`status-${markerId}`).value;
    const memo = document.getElementById(`memo-${markerId}`).value;
    saveToDrive(address, { status, memo });
    console.log(`更新: ${address} - ${status}, ${memo}`);
    markers[markerId].status = status;
    markers[markerId].memo = memo;
    markers[markerId].marker.setIcon(createMarkerIcon(status));
    // ポップアップを再設定（編集モードに基づく）
    const popupContent = generatePopupContent(markerId, { address, name: markers[markerId].name, status, memo }, editMode);
    markers[markerId].marker.getPopup().setContent(popupContent);
  } catch (error) {
    console.error(`保存エラー: ${error.message}`);
  }
};

// Google Driveからすべてのマーカーデータを読み込む
function loadAllMarkerData() {
  return new Promise((resolve, reject) => {
    if (!folderId) {
      console.error('フォルダIDが未設定です。フォルダ検索を再試行します。');
      return findOrCreateFolder().then(() => {
        loadAllMarkerData().then(resolve).catch(reject);
      }).catch(error => {
        console.error('フォルダ作成エラーで読み込み失敗:', error);
        reject(error);
      });
    }

    gapi.client.drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/json' and trashed=false`,
      fields: 'files(id, name)'
    }).then(response => {
      const files = response.result.files;
      if (!files || files.length === 0) {
        console.log('フォルダ内にJSONファイルが見つかりません');
        resolve([]);
        return;
      }

      const loadPromises = files.map(file => {
        return gapi.client.drive.files.get({
          fileId: file.id,
          alt: 'media'
        }).then(fileResponse => {
          const data = JSON.parse(fileResponse.body);
          const address = file.name.replace('.json', '');
          return { address, data };
        }).catch(error => {
          console.error(`ファイル読み込みエラー (${file.name}):`, JSON.stringify(error, null, 2));
          return null;
        });
      });

      Promise.all(loadPromises).then(results => {
        const validResults = results.filter(result => result !== null);
        console.log('全マーカーデータ読み込み成功:', validResults);
        resolve(validResults);
      }).catch(error => {
        console.error('マーカーデータ一括読み込みエラー:', JSON.stringify(error, null, 2));
        reject(error);
      });
    }).catch(error => {
      console.error('ファイル一覧取得エラー:', JSON.stringify(error, null, 2));
      reject(error);
    });
  });
}

// マーカーの削除関数
function deleteMarker(markerId, address) {
  if (!confirm(`住所「${address}」を削除しますか？`)) {
    return;
  }

  // Google Driveからファイル削除
  loadFromDrive(address).then(existingData => {
    if (existingData) {
      gapi.client.drive.files.list({
        q: `name='${address}.json' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id, name)'
      }).then(response => {
        const files = response.result.files;
        if (files && files.length > 0) {
          const fileId = files[0].id;
          gapi.client.drive.files.delete({
            fileId: fileId
          }).then(() => {
            console.log(`ファイル削除成功: ${address}.json`);
          }).catch(error => {
            console.error('ファイル削除エラー:', JSON.stringify(error, null, 2));
          });
        }
      }).catch(error => {
        console.error('ファイル検索エラー:', JSON.stringify(error, null, 2));
      });
    }

    // マップからマーカー削除
    if (markers[markerId]) {
      markerClusterGroup.removeLayer(markers[markerId].marker);
      delete markers[markerId];
      console.log(`マーカー削除: ${markerId}`);
    }
  }).catch(error => {
    console.error('削除エラー:', JSON.stringify(error, null, 2));
  });
}

// --- ヘルパー関数 ---

/**
 * 国土地理院APIを使用してリバースジオコーディングを行う
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 * @returns {Promise<string>} 住所文字列
 */
async function reverseGeocode(lat, lng) {
  // 優先的に試すAPIエンドポイント
  const primaryUrl = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`;

  try {
    let response = await fetch(primaryUrl);
    let json = await response.json();

    // 最初のAPIの結果を整形して返す
    if (json && json.results) {
      const { muniCd, lv01Nm } = json.results;

      // muniCdとlv01Nmの両方が存在する場合
      if (muniCd && lv01Nm) {
        const muniCdStr = String(muniCd);
        let baseAddress = '';

        // 特定の市区町村コードに応じてベースとなる住所を設定
        if (muniCdStr === '34213') {
          baseAddress = '広島県廿日市市';
        } else if (muniCdStr === '34211') {
          baseAddress = '広島県大竹市';
        }

        if (baseAddress) {
          // ベース住所とlv01Nmを結合して返す
          return baseAddress + lv01Nm;
        }
      }
      // フォールバック: 対象外の地域、またはmuniCdが取得できなかった場合
      return json.results.lv01Nm || "住所が見つかりません";
    }
    return "住所が見つかりません";

  } catch (error) {
    throw new Error(`リバースジオコーディングに失敗しました: ${error.message}`);
  }
}

/**
 * ステータスに応じたマーカーアイコンを生成する
 * @param {string} status - '未訪問', '訪問済み', '不在', または 'new'
 * @returns {L.DivIcon} LeafletのDivIconオブジェクト
 */
function createMarkerIcon(status) {
  let className = 'marker-icon ';
  switch (status) {
    case '未訪問':
      className += 'marker-unvisited';
      break;
    case '訪問済み':
      className += 'marker-visited';
      break;
    case '不在':
      className += 'marker-absent';
      break;
    case 'new':
    default:
      className += 'marker-new';
      break;
  }
  return L.divIcon({ className, iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12] });
}

/**
 * ポップアップのHTMLコンテンツを生成する
 * @param {string} markerId - マーカーの一意なID
 * @param {object} data - { address, name, status, memo, isNew } を含むオブジェクト
 * @param {boolean} isEditMode - 現在の編集モード
 * @returns {string} HTML文字列
 */
function generatePopupContent(markerId, data, isEditMode) {
  const { address, name, status, memo, isNew = false } = data;
  const title = isNew ? '新しい住所の追加' : (name || address);
  const statuses = ['未訪問', '訪問済み', '不在'];

  const statusOptions = statuses.map(s =>
    `<option value="${s}" ${status === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  const buttons = isNew
    ? `<button id="save-${markerId}">保存</button><button id="cancel-${markerId}">キャンセル</button>`
    : isEditMode
      ? `<button id="save-${markerId}">保存</button><button id="delete-${markerId}">削除</button>`
      : `<button id="save-${markerId}">保存</button>`;

  return `
    <div id="popup-${markerId}">
      <b>${title}</b><br>
      住所: ${isNew ? `<input type="text" id="address-${markerId}" value="${address || ''}">` : address}<br>
      ${isNew ? `名前: <input type="text" id="name-${markerId}" value="${name || ''}"><br>` : ''}
      ステータス: <select id="status-${markerId}">${statusOptions}</select><br>
      メモ: <textarea id="memo-${markerId}">${memo || ''}</textarea><br>
      ${buttons}
    </div>
  `;
}

/**
 * ズームレベルに応じて円マーカーの半径を計算する
 * @param {number} zoom - 地図の現在のズームレベル
 * @returns {number} 半径
 */
function calculateRadiusByZoom(zoom) {
  if (zoom >= 18) {
    return 10; // 詳細表示
  } else if (zoom >= 15) {
    return 8;  // 中間
  } else {
    return 6;  // 広域表示
  }
}


// --- アプリケーションの初期化 ---

// 地図タイルレイヤーを追加
L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
  attribution: '出典: <a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>',
  maxZoom: 18
}).addTo(map);

// DOMの読み込みが完了したら、APIの初期化とイベントリスナーの設定を行う
document.addEventListener('DOMContentLoaded', () => {
  try {
    initGoogleDriveAPI();

    const editButton = document.getElementById('edit-mode-button');
	  if (editButton) {
	    editButton.addEventListener('click', toggleEditMode);
	    console.log('編集モードボタン設定完了');
    }

    const centerMapButton = document.getElementById('center-map-button');
    if (centerMapButton) {
      centerMapButton.addEventListener('click', centerMapToCurrentUser);
      console.log('現在地へ移動ボタン設定完了');
      // 初期状態のボタン表示を更新
      updateFollowingStatusButton();
    }
  } catch (error) {
    console.error('DOMContentLoadedエラー:', JSON.stringify(error, null, 2));
  }
});
