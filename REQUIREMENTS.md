# 爆速ハンズフリー音声AI会話システム - 要件定義書

## 1. プロジェクト概要

### 1.1 目的
リアルタイムで自然な日本語会話が可能な、超低遅延のハンズフリー音声AIシステムを構築する。ユーザーはボタンを押すことなく、自然な会話のリズムでAIと対話できる。

### 1.2 主要目標
- **TTFT (Time To First Token)**: 200ms以下
- **エンドツーエンド遅延**: 500ms以下
- **インタラプト対応**: ユーザー発話検知からAI停止まで100ms以下
- **VAD (Voice Activity Detection)**: ローカル処理で300msの沈黙検知

### 1.3 ユースケース
- ハンズフリーでの日常会話
- 作業中の音声アシスタント
- リアルタイム通訳・翻訳
- 音声による情報検索

---

## 2. 技術スタック (2025年版)

### 2.1 フロントエンド

| 技術 | バージョン | 役割 | 選定理由 |
|------|-----------|------|----------|
| **Next.js** | 14+ (App Router) | フレームワーク | Server Components、ストリーミング対応、Edge Runtime対応 |
| **React** | 18+ | UIライブラリ | Concurrent Features、Suspenseによる非同期処理最適化 |
| **TypeScript** | 5+ | 型安全性 | 大規模開発での保守性向上 |
| **Tailwind CSS** | 3+ | スタイリング | 高速なUI開発、JITモードによる最適化 |
| **Zustand / Jotai** | 最新 | 状態管理 | 軽量、リアルタイム更新に最適 |

### 2.2 リアルタイム通信

| 技術 | 用途 | 選定理由 |
|------|------|----------|
| **WebSockets (Socket.io)** | 双方向通信 | 低レイテンシ、自動再接続、ルーム管理 |
| **WebRTC** (オプション) | P2P通信 | より低遅延が必要な場合の代替案 |

### 2.3 音声認識 (STT: Speech-to-Text)

| サービス | モデル | 特徴 | 選定理由 |
|----------|--------|------|----------|
| **Deepgram** | Nova-2 | 低遅延、ストリーミング対応 | Whisperより圧倒的に低遅延（50-100ms）、リアルタイム処理 |
| **代替案** | Whisper API | 高精度 | 精度重視の場合の選択肢 |

**Deepgram設定要件:**
- ストリーミングモード: 有効
- チャンクサイズ: 100-200ms
- 言語: 日本語 (ja)
- 句読点: 有効
- プロファニティフィルタ: 設定可能

### 2.4 大規模言語モデル (LLM: 推論)

| サービス | モデル | 性能 | 選定理由 |
|----------|--------|------|----------|
| **Groq** | Llama 3.1 70B | 500-800 tokens/sec | 世界最速の推論速度、ストリーミング対応 |
| **代替案** | Claude 3.5 Sonnet (Anthropic) | 高精度 | 精度重視の場合 |
| **代替案** | GPT-4 Turbo (OpenAI) | 汎用性 | 汎用性重視の場合 |

**Groq設定要件:**
- ストリーミング: 有効
- 温度: 0.7-0.9
- Max Tokens: 512
- System Prompt: 日本語会話特化

### 2.5 音声合成 (TTS: Text-to-Speech)

| サービス | モデル | 特徴 | 選定理由 |
|----------|--------|------|----------|
| **Cartesia** | Sonic-multilingual | 超低遅延 | 音声生成開始まで100ms以下、11Labs Turboより高速 |
| **代替案** | ElevenLabs Turbo | 高品質 | 品質重視の場合 |
| **代替案** | Google Cloud TTS | コスト効率 | コスト重視の場合 |

**Cartesia設定要件:**
- ストリーミング: 有効
- 音声ID: 日本語対応の音声
- サンプリングレート: 24kHz
- フォーマット: PCM / Opus

### 2.6 バックエンド・データベース

| サービス | 用途 | 選定理由 |
|----------|------|----------|
| **Supabase** | BaaS/DB | PostgreSQL、リアルタイム、認証、Edge Functions |
| **PostgreSQL** | データベース | 会話履歴、ユーザーデータ、ベクトル検索 |
| **pgvector** | ベクトル検索 | 会話履歴のセマンティック検索 |
| **Supabase Edge Functions** | サーバーレス関数 | WebSocket管理、API統合 |

