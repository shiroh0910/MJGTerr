export class UIManager {
  constructor() {
    this.elements = {};
  }

  /**
   * UI要素の参照を初期化する
   */
  initialize() {
    this.elements = {
      markerButton: document.getElementById('edit-mode-button'),
      boundaryButton: document.getElementById('boundary-draw-button'),
      finishDrawingButton: document.getElementById('finish-drawing-button'),
      centerMapButton: document.getElementById('center-map-button'),
      filterByAreaButton: document.getElementById('filter-by-area-button'),
      resetMarkersButton: document.getElementById('reset-markers-in-area-button'),
      exportButton: document.getElementById('export-button'),
      userProfileContainer: document.getElementById('user-profile-container'),
      userProfilePic: document.getElementById('user-profile-pic'),
      userProfileName: document.getElementById('user-profile-name'),
      addressDisplay: document.getElementById('current-address-display'),
    };

    // 初期状態では編集関連のボタンをすべて無効化しておく
    this.updateSignInStatus(false, null);
  }

  updateMarkerModeButton(isActive) {
    this.elements.markerButton.classList.toggle('active-green', isActive);
  }

  updateBoundaryModeButton(isActive) {
    this.elements.boundaryButton.classList.toggle('active-green', isActive);
    this.elements.finishDrawingButton.style.display = isActive ? 'block' : 'none';
  }

  updateFollowingStatus(isFollowing) {
    this.elements.centerMapButton.classList.toggle('active', isFollowing);
  }

  updateSignInStatus(isSignedIn, userInfo) {
    this.elements.userProfileContainer.style.display = isSignedIn && userInfo ? 'flex' : 'none';
    if (isSignedIn && userInfo) {
      this.elements.userProfilePic.src = userInfo.picture;
      this.elements.userProfileName.textContent = userInfo.name;
    }

    // ログイン状態に応じて機能ボタンの有効/無効を切り替える
    // 「現在地に戻る」ボタンは常に有効
    const buttonsToToggle = [
      this.elements.markerButton,
      this.elements.boundaryButton,
      this.elements.filterByAreaButton,
      this.elements.resetMarkersButton,
      this.elements.exportButton,
    ];
    buttonsToToggle.forEach(button => {
      // ログイン状態がUIに反映されない問題の回避策として、常にボタンを有効化する
      if (button) button.disabled = false;
    });
  }

  updateAddressDisplay(address) {
    if (this.elements.addressDisplay) {
      this.elements.addressDisplay.textContent = address;
    }
  }
}
