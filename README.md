# MJGTerr

訪問先を地図上で管理するためのPWA（Progressive Web App）です。

## 機能

- Leafletを利用した地図表示
- 地図上へのマーカー追加・編集・削除
- Google Driveとの連携によるデータ保存
- オフライン対応

## 開発環境のセットアップと初期設定

このPWAをローカルで開発・テストするには、以下の手順が必要です。

1.  **依存パッケージのインストール**
    プロジェクトのルートディレクトリで以下のコマンドを実行し、必要なパッケージをインストールします。
    ```bash
    npm install
    ```

2.  **環境変数の設定**
    Google APIを利用するため、プロジェクトのルートディレクトリに `.env` ファイルを作成し、以下の環境変数を設定します。

    *   `VITE_GOOGLE_CLIENT_ID`: Google Cloud Platformで取得したOAuth 2.0 クライアントID
    *   `VITE_GOOGLE_MAPS_API_KEY`: Google Maps Platformで取得したAPIキー
    
    例:
    ```
    VITE_GOOGLE_CLIENT_ID="YOUR_CLIENT_ID.apps.googleusercontent.com"
    VITE_GOOGLE_MAPS_API_KEY="YOUR_GOOGLE_MAPS_API_KEY"
    ```
    
    **注意**: `VITE_GOOGLE_CLIENT_ID` はOAuth同意画面で設定したWebアプリケーションのクライアントIDを使用してください。

3.  **Google Cloud Platform (GCP) プロジェクトの設定**
    アプリがGoogle Driveにアクセスし、ユーザー認証を行うために、GCPプロジェクトで以下の設定が必要です。

    *   **OAuth同意画面の設定**:
        *   GCPコンソールで「APIとサービス」->「OAuth同意画面」に移動します。
        *   「公開ステータス」が「テスト」の場合、テストを依頼するユーザーのGmailアドレスを「テストユーザー」として追加する必要があります。
        *   「公開ステータス」が「本番環境」の場合、Googleの審査が必要です。

    *   **APIの有効化**:
        *   「Google Drive API」と「Google Maps JavaScript API」を有効化してください。

4.  **Google Driveフォルダの共有設定**
    アプリがデータを保存するGoogle Driveのフォルダ（デフォルトでは `PWA_Visits`）を、テストユーザーと共有する必要があります。

    *   アプリをセットアップしたGoogleアカウントのGoogle Driveにアクセスします。
    *   「`PWA_Visits`」フォルダを見つけ、テストユーザーに「編集者」権限で共有します。

5.  **開発サーバーの起動**
    すべての設定が完了したら、以下のコマンドで開発サーバーを起動し、ブラウザでアプリにアクセスします。
    ```bash
    npm run dev
    ```

## メモ

-   このアプリはGoogle Driveにデータを保存します。初回利用時にGoogleアカウントでの認証が必要です。
-   マーカーデータはGoogle Driveの `PWA_Visits` フォルダ内にJSONファイルとして保存されます。
