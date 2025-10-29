# 開発環境セットアップガイド

このドキュメントは、`MJGTerr` プロジェクトの開発環境をセットアップするための手順を説明します。
開発には VS Code と Gemini Code Assist を使用し、デプロイは Vercel で行います。

## 1. 前提条件：必要なツールのインストール

開発に必要な基本的なツールをインストールします。すでにインストール済みの場合は、このステップはスキップしてください。

### a. Git

ソースコードのバージョン管理に使用します。

-   **Mac**: ターミナルで以下のコマンドを実行します。
    ```bash
    xcode-select --install
    ```
-   **Windows**: Git for Windows からインストーラーをダウンロードしてインストールしてください。

インストール後、ターミナル（Mac）または Git Bash（Windows）で以下のコマンドを実行し、バージョンが表示されれば成功です。

```bash
git --version
```

### b. Node.js

JavaScript の実行環境およびパッケージ管理ツール（npm）として使用します。**LTS版**（Long Term Support）のインストールを推奨します。

-   Node.js 公式サイト からご自身の OS に合ったインストーラーをダウンロードしてインストールしてください。

インストール後、ターミナルで以下のコマンドを実行し、それぞれのバージョンが表示されれば成功です。

```bash
node -v
npm -v
```

### c. Visual Studio Code (VS Code)

主要なコードエディタとして使用します。

-   VS Code 公式サイト からインストーラーをダウンロードしてインストールしてください。

### d. Gemini Code Assist (VS Code 拡張機能)

AI によるコード補完、生成、リファクタリングなどの支援ツールとして使用します。

-   VS Code を開き、拡張機能ビュー（`Ctrl+Shift+X` または `Cmd+Shift+X`）で「Gemini Code Assist」を検索し、インストールしてください。

## 2. プロジェクトのセットアップ

次に、プロジェクトのソースコードを PC に取得し、必要なライブラリをインストールします。

### a. ソースコードのクローン

ターミナルを開き、プロジェクトを配置したいディレクトリに移動してから、以下のコマンドでソースコードをダウンロードします。

```bash
git clone https://github.com/shiroh0910/MJGTerr.git
```

### b. プロジェクトディレクトリへの移動

```bash
cd MJGTerr
```

### c. 依存関係のインストール

プロジェクトが必要とするライブラリ（Vite, Leaflet など）をインストールします。
`package.json` がある `MJGTerr` ディレクトリ内で実行してください。
```bash
npm install
```

これにより、`package.json` ファイルに基づき、必要なパッケージが `node_modules` ディレクトリにインストールされます。

## 3. 環境変数の設定

このアプリケーションは Google のサービスを利用するため、API キーなどの設定が必要です。これらの機密情報は Vercel のプロジェクト設定に直接追加します。

### a. 必要な環境変数

Vercel でのデプロイには、以下の環境変数が必要です。

### b. API キーとクライアント ID の取得方法

以下の2つの情報を Google Cloud Platform (GCP) で取得する必要があります。

-   `VITE_GOOGLE_MAPS_API_KEY`
-   `VITE_GOOGLE_CLIENT_ID`

**取得手順の概要:**

1.  **Google Cloud Console** にアクセスし、新しいプロジェクトを作成します。
2.  **`Maps JavaScript API`** と **`Google Drive API`** を検索して有効にします。
3.  **API キーの作成**:
    -   「認証情報」ページで「認証情報を作成」→「API キー」を選択し、API キーを作成します。これが `VITE_GOOGLE_MAPS_API_KEY` の値になります。
    -   **推奨**: 作成した API キーには、HTTP リファラー制限をかけ、Vercel のデプロイ先ドメイン（例: `*.vercel.app`）からのリクエストのみを許可するように設定してください。
4.  **OAuth 2.0 クライアント ID の作成**:
    -   「認証情報」ページで「認証情報を作成」→「OAuth 2.0 クライアント ID」を選択します。
    -   アプリケーションの種類として「ウェブ アプリケーション」を選択します。
    -   「承認済みの JavaScript 生成元」と「承認済みのリダイレクト URI」に、Vercel のデプロイ先ドメイン（例: `https://your-project-name.vercel.app`）を追加します。
    -   クライアント ID を作成します。これが `VITE_GOOGLE_CLIENT_ID` の値になります。

> **補足**: もしローカル環境で一時的に動作確認が必要になった場合は、プロジェクトのルートに `.env` ファイルを作成し、上記で取得したキーを記述してください。このファイルは `.gitignore` により Git の管理対象外となっています。

## 4. Vercel でのビルドとデプロイ

このプロジェクトは、GitHub リポジトリへのプッシュをトリガーとして Vercel で自動的にビルド・デプロイされます。

### a. Vercel プロジェクトの作成

1.  Vercel にサインアップし、GitHub アカウントを連携します。
2.  Vercel のダッシュボードで「Add New...」→「Project」を選択します。
3.  `shiroh0910/MJGTerr` リポジトリをインポートします。

### b. プロジェクトの設定

Vercel は Vite プロジェクトを自動的に検出し、適切なビルド設定を構成します。

-   **Framework Preset**: `Vite`
-   **Build Command**: `npm run build`
-   **Output Directory**: `dist`

### c. 環境変数の設定

1.  作成した Vercel プロジェクトの設定画面に移動し、「Environment Variables」セクションを開きます。
2.  「3. 環境変数の設定」で取得したキーと値を、以下のように1つずつ登録します。
    -   `VITE_GOOGLE_MAPS_API_KEY`
    -   `VITE_GOOGLE_CLIENT_ID`
3.  設定を保存し、「Deploy」ボタンをクリックして最初のデプロイを実行します。

### d. 自動デプロイ

初回デプロイ後は、GitHub リポジトリの main ブランチに `git push` するたびに、Vercel が自動で新しいバージョンをビルド・デプロイします。

---

以上で開発とデプロイの準備は完了です。