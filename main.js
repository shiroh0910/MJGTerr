import L    from 'leaflet';
import Papa from 'papaparse';

// Google Drive APIの設定
const CLIENT_ID = '443497601026-673sseribcfo0dbh10khra9q76koji69.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBMRUDqbPnw2DtyIR8muOS2i0SV33XyEs0';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly';
const FOLDER_NAME = 'PWA_Visits';
const markers = {};

let folderId = null;
let accessToken = null;
let editMode = false;		// 編集モードON/OFF

// 地図初期化（広島県廿日市市阿品台東中心）
const map = L.map('map', { dragging: true, tap: false }).setView([34.3140, 132.3080], 15);

// 地図のクリック/タップイベント
map.on('click', (e) => {
  if (editMode) {
    // 編集モードON: 空き場所で新規マーカー追加
    if (!getMarkerAt(e.latlng)) {
      console.log(`編集モードON: 新規追加 ${e.latlng.lat}, ${e.latlng.lng}`);
      addNewMarker(e.latlng);
    }
  }
  // 編集モードOFF: マーカー上のみポップアップ表示
  else {
    const clickedMarker = getMarkerAt(e.latlng);
    if (clickedMarker) {
      console.log(`編集モードOFF: マーカークリック ${clickedMarker.markerId}`);
      clickedMarker.marker.openPopup();
    }
  }
});

// マーカー上かチェックする関数
function getMarkerAt(latlng) {
  const tolerance = 0.0001; // クリック許容範囲（ズームレベルに応じて調整可能）
  for (const [markerId, markerObj] of Object.entries(markers)) {
    const markerLatLng = markerObj.marker.getLatLng();
    const latDiff = Math.abs(latlng.lat - markerLatLng.lat);
    const lngDiff = Math.abs(latlng.lng - markerLatLng.lng);
    if (latDiff < tolerance && lngDiff < tolerance) {
      markerObj.markerId = markerId; // オブジェクトにIDを追加
      return markerObj;
    }
  }
  return null;
}

// 編集モードボタンのトグル関数
function toggleEditMode() {
  editMode = !editMode;
  const button = document.getElementById('edit-mode-button');
  if (button) {
    button.textContent = `編集モード ${editMode ? 'ON' : 'OFF'}`;
    button.style.backgroundColor = editMode ? 'green' : 'red';
    console.log(`編集モード: ${editMode ? 'ON' : 'OFF'}`);
  }
  // 編集モード変更時にすべてのポップアップを閉じて再設定を促す
  Object.values(markers).forEach(markerObj => {
    if (markerObj.marker.isPopupOpen()) {
      markerObj.marker.closePopup();
    }
  });
}

