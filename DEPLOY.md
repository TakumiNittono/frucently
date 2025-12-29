# デプロイガイド

## Vercelへのデプロイ（推奨）

### 1. 前提条件

- [Vercelアカウント](https://vercel.com/)を作成
- GitHubリポジトリにコードをプッシュ済み

### 2. デプロイ手順

1. **Vercelにプロジェクトをインポート**
   - [Vercel Dashboard](https://vercel.com/dashboard)にアクセス
   - "Add New..." → "Project" をクリック
   - GitHubリポジトリを選択
   - プロジェクトをインポート

2. **環境変数の設定**
   - プロジェクト設定 → Environment Variables
   - 以下の環境変数を追加：

```bash
# Groq API Key
GROQ_API_KEY=your_groq_api_key_here

# Deepgram API Key
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# ElevenLabs API Key
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# オプション: Groq Model
GROQ_MODEL=llama-3.1-8b-instant

# オプション: ElevenLabs Voice ID
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

3. **デプロイの実行**
   - "Deploy" ボタンをクリック
   - ビルドが完了するまで待機
   - デプロイURLが表示されます

### 3. カスタムドメインの設定（オプション）

1. プロジェクト設定 → Domains
2. カスタムドメインを追加
3. DNS設定を更新（Vercelの指示に従う）

## Netlifyへのデプロイ

### 1. 前提条件

- [Netlifyアカウント](https://www.netlify.com/)を作成
- GitHubリポジトリにコードをプッシュ済み

### 2. デプロイ手順

1. **Netlifyにプロジェクトをインポート**
   - [Netlify Dashboard](https://app.netlify.com/)にアクセス
   - "Add new site" → "Import an existing project"
   - GitHubリポジトリを選択

2. **ビルド設定**
   - Build command: `npm run build`
   - Publish directory: `.next`

3. **環境変数の設定**
   - Site settings → Environment variables
   - 必要な環境変数を追加（Vercelと同じ）

4. **デプロイの実行**
   - "Deploy site" ボタンをクリック

## 環境変数の確認

デプロイ前に、以下の環境変数が設定されているか確認してください：

- ✅ `GROQ_API_KEY`
- ✅ `DEEPGRAM_API_KEY`
- ✅ `ELEVENLABS_API_KEY`

## デプロイ後の確認事項

1. **基本機能の確認**
   - [ ] 音声入力が動作する
   - [ ] 音声出力が動作する
   - [ ] 会話履歴が保存される

2. **パフォーマンス確認**
   - [ ] TTFTが200ms以下
   - [ ] エンドツーエンド遅延が500ms以下

3. **エラーハンドリング確認**
   - [ ] APIエラーが適切に処理される
   - [ ] エラーメッセージが表示される

## トラブルシューティング

### ビルドエラー

- `npm install` が失敗する場合、`package-lock.json`を確認
- Node.jsのバージョンが18以上であることを確認

### 環境変数エラー

- 環境変数が正しく設定されているか確認
- サーバーを再起動

### APIエラー

- APIキーが有効か確認
- レート制限に達していないか確認

## モニタリング

デプロイ後、以下のモニタリングを設定することを推奨します：

- **Vercel Analytics**: パフォーマンス監視
- **Sentry**: エラートラッキング
- **LogRocket**: セッションリプレイ