### 2.7 音声処理 (ローカル)

| 技術 | 用途 | 選定理由 |
|------|------|----------|
| **Silero VAD** | 発話区間検出 | ブラウザ上で動作、300msの沈黙検知 |
| **ONNX Runtime** | モデル実行 | Web Workers上でVADモデルを実行 |
| **Web Audio API** | 音声処理 | マイク入力、オーディオストリーム管理 |
| **MediaRecorder API** | 録音 | チャンク単位での音声データ取得 |

---

## 3. アーキテクチャ設計

### 3.1 システム全体図

```
┌─────────────────────────────────────────────────────────┐
│                   ブラウザ (Next.js)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Web Audio   │  │  Silero VAD  │  │  UI/UX       │  │
│  │     API      │  │  (Web Worker)│  │  (React)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                  │                  │          │
│         └──────────────────┼──────────────────┘          │
│                            │                              │
│                    ┌───────▼────────┐                     │
│                    │  WebSocket     │                     │
│                    │  Client        │                     │
│                    └───────┬────────┘                     │
└────────────────────────────┼──────────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  Next.js API     │
                    │  Route Handler   │
                    │  (WebSocket)     │
                    └────────┬──────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌───────▼────────┐
│   Deepgram     │  │      Groq       │  │    Cartesia    │
│   (STT)        │  │     (LLM)       │  │     (TTS)      │
└────────────────┘  └─────────────────┘  └────────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │   Supabase      │
                    │   (DB/Vector)   │
                    └──────────────────┘
```

### 3.2 データフロー

#### 3.2.1 音声入力フロー
```
マイク → Web Audio API → チャンク分割 (100-200ms)
  → Silero VAD (ローカル) → 発話検知
  → WebSocket → Next.js API → Deepgram (ストリーミング)
  → テキストチャンク → Groq (ストリーミング)
```

#### 3.2.2 音声出力フロー
```
Groq (トークンストリーム) → テキストチャンク
  → Cartesia (ストリーミング) → 音声チャンク
  → WebSocket → ブラウザ → AudioContext → スピーカー
```

### 3.3 ストリーミングパイプライン

**必須要件: フルストリーミング**
- ❌ 禁止: ユーザーの発話が完全に終わってから処理開始
- ✅ 必須: 音声チャンクをリアルタイムで処理

**パイプライン段階:**
1. **Audio Chunking**: マイク入力を100-200msのチャンクに分割
2. **VAD処理**: ローカルで発話区間を検出
3. **STTストリーミング**: Deepgramにチャンクを逐次送信
4. **LLMストリーミング**: Groqから最初のトークンが出た瞬間に処理開始
5. **TTSストリーミング**: テキストチャンクを逐次Cartesiaに送信
6. **音声再生**: 音声チャンクを逐次再生

---

## 4. コア機能要件

### 4.1 VAD (Voice Activity Detection) - ローカル実装

#### 4.1.1 要件
- **実装場所**: ブラウザ (Web Workers)
- **モデル**: Silero VAD v4
- **検知遅延**: 300ms以下の沈黙で発話終了を判定
- **処理遅延**: 10ms以下

#### 4.1.2 実装詳細
```typescript
// Web Worker内で実行
- ONNX RuntimeでSilero VADモデルをロード
- 音声チャンク (16kHz, 16bit, mono) をリアルタイムで処理
- 発話確率が閾値 (0.5) を超えたら「発話開始」
- 300ms連続で閾値以下なら「発話終了」をメインスレッドに通知
```

#### 4.1.3 設定パラメータ
- **発話開始閾値**: 0.5
- **発話終了閾値**: 0.3
- **沈黙継続時間**: 300ms
- **サンプリングレート**: 16kHz
- **チャンクサイズ**: 512サンプル (32ms)

### 4.2 インタラプト (割り込み) 機能

#### 4.2.1 要件
- **検知から停止まで**: 100ms以下
- **動作**: AIが話している最中にユーザーが話し始めたら、AIが即座に停止

#### 4.2.2 実装フロー
1. **VAD検知**: ユーザーの音声入力が検知される
2. **即座の停止**:
   - フロントエンド: `AudioContext.stop()` で再生中の音声を停止
   - サーバー側: GroqとCartesiaのストリーミングリクエストをキャンセル
3. **状態リセット**: 会話コンテキストをクリア
4. **新規処理開始**: ユーザーの新しい発話を処理開始