function addNewMarker(latlng) {
  console.log(`新規マーカー追加: 座標 ${latlng.lat}, ${latlng.lng}, ズームレベル: ${map.getZoom()}`);
  const markerId = `marker-new-${Date.now()}`; // 一意なIDを生成
  const marker = L.marker([latlng.lat, latlng.lng], {
    icon: L.divIcon({
      className: 'marker-icon',
      html: `<div style="background-color: red; width: 20px; height: 20px; border-radius: 50%;"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      popupAnchor: [0, -10]
    })
  }).addTo(map);

  // ピクセル座標のログ（デバッグ用）
  const pixelPoint = map.latLngToLayerPoint(latlng);
  console.log(`ピクセル座標: x=${pixelPoint.x}, y=${pixelPoint.y}`);

  // ポップアップの内容
  marker.bindPopup(`
    <div id="popup-${markerId}">
      <b>新しい住所の追加</b><br>
      住所: <input type="text" id="address-${markerId}" value="広島県廿日市市"><br>
      名前: <input type="text" id="name-${markerId}"><br>
      ステータス: <select id="status-${markerId}">
        <option value="未訪問" selected>未訪問</option>
        <option value="訪問済み">訪問済み</option>
        <option value="不在">不在</option>
      </select><br>
      メモ: <textarea id="memo-${markerId}"></textarea><br>
      <button id="save-${markerId}">保存</button>
      <button id="cancel-${markerId}">キャンセル</button>
    </div>
  `).openPopup();

console.log(`ポップアップ設定完了: ${markerId}`);

// ポップアップ内容がレンダリングされた後にイベントリスナーを追加
setTimeout(() => {
  console.log(`setTimeout実行: ${markerId}`);
  const saveButton = document.getElementById(`save-${markerId}`);
  const cancelButton = document.getElementById(`cancel-${markerId}`);
  console.log(`保存ボタン取得: ${saveButton ? '成功' : '失敗'}, キャンセルボタン取得: ${cancelButton ? '成功' : '失敗'}`);
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      console.log(`保存ボタンクリック: ${markerId}`);
      saveNewMarker(markerId, latlng.lat, latlng.lng);
    });
  }
  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      console.log(`キャンセルボタンクリック: ${markerId}`);
      cancelNewMarker(markerId);
    });
  }
}, 300);

  // 一時的にマーカーを保存
  markers[markerId] = { marker, address: null, status: '未訪問', memo: '' };

  // マーカー配置後の座標確認
  const markerLatLng = marker.getLatLng();
  console.log(`マーカー配置座標: ${markerLatLng.lat}, ${markerLatLng.lng}`);
}

// 新規マーカーの保存（重複チェック付き）
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

      // ポップアップを更新（名前を含める）
      const safeAddress = address.replace(/'/g, "\\'");
      const popupContent = editMode ? `
        <b>${name || address}</b><br>
        住所: ${address}<br>
        ステータス: <select id="status-${markerId}">
          <option>${status}</option>
          <option>未訪問</option>
          <option>訪問済み</option>
          <option>不在</option>
        </select><br>
        メモ: <textarea id="memo-${markerId}">${memo || ''}</textarea><br>
        <button id="save-${markerId}">保存</button>
        <button id="delete-${markerId}">削除</button>
      ` : `
        <b>${name || address}</b><br>
        住所: ${address}<br>
        ステータス: <select id="status-${markerId}">
          <option>${status}</option>
          <option>未訪問</option>
          <option>訪問済み</option>
          <option>不在</option>
        </select><br>
        メモ: <textarea id="memo-${markerId}">${memo || ''}</textarea><br>
        <button id="save-${markerId}">保存</button>
      `;
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
      alert('データの保存に失敗しました');
      map.removeLayer(markers[markerId].marker);
      delete markers[markerId];
    });
  }).catch(error => {
    console.error('重複チェックエラー:', JSON.stringify(error, null, 2));
    alert('重複チェックに失敗しました');
  });
}

// 新規マーカーのキャンセル
function cancelNewMarker(markerId) {
  console.log(`新規マーカーキャンセル: ${markerId}`);
  map.removeLayer(markers[markerId].marker);
  delete markers[markerId];
}

// Google APIの初期化
function initGoogleDriveAPI() {
  console.log('initGoogleDriveAPI: 開始');
  gapi.load('client', () => {
    gapi.client.init({
      apiKey: API_KEY
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
    client_id: CLIENT_ID,
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

// 認証状態の更新
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

// 共有フォルダを検索または作成
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
		const marker = L.marker([data.lat, data.lng], {
		  icon: L.divIcon({
		    className: 'marker-icon',
		    html: `<div style="background-color: ${data.status === '未訪問' ? '#999999' : data.status === '訪問済み' ? '#90EE90' : '#CCCCCC'}; width: 20px; height: 20px; border-radius: 50%;"></div>`,
		    iconSize: [20, 20],
		    iconAnchor: [10, 10],
		    popupAnchor: [0, -10]
		  })
		}).addTo(map);

		// 空のポップアップをバインド
		marker.bindPopup('').addTo(map);

		// ポップアップ開いた時に内容を動的に設定
		marker.on('popupopen', () => {
		  console.log(`ポップアップ開く: markerId=${markerId}, editMode=${editMode}`);
		  const safeAddress = address.replace(/'/g, "\\'");
		  const currentStatus = markers[markerId].status || data.status;
		  const currentMemo = markers[markerId].memo || data.memo || '';
		  const name = markers[markerId].name || address;
		const popupContent = editMode ? `
		  <b>${name}</b><br>
		  住所: ${address}<br>
		  ステータス: <select id="status-${markerId}">
		    <option value="未訪問" ${currentStatus === '未訪問' ? 'selected' : ''}>未訪問</option>
		    <option value="訪問済み" ${currentStatus === '訪問済み' ? 'selected' : ''}>訪問済み</option>
		    <option value="不在" ${currentStatus === '不在' ? 'selected' : ''}>不在</option>
		  </select><br>
		  メモ: <textarea id="memo-${markerId}">${currentMemo}</textarea><br>
		  <button id="save-${markerId}">保存</button>
		  <button id="delete-${markerId}">削除</button>
		` : `
		  <b>${name}</b><br>
		  住所: ${address}<br>
		  ステータス: <select id="status-${markerId}">
		    <option value="未訪問" ${currentStatus === '未訪問' ? 'selected' : ''}>未訪問</option>
		    <option value="訪問済み" ${currentStatus === '訪問済み' ? 'selected' : ''}>訪問済み</option>
		    <option value="不在" ${currentStatus === '不在' ? 'selected' : ''}>不在</option>
		  </select><br>
		  メモ: <textarea id="memo-${markerId}">${currentMemo}</textarea><br>
		  <button id="save-${markerId}">保存</button>
		`;

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

// 編集保存関数
window.saveEdit = function(markerId, address) {
  try {
    if (!markers[markerId]) throw new Error(`マーカー ${markerId} が見つかりません`);
    const status = document.getElementById(`status-${markerId}`).value;
    const memo = document.getElementById(`memo-${markerId}`).value;
    saveToDrive(address, { status, memo });
    console.log(`更新: ${address} - ${status}, ${memo}`);
    markers[markerId].status = status;
    markers[markerId].memo = memo;
    markers[markerId].marker.setIcon(
      L.divIcon({
        className: 'marker-icon',
        html: `<div style="background-color: ${status === '未訪問' ? '#999999' : status === '訪問済み' ? '#90EE90' : '#CCCCCC'}; width: 20px; height: 20px; border-radius: 50%;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
      })
    );
    // ポップアップを再設定（編集モードに基づく）
		  const safeAddress = address.replace(/'/g, "\\'");
		  const currentStatus = markers[markerId].status;
		  const currentMemo = markers[markerId].memo || '';
		  const name = markers[markerId].name || address; // nameプロパティがあればそれを使う
		const popupContent = editMode ? `
		  <b>${name}</b><br>
		  住所: ${address}<br>
		  ステータス: <select id="status-${markerId}">
		    <option value="未訪問" ${currentStatus === '未訪問' ? 'selected' : ''}>未訪問</option>
		    <option value="訪問済み" ${currentStatus === '訪問済み' ? 'selected' : ''}>訪問済み</option>
		    <option value="不在" ${currentStatus === '不在' ? 'selected' : ''}>不在</option>
		  </select><br>
		  メモ: <textarea id="memo-${markerId}">${currentMemo}</textarea><br>
		  <button id="save-${markerId}">保存</button>
		  <button id="delete-${markerId}">削除</button>
		` : `
		  <b>${name}</b><br>
		  住所: ${address}<br>
		  ステータス: <select id="status-${markerId}">
		    <option value="未訪問" ${currentStatus === '未訪問' ? 'selected' : ''}>未訪問</option>
		    <option value="訪問済み" ${currentStatus === '訪問済み' ? 'selected' : ''}>訪問済み</option>
		    <option value="不在" ${currentStatus === '不在' ? 'selected' : ''}>不在</option>
		  </select><br>
		  メモ: <textarea id="memo-${markerId}">${currentMemo}</textarea><br>
		  <button id="save-${markerId}">保存</button>
		`;
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
      map.removeLayer(markers[markerId].marker);
      delete markers[markerId];
      console.log(`マーカー削除: ${markerId}`);
    }
  }).catch(error => {
    console.error('削除エラー:', JSON.stringify(error, null, 2));
  });
}

// GSI淡色地図
L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
  attribution: '出典: <a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>',
  maxZoom: 18
}).addTo(map);

// ロード後処理
document.addEventListener('DOMContentLoaded', () => {
  try {
    initGoogleDriveAPI();
    const editButton = document.getElementById('edit-mode-button');
	  if (editButton) {
	    editButton.addEventListener('click', toggleEditMode);
	    console.log('編集モードボタン設定完了');
	  }
  } catch (error) {
    console.error('DOMContentLoadedエラー:', JSON.stringify(error, null, 2));
  }
});
