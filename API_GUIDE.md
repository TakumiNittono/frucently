# API実装ガイド

このドキュメントでは、Next.js App RouterでのAPI実装方法と、Deepgram/Cartesia APIの使い方を説明します。

---

## 1. Next.js API Route Handler の基本構造

Next.js 14のApp Routerでは、`app/api/`ディレクトリにAPI Route Handlerを作成します。

### 基本的な構造

```typescript
// app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // 処理
    return NextResponse.json({ message: '成功' });
  } catch (error) {
    return NextResponse.json(
      { error: 'エラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // 処理
    return NextResponse.json({ result: '処理完了' });
  } catch (error) {
    return NextResponse.json(
      { error: 'エラーが発生しました' },
      { status: 500 }
    );
  }
}
```

### HTTPメソッドの対応

- `GET` → `export async function GET()`
- `POST` → `export async function POST()`
- `PUT` → `export async function PUT()`
- `DELETE` → `export async function DELETE()`
- `PATCH` → `export async function PATCH()`

---

## 2. Deepgram API (STT: 音声認識) の実装

### 2.1 SDKのインストール

```bash
npm install @deepgram/sdk
```

### 2.2 基本的な使い方

```typescript
import { createClient } from '@deepgram/sdk';

const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');
```

### 2.3 音声ファイルの転写（prerecorded）

```typescript
// app/api/stt/route.ts
import { NextRequest } from 'next/server';
import { createClient } from '@deepgram/sdk';

const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    // FormDataから音声ファイルを取得
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: '音声ファイルが提供されていません' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ファイルをバッファに変換
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Deepgramで転写
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: 'nova-2',           // モデル名
        language: 'ja',           // 言語（日本語）
        punctuate: true,          // 句読点を追加
        interim_results: false,   // 中間結果を返さない
        // その他のオプション:
        // diarize: true,         // 話者分離
        // smart_format: true,    // スマートフォーマット
        // paragraphs: true,      // 段落を返す
      }
    );

    if (error) {
      console.error('Deepgram エラー:', error);
      return new Response(
        JSON.stringify({ error: '音声認識に失敗しました' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 転写結果を取得
    const transcript =
      result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    return new Response(
      JSON.stringify({ transcript }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('STT処理エラー:', error);
    return new Response(
      JSON.stringify({ error: '音声認識の処理中にエラーが発生しました' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### 2.4 ストリーミング転写（リアルタイム）

```typescript
// WebSocketを使用したリアルタイム転写
import { createClient } from '@deepgram/sdk';

const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');

// WebSocket接続を確立
const connection = deepgram.listen.live({
  model: 'nova-2',
  language: 'ja',
  punctuate: true,
  interim_results: true, // 中間結果を取得
});

// 音声データを送信
connection.on('open', () => {
  // 音声チャンクを送信
  connection.send(audioChunk);
});

// 転写結果を受信
connection.on('transcript', (data) => {
  const transcript = data.channel.alternatives[0].transcript;
  console.log('転写:', transcript);
});
```

### 2.5 利用可能なモデル

- `nova-2` - 最新の高精度モデル（推奨）
- `nova` - 前世代の高精度モデル
- `base` - 基本モデル（高速）
- `whisper-large` - Whisperベースのモデル

### 2.6 エラーハンドリング

```typescript
const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
  buffer,
  options
);

