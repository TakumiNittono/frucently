# Frequently - 爆速ハンズフリー音声AI会話システム

リアルタイムで自然な日本語会話が可能な、超低遅延のハンズフリー音声AIシステムです。

## フェーズ1: 最速の「脳」を確保 ✅

Groq APIを使用してストリーミングでテキストを表示する機能を実装しました。

## フェーズ2: 最速の「耳と口」を接続 🚧

音声認識（STT）と音声合成（TTS）を統合し、エンドツーエンドで音声会話が動作する機能を実装中です。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local.example` を `.env.local` にコピーし、Groq APIキーを設定してください。

```bash
cp .env.local.example .env.local
```

`.env.local` ファイルを編集して、Groq APIキーを設定:

```env
# Groq API Key (LLM)
GROQ_API_KEY=your_groq_api_key_here
# オプション: 使用するモデル名を指定（デフォルト: llama-3.1-8b-instant）
# GROQ_MODEL=llama-3.1-8b-instant

# Deepgram API Key (STT: 音声認識)
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# ElevenLabs API Key (TTS: 音声合成) - メイン（推奨）
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
# オプション: 使用する音声ID（デフォルト: 21m00Tcm4TlvDq8ikWAM）
# ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# Cartesia API Key (TTS: 音声合成) - オプション（フォールバック）
# CARTESIA_API_KEY=your_cartesia_api_key_here

# オプション: TTSプロバイダーを強制指定（elevenlabs または cartesia）
# デフォルト: ElevenLabs（ELEVENLABS_API_KEYが設定されている場合）
# TTS_PROVIDER=elevenlabs
```

**利用可能なモデル例:**
- `llama-3.1-8b-instant` - 高速、小規模（デフォルト）
- `llama-3.1-70b-versatile` - 高精度（廃止の可能性あり）
- `mixtral-8x7b-32768` - 大規模コンテキスト対応
- `gemma2-9b-it` - Google Gemma 2

最新の利用可能なモデルは [Groq Console](https://console.groq.com/docs/models) で確認してください。

### 3. APIキーの取得

#### Groq APIキー（LLM）
1. [Groq Console](https://console.groq.com/) にアクセス
2. アカウントを作成（またはログイン）
3. API Keys セクションから新しいAPIキーを作成
4. 作成したAPIキーを `.env.local` に設定

#### ElevenLabs APIキー（TTS: 音声合成） - メイン・必須
1. [ElevenLabs](https://elevenlabs.io/) にアクセス
2. アカウントを作成（またはログイン）
3. Profile → API Key からAPIキーをコピー
4. 作成したAPIキーを `.env.local` に設定
5. （オプション）使用したい音声IDを設定（Voice Libraryから選択可能）

**ElevenLabs Turboの特徴:**
- 超低遅延（150-200ms）
- 高品質な日本語音声
- ストリーミング対応
- 実装が安定

#### Cartesia APIキー（TTS: 音声合成） - オプション
1. [Cartesia Console](https://cartesia.ai/) にアクセス
2. アカウントを作成（またはログイン）
3. API Keys セクションから新しいAPIキーを作成
4. 作成したAPIキーを `.env.local` に設定
5. `TTS_PROVIDER=cartesia` を設定して使用

**注意**: Cartesiaは現在エンドポイントの問題があるため、ElevenLabsを推奨します。

#### Deepgram APIキー（STT: 音声認識）
1. [Deepgram Console](https://console.deepgram.com/) にアクセス
2. アカウントを作成（またはログイン）
3. API Keys セクションから新しいAPIキーを作成
4. 作成したAPIキーを `.env.local` に設定


### 4. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3005](http://localhost:3005) を開いてください。

**注意**: デフォルトのポートは3005に設定されています。3000ポートを使用したい場合は `npm run dev:3000` を実行してください。

## 使い方

### フェーズ1（テキスト会話）
1. プロンプト入力欄に日本語で質問を入力
2. 「送信」ボタンをクリック
3. AIの応答がストリーミングで表示されます
4. TTFT (Time To First Token) が自動的に測定・表示されます

### フェーズ2（音声会話）
1. 「🎤 録音開始」ボタンをクリック
2. マイクに向かって話す
3. 「録音中...」ボタンをクリックして録音を停止
4. 音声が自動的にテキストに変換され、AIが応答します
5. AIの応答が音声で再生されます

## 技術スタック

- **Next.js 14+** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Groq API** (LLM: Llama 3.1)
- **Deepgram API** (STT: 音声認識)
- **ElevenLabs Turbo API** (TTS: 音声合成 - メイン)
- **Cartesia API** (TTS: 音声合成 - オプション)

## プロジェクト構造

```
frequently/
├── app/
│   ├── api/
│   │   └── groq/
│   │       └── route.ts          # Groq API Route Handler
│   ├── components/
│   │   └── GroqStream.tsx        # ストリーミング表示コンポーネント
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── .env.local                    # 環境変数 (gitignore)
├── package.json
└── tsconfig.json
```

## 次のステップ

フェーズ1が完了したら、フェーズ2（音声認識と音声合成の統合）に進みます。

