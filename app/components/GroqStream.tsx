'use client';

import { useState, useRef, useEffect } from 'react';

export default function GroqStream() {
  const [prompt, setPrompt] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ttft, setTtft] = useState<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isStreaming) return;

    setStreamingText('');
    setError(null);
    setIsStreaming(true);
    setTtft(null);
    startTimeRef.current = Date.now();

    try {
      const response = await fetch('/api/groq', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'リクエストに失敗しました');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let firstTokenReceived = false;

      if (!reader) {
        throw new Error('ストリームリーダーを取得できませんでした');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setIsStreaming(false);
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.error) {
                throw new Error(parsed.error);
              }

              if (parsed.content) {
                // TTFT (Time To First Token) の測定
                if (!firstTokenReceived && startTimeRef.current) {
                  const elapsed = Date.now() - startTimeRef.current;
                  setTtft(elapsed);
                  firstTokenReceived = true;
                }

                setStreamingText((prev) => prev + parsed.content);
              }
            } catch (parseError) {
              console.error('JSON解析エラー:', parseError);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
      setIsStreaming(false);
    }
  };

  const handleReset = () => {
    setStreamingText('');
    setPrompt('');
    setError(null);
    setIsStreaming(false);
    setTtft(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          Frequently - フェーズ1
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">
          Groq API ストリーミングテスト
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="prompt"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                プロンプト (日本語)
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例: こんにちは、今日の天気について教えてください"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                rows={3}
                disabled={isStreaming}
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={!prompt.trim() || isStreaming}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isStreaming ? 'ストリーミング中...' : '送信'}
              </button>

              {(streamingText || error) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  リセット
                </button>
              )}
            </div>
          </form>
        </div>

        {ttft !== null && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-800 dark:text-green-300">
              <span className="font-semibold">TTFT (Time To First Token):</span>{' '}
              {ttft}ms
              {ttft <= 200 && (
                <span className="ml-2 text-green-600 dark:text-green-400">✓ 目標達成 (200ms以下)</span>
              )}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-800 dark:text-red-300 font-semibold mb-2">エラーが発生しました</p>
            <p className="text-red-700 dark:text-red-400">{error}</p>
            {error.includes('APIキー') && (
              <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 rounded border border-red-300 dark:border-red-700">
                <p className="text-sm text-red-800 dark:text-red-300 font-medium mb-2">設定手順:</p>
                <ol className="text-sm text-red-700 dark:text-red-400 list-decimal list-inside space-y-1">
                  <li><a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer" className="underline">Groq Console</a>でAPIキーを取得</li>
                  <li>プロジェクトルートの<code className="bg-red-200 dark:bg-red-800 px-1 rounded">.env.local</code>ファイルを開く</li>
                  <li><code className="bg-red-200 dark:bg-red-800 px-1 rounded">GROQ_API_KEY=your_api_key_here</code>を設定</li>
                  <li>開発サーバーを再起動（<code className="bg-red-200 dark:bg-red-800 px-1 rounded">npm run dev</code>）</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {streamingText && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              AI応答
            </h2>
            <div className="prose dark:prose-invert max-w-none">
              <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {streamingText}
                {isStreaming && (
                  <span className="inline-block w-2 h-5 bg-indigo-600 animate-pulse ml-1" />
                )}
              </p>
            </div>
          </div>
        )}

        {!streamingText && !error && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-gray-500 dark:text-gray-400 text-center">
              プロンプトを入力して送信してください
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