if (error) {
  // エラーの種類に応じた処理
  if (error.status === 401) {
    // APIキーが無効
  } else if (error.status === 429) {
    // レート制限
  } else {
    // その他のエラー
  }
}
```

---

## 3. Cartesia API (TTS: 音声合成) の実装

### 3.1 APIエンドポイント

CartesiaはREST APIを提供しています。SDKは現在開発中なので、直接HTTPリクエストを使用します。

### 3.2 基本的な使い方

```typescript
// app/api/tts/route.ts
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'テキストが提供されていません' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Cartesia APIにリクエスト
    const response = await fetch('https://api.cartesia.ai/v1/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CARTESIA_API_KEY || '',
      },
      body: JSON.stringify({
        text: text,
        model: 'sonic-multilingual',  // モデル名
        voice_id: 'default',          // 音声ID
        output_format: 'pcm_16000',    // 出力フォーマット
        // その他のオプション:
        // speed: 1.0,                // 速度
        // stability: 0.5,            // 安定性
        // similarity_boost: 0.75,     // 類似度ブースト
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Cartesia エラー:', errorData);
      return new Response(
        JSON.stringify({ error: '音声合成に失敗しました' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 音声データを取得
    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/pcm',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('TTS処理エラー:', error);
    return new Response(
      JSON.stringify({ error: '音声合成の処理中にエラーが発生しました' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### 3.3 利用可能なパラメータ

```typescript
{
  text: string,              // 必須: 合成するテキスト
  model: string,             // 必須: モデル名（例: 'sonic-multilingual'）
  voice_id: string,          // 必須: 音声ID
  output_format: string,     // 必須: 出力フォーマット
  speed?: number,            // オプション: 速度（0.5-2.0）
  stability?: number,        // オプション: 安定性（0.0-1.0）
  similarity_boost?: number, // オプション: 類似度ブースト（0.0-1.0）
}
```

### 3.4 出力フォーマット

- `pcm_16000` - PCM 16kHz（推奨）
- `pcm_24000` - PCM 24kHz
- `mp3_44100` - MP3 44.1kHz
- `opus_48000` - Opus 48kHz

---

## 4. Groq API (LLM) の実装

### 4.1 SDKのインストール

```bash
npm install groq-sdk
```

### 4.2 基本的な使い方

```typescript
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});
```

### 4.3 ストリーミング応答

```typescript
// app/api/groq/route.ts
import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    // ストリーミングレスポンスを作成
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const completion = await groq.chat.completions.create({
            messages: [
              {
                role: 'system',
                content: 'あなたは親しみやすい日本語AIアシスタントです。',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            model: 'llama-3.1-8b-instant',
            stream: true,              // ストリーミングを有効化
            temperature: 0.7,
            max_tokens: 512,
          });

          const encoder = new TextEncoder();

          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              // SSE形式で送信
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
              );
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Groq API エラー:', error);
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: 'エラーが発生しました' })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'リクエストの処理中にエラーが発生しました' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

---

## 5. エラーハンドリングのベストプラクティス

### 5.1 統一されたエラーレスポンス

```typescript
interface ErrorResponse {
  error: string;
  code?: string;
  details?: any;
}

function createErrorResponse(
  error: string,
  status: number = 500,
  code?: string,
  details?: any
): Response {
  const response: ErrorResponse = { error };
  if (code) response.code = code;
  if (details) response.details = details;

  return new Response(JSON.stringify(response), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 5.2 エラーの種類に応じた処理

```typescript
try {
  // API呼び出し
} catch (error: any) {
  if (error?.status === 401) {
    return createErrorResponse('認証に失敗しました', 401, 'AUTH_ERROR');
  } else if (error?.status === 429) {
    return createErrorResponse('レート制限に達しました', 429, 'RATE_LIMIT');
  } else if (error?.status === 400) {
    return createErrorResponse('無効なリクエストです', 400, 'BAD_REQUEST');
  } else {
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
```

---

## 6. 環境変数の管理

### 6.1 `.env.local` ファイル

```env
# Groq API Key
GROQ_API_KEY=your_groq_api_key_here

# Deepgram API Key
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Cartesia API Key
CARTESIA_API_KEY=your_cartesia_api_key_here

# オプション
GROQ_MODEL=llama-3.1-8b-instant
```

### 6.2 環境変数の読み込み

```typescript
// サーバーサイドでのみアクセス可能
const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error('GROQ_API_KEYが設定されていません');
}
```

---

## 7. フロントエンドからのAPI呼び出し

### 7.1 FormDataを使用したファイル送信

```typescript
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');

const response = await fetch('/api/stt', {
  method: 'POST',
  body: formData,
});

const data = await response.json();
console.log('転写結果:', data.transcript);
```

### 7.2 JSONを使用したデータ送信

```typescript
const response = await fetch('/api/tts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ text: 'こんにちは' }),
});

const audioBuffer = await response.arrayBuffer();
```

### 7.3 ストリーミングレスポンスの処理

```typescript
const response = await fetch('/api/groq', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ prompt: 'こんにちは' }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') break;

      const parsed = JSON.parse(data);
      console.log('受信:', parsed.content);
    }
  }
}
```

---

## 8. よくある問題と解決方法

### 8.1 CORSエラー

Next.jsのAPI Route Handlerは自動的にCORSを処理しますが、外部APIを呼び出す場合は注意が必要です。

```typescript
// サーバーサイドでプロキシする
const response = await fetch('https://external-api.com/endpoint', {
  headers: {
    'Authorization': `Bearer ${process.env.API_KEY}`,
  },
});
```

### 8.2 タイムアウトエラー

長時間かかる処理の場合は、タイムアウトを設定します。

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒

try {
  const response = await fetch(url, {
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
} catch (error) {
  if (error.name === 'AbortError') {
    // タイムアウト処理
  }
}
```

### 8.3 メモリ不足

大きなファイルを処理する場合は、ストリーミングを使用します。

```typescript
// ファイルをチャンクに分割して処理
const chunkSize = 1024 * 1024; // 1MB
for (let i = 0; i < file.size; i += chunkSize) {
  const chunk = file.slice(i, i + chunkSize);
  // チャンクを処理
}
```

---

## 9. 参考リンク

- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Deepgram Documentation](https://developers.deepgram.com/)
- [Cartesia Documentation](https://docs.cartesia.ai/)
- [Groq Documentation](https://console.groq.com/docs)

---

このガイドを参考に、APIの実装を進めてください！