#### 4.2.3 実装コード例
```typescript
// フロントエンド
onUserSpeechDetected() {
  // 1. 音声再生を即座に停止
  audioContext.stop();
  currentAudioSource?.disconnect();
  
  // 2. サーバーにキャンセルリクエスト
  websocket.send(JSON.stringify({ type: 'interrupt' }));
  
  // 3. 状態リセット
  resetConversationState();
  
  // 4. 新しい発話処理開始
  startNewUtterance();
}
```

### 4.3 コンテキスト・マネジメント (記憶機能)

#### 4.3.1 要件
- **保存対象**: 会話履歴、ユーザー情報、会話の文脈
- **検索方式**: ベクトル検索 (セマンティック検索)
- **保持期間**: 設定可能 (デフォルト: 30日)
- **プロンプト注入**: 会話開始時に動的に注入

#### 4.3.2 データベーススキーマ

**会話履歴テーブル (`conversations`)**
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  title TEXT,
  metadata JSONB
);

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id),
  role TEXT CHECK (role IN ('user', 'assistant')),
  content TEXT,
  embedding vector(1536), -- OpenAI embedding dimensions
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX ON conversation_messages USING ivfflat (embedding vector_cosine_ops);
```

#### 4.3.3 プロンプト生成ロジック
```typescript
async function generateContextualPrompt(userId: string, currentMessage: string) {
  // 1. 最新の会話履歴を取得 (直近10件)
  const recentMessages = await getRecentMessages(userId, 10);
  
  // 2. セマンティック検索で関連する過去の会話を取得
  const relatedConversations = await semanticSearch(currentMessage, userId);
  
  // 3. プロンプトに動的に注入
  return `
あなたは親しみやすい日本語AIアシスタントです。

過去の会話の文脈:
${recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')}

関連する過去の会話:
${relatedConversations.map(c => c.content).join('\n')}

現在の会話:
ユーザー: ${currentMessage}
`;
}
```

### 4.4 ストリーミング処理

#### 4.4.1 STTストリーミング (Deepgram)
- **チャンク送信間隔**: 100-200ms
- **フォーマット**: PCM, 16kHz, 16bit, mono
- **エンドポイント**: Deepgram Streaming API
- **エラーハンドリング**: 自動再接続、リトライロジック

#### 4.4.2 LLMストリーミング (Groq)
- **ストリーミングモード**: Server-Sent Events (SSE)
- **最初のトークン待機**: 200ms以下
- **チャンク処理**: トークン単位で逐次処理
- **バッファリング**: 最小限 (1-2トークン)

#### 4.4.3 TTSストリーミング (Cartesia)
- **ストリーミングモード**: WebSocket
- **音声生成開始**: 最初のテキストチャンク受信から100ms以内
- **フォーマット**: PCM / Opus
- **再生方式**: チャンク単位で逐次再生

---

## 5. UI/UX要件

### 5.1 ハンズフリー操作

#### 5.1.1 基本動作
- **マイク**: 常時ON (ボタン不要)
- **VAD制御**: 自動で発話検知・終了検知
- **視覚的フィードバック**: 
  - 発話中: アニメーション表示
  - AI応答中: 波形アニメーション
  - 待機中: 静かな状態表示

#### 5.1.2 UIコンポーネント
- **音声波形ビジュアライザー**: Canvas APIでリアルタイム表示
- **会話履歴**: スクロール可能なチャットUI
- **設定パネル**: VAD感度、音声速度などの調整
- **エラー表示**: 接続エラー、APIエラーなどの通知

### 5.2 レスポンシブデザイン
- **デスクトップ**: フル機能
- **タブレット**: タッチ操作対応
- **モバイル**: 簡易モード

### 5.3 アクセシビリティ
- **キーボード操作**: 全機能をキーボードで操作可能
- **スクリーンリーダー**: ARIAラベル対応
- **色のコントラスト**: WCAG AA準拠

---

## 6. パフォーマンス要件

### 6.1 遅延目標

| 処理段階 | 目標遅延 | 最大許容遅延 |
|---------|---------|-------------|
| マイク入力 → VAD検知 | 50ms | 100ms |
| VAD検知 → Deepgram送信 | 10ms | 50ms |
| Deepgram → テキスト取得 | 100ms | 200ms |
| テキスト → Groq (TTFT) | 200ms | 500ms |
| Groq → Cartesia送信 | 10ms | 50ms |
| Cartesia → 音声生成開始 | 100ms | 200ms |
| 音声 → スピーカー再生 | 50ms | 100ms |
| **エンドツーエンド** | **500ms** | **1000ms** |

### 6.2 インタラプト遅延

| 処理 | 目標遅延 | 最大許容遅延 |
|------|---------|-------------|
| ユーザー発話検知 | 50ms | 100ms |
| 音声再生停止 | 10ms | 50ms |
| サーバーキャンセル | 50ms | 100ms |
| **合計** | **100ms** | **250ms** |

### 6.3 リソース使用量

| リソース | 目標値 | 最大許容値 |
|---------|--------|-----------|
| CPU使用率 | 20%以下 | 40%以下 |
| メモリ使用量 | 200MB以下 | 500MB以下 |
| ネットワーク帯域 | 50kbps以下 | 100kbps以下 |
| バッテリー消費 | 最小限 | 通常使用の1.2倍以下 |

---

## 7. セキュリティ要件

### 7.1 認証・認可
- **認証方式**: Supabase Auth (JWT)
- **セッション管理**: リフレッシュトークン
- **APIキー管理**: 環境変数、サーバー側のみ

### 7.2 データ保護
- **音声データ**: 暗号化転送 (WSS)
- **会話履歴**: ユーザー単位で分離
- **個人情報**: GDPR準拠
- **データ保持**: ユーザーが削除可能

### 7.3 APIセキュリティ
- **レート制限**: IP単位、ユーザー単位
- **CORS**: 適切な設定
- **入力検証**: すべての入力データを検証

---

## 8. エラーハンドリング

### 8.1 ネットワークエラー
- **自動再接続**: WebSocket切断時の自動再接続
- **リトライロジック**: 指数バックオフ
- **フォールバック**: 代替APIへの切り替え

### 8.2 APIエラー
- **Deepgramエラー**: エラーメッセージ表示、リトライ
- **Groqエラー**: フォールバックLLMへの切り替え
- **Cartesiaエラー**: 代替TTSへの切り替え

### 8.3 ブラウザ互換性
- **対応ブラウザ**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **機能検出**: Web Audio API、Web Workers、WebSocketの可用性確認
- **グレースフルデグラデーション**: 機能が使えない場合の代替手段

---

## 9. 開発フェーズ

### フェーズ1: 最速の「脳」を確保 (Week 1-2)

#### 目標
GroqのAPIキーを取得し、Next.jsからストリーミングで文字が出ることを確認する。

#### タスク
1. **Groqアカウント作成・APIキー取得**
2. **Next.jsプロジェクトセットアップ**
   - `npx create-next-app@latest --typescript --tailwind --app`
   - 依存関係のインストール
3. **Groq API統合**
   - API Route Handler作成
   - SSE (Server-Sent Events) でストリーミング実装
   - フロントエンドでストリーム受信・表示
4. **テスト**: 日本語プロンプトでストリーミング動作確認

#### 成果物
- Groqからストリーミングでテキストが表示されるNext.jsアプリ

### フェーズ2: 最速の「耳と口」を接続 (Week 3-4)

#### オプションA: オーケストレーター使用 (推奨・最短ルート)

**Vapi.ai または Retell AI を使用**

##### タスク
1. **Vapi/Retellアカウント作成**
2. **設定**:
   - STT: Deepgram (Nova-2)
   - LLM: Groq (Llama 3.1 70B)
   - TTS: Cartesia (Sonic-multilingual)
   - 言語: 日本語
3. **API統合**:
   - Vapi/RetellのWebSocket APIをNext.jsに統合
   - フロントエンドで音声入出力を実装
4. **テスト**: エンドツーエンドで会話動作確認

##### 成果物
- Vapi/Retell経由で動作する音声会話アプリ

#### オプションB: 直接統合 (カスタム実装)

##### タスク
1. **Deepgram統合**
   - WebSocket接続
   - 音声チャンク送信
   - テキストストリーム受信
2. **Cartesia統合**
   - WebSocket接続
   - テキストチャンク送信
   - 音声ストリーム受信
3. **パイプライン統合**
   - Deepgram → Groq → Cartesia のストリーミング接続
4. **テスト**: 各段階での動作確認

##### 成果物
- 直接API統合による音声会話アプリ

### フェーズ3: ハンズフリーUIの構築 (Week 5-6)

#### タスク
1. **VAD実装**
   - Silero VADモデルのダウンロード
   - ONNX Runtimeのセットアップ
   - Web WorkerでのVAD処理実装
   - 発話検知・終了検知の実装
2. **インタラプト機能**
   - ユーザー発話検知時の音声停止
   - サーバー側のストリーミングキャンセル
3. **UI改善**
   - マイク常時ON
   - 視覚的フィードバック (波形アニメーション)
   - 会話履歴表示
4. **テスト**: ハンズフリー操作の動作確認

#### 成果物
- ボタン不要のハンズフリー音声会話アプリ

### フェーズ4: コンテキスト・マネジメント (Week 7-8)

#### タスク
1. **Supabaseセットアップ**
   - プロジェクト作成
   - データベーススキーマ作成
   - pgvector拡張の有効化
2. **会話履歴保存**
   - メッセージの保存
   - ベクトル埋め込み生成・保存
3. **セマンティック検索**
   - 関連会話の検索
   - プロンプトへの動的注入
4. **認証実装**
   - Supabase Auth統合
   - ユーザー単位の会話管理
5. **テスト**: 会話の文脈保持確認

#### 成果物
- 会話履歴を記憶する音声会話アプリ

### フェーズ5: 最適化・デプロイ (Week 9-10)

#### タスク
1. **パフォーマンス最適化**
   - 遅延測定・改善
   - リソース使用量の最適化
   - バッファリング戦略の調整
2. **エラーハンドリング強化**
   - 自動再接続
   - フォールバック機能
   - エラーメッセージの改善
3. **デプロイ**
   - Vercel/Netlifyへのデプロイ
   - 環境変数の設定
   - ドメイン設定
4. **テスト**: 本番環境での動作確認

#### 成果物
- 本番環境で動作する完成版アプリ

---

## 10. 実装の詳細仕様

### 10.1 プロジェクト構造

```
frequently/
├── app/
│   ├── api/
│   │   ├── websocket/
│   │   │   └── route.ts          # WebSocket接続ハンドラー
│   │   ├── groq/
│   │   │   └── route.ts          # Groq API統合
│   │   └── deepgram/
│   │       └── route.ts          # Deepgram API統合
│   ├── components/
│   │   ├── AudioRecorder.tsx     # 音声録音コンポーネント
│   │   ├── AudioPlayer.tsx       # 音声再生コンポーネント
│   │   ├── Waveform.tsx          # 波形ビジュアライザー
│   │   ├── ConversationHistory.tsx # 会話履歴
│   │   └── Settings.tsx          # 設定パネル
│   ├── workers/
│   │   └── vad.worker.ts         # VAD Web Worker
│   ├── lib/
│   │   ├── groq.ts               # Groqクライアント
│   │   ├── deepgram.ts           # Deepgramクライアント
│   │   ├── cartesia.ts           # Cartesiaクライアント
│   │   ├── supabase.ts           # Supabaseクライアント
│   │   └── vad.ts                # VADユーティリティ
│   ├── hooks/
│   │   ├── useAudioRecorder.ts   # 音声録音フック
│   │   ├── useAudioPlayer.ts     # 音声再生フック
│   │   ├── useWebSocket.ts       # WebSocketフック
│   │   └── useConversation.ts    # 会話管理フック
│   ├── stores/
│   │   └── conversationStore.ts  # 会話状態管理
│   └── page.tsx                  # メインページ
├── public/
│   └── models/
│       └── silero_vad.onnx       # Silero VADモデル
├── .env.local                    # 環境変数
├── package.json
├── tsconfig.json
└── tailwind.config.js
```

### 10.2 環境変数

```bash
# Groq
GROQ_API_KEY=your_groq_api_key

