# MJGTerr

訪問先を地図上で管理するためのPWA（Progressive Web App）です。

## 機能

- Leafletを利用した地図表示
- 地図上へのマーカー追加・編集・削除
- Google Driveとの連携によるデータ保存
- オフライン対応

## 開発とデプロイ

このプロジェクトは、GitHubリポジトリへのプッシュをトリガーとして[Vercel](https://vercel.com/)で自動的にビルド・デプロイされます。
開発環境のセットアップやデプロイに関する詳細な手順は、[`development.md`](./src/development.md)を参照してください。

### 必要な設定

アプリケーションを正しく動作させるには、以下の設定が必要です。

1.  **Google Cloud Platform (GCP) でのAPI設定**
    -   `Google Drive API` と `Maps JavaScript API` を有効にする必要があります。
    -   OAuth 2.0 クライアントIDとAPIキーを作成し、Vercelのデプロイ先ドメインを承認済みオリジンとして登録してください。

2.  **Vercelの環境変数**
    -   Vercelプロジェクトの設定画面で、以下の環境変数を設定します。
        -   `VITE_GOOGLE_CLIENT_ID`: GCPで取得したOAuth 2.0 クライアントID
        -   `VITE_GOOGLE_MAPS_API_KEY`: GCPで取得したAPIキー

3.  **Google Driveフォルダの共有設定**
    -   アプリがデータを保存するGoogle Driveのフォルダ（デフォルト名: `PWA_Visits`）を、アプリを利用するユーザー間で「編集者」として共有する必要があります。

## データ保存について

-   このアプリはGoogle Driveにデータを保存します。初回利用時にGoogleアカウントでの認証が必要です。
-   マーカーデータはGoogle Driveの `PWA_Visits` フォルダ内にJSONファイルとして保存されます。