# Deepgram
DEEPGRAM_API_KEY=your_deepgram_api_key

# Cartesia
CARTESIA_API_KEY=your_cartesia_api_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI (埋め込み生成用)
OPENAI_API_KEY=your_openai_api_key
```

### 10.3 主要な依存関係

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@supabase/supabase-js": "^2.38.0",
    "@supabase/auth-helpers-nextjs": "^0.8.0",
    "socket.io-client": "^4.5.0",
    "zustand": "^4.4.0",
    "onnxruntime-web": "^1.16.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "typescript": "^5.2.0",
    "tailwindcss": "^3.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

---

## 11. テスト要件

### 11.1 単体テスト
- VAD処理の正確性
- ストリーミング処理の各段階
- エラーハンドリング

### 11.2 統合テスト
- エンドツーエンドの会話フロー
- インタラプト機能
- 会話履歴の保存・検索

### 11.3 パフォーマンステスト
- 遅延測定 (各段階)
- リソース使用量測定
- 負荷テスト

### 11.4 ユーザビリティテスト
- ハンズフリー操作の自然さ
- エラー時の挙動
- 異なる環境での動作確認

---

## 12. ドキュメント要件

### 12.1 開発者向け
- API仕様書
- アーキテクチャ図
- セットアップガイド
- トラブルシューティングガイド

### 12.2 ユーザー向け
- 使い方ガイド
- FAQ
- プライバシーポリシー

---

## 13. 今後の拡張案

### 13.1 機能拡張
- **マルチモーダル**: 画像・動画の理解
- **感情認識**: 音声から感情を検出
- **多言語対応**: 自動言語検出・切り替え
- **カスタム音声**: ユーザー固有の音声合成

### 13.2 パフォーマンス改善
- **エッジデプロイ**: Edge Functionsの活用
- **CDN最適化**: 静的アセットの配信最適化
- **モデル最適化**: より軽量なモデルの採用

### 13.3 ビジネス機能
- **サブスクリプション**: 使用量に応じた課金
- **分析ダッシュボード**: 使用状況の可視化
- **API提供**: サードパーティ向けAPI

---

## 14. リスクと対策

### 14.1 技術的リスク

| リスク | 影響 | 対策 |
|--------|------|------|
| APIレート制限 | 高 | 複数APIキーのローテーション、キャッシュ戦略 |
| ネットワーク不安定 | 高 | 自動再接続、オフライン対応 |
| ブラウザ互換性 | 中 | 機能検出、グレースフルデグラデーション |
| コスト増加 | 中 | 使用量監視、最適化 |

### 14.2 ビジネスリスク

| リスク | 影響 | 対策 |
|--------|------|------|
| API提供終了 | 高 | 複数ベンダー対応、フォールバック機能 |
| プライバシー懸念 | 高 | データ暗号化、透明性の確保 |
| 競合の出現 | 中 | 差別化機能の強化 |

---

## 15. 成功指標 (KPI)

### 15.1 技術指標
- **TTFT**: 200ms以下を達成
- **エンドツーエンド遅延**: 500ms以下を達成
- **インタラプト遅延**: 100ms以下を達成
- **可用性**: 99.9%以上

### 15.2 ユーザー指標
- **会話の自然さ**: ユーザーアンケートで4.0/5.0以上
- **エラー率**: 1%以下
- **ユーザー継続率**: 週次で70%以上

---

## 16. 参考資料・リソース

### 16.1 APIドキュメント
- [Groq API Documentation](https://console.groq.com/docs)
- [Deepgram API Documentation](https://developers.deepgram.com/)
- [Cartesia API Documentation](https://docs.cartesia.ai/)
- [Supabase Documentation](https://supabase.com/docs)

### 16.2 技術リソース
- [Silero VAD Model](https://github.com/snakers4/silero-vad)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

### 16.3 オーケストレーター
- [Vapi.ai](https://www.vapi.ai/)
- [Retell AI](https://retellai.com/)

---

## 17. 用語集

- **TTFT (Time To First Token)**: LLMが最初のトークンを生成するまでの時間
- **VAD (Voice Activity Detection)**: 音声活動検出、発話区間の検出
- **STT (Speech-to-Text)**: 音声認識、音声をテキストに変換
- **TTS (Text-to-Speech)**: 音声合成、テキストを音声に変換
- **LLM (Large Language Model)**: 大規模言語モデル
- **チャンク**: データの小さな断片
- **ストリーミング**: データを逐次処理・送信する方式
- **インタラプト**: 割り込み、処理の中断

---

## 18. 変更履歴

| 日付 | バージョン | 変更内容 | 作成者 |
|------|-----------|---------|--------|
| 2025-01-XX | 1.0 | 初版作成 | - |

---

**この要件定義書は、爆速ハンズフリー音声AI会話システムの完全な仕様を定義しています。開発の各フェーズで参照し、実装の指針として活用してください。**

