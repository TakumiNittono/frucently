'use client';

import { useState, useRef, useEffect } from 'react';
// localStorageは使用しない（リフレッシュで消えるように）

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 会話履歴は読み込まない（リフレッシュで消えるように）

  // 初回マウント時にAIから最初のメッセージを送信
  useEffect(() => {
    const initialMessage: Message = {
      role: 'assistant',
      content: 'お前やる気あんの？',
      timestamp: new Date(),
    };
    setMessages([initialMessage]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // メッセージが更新されたらスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    // ユーザーメッセージを追加（localStorageには保存しない）
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setError(null);

    try {
      // 最新の会話履歴を取得（メモリ内のメッセージから）
      const conversationHistory = messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: input.trim(),
          conversationHistory: conversationHistory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'リクエストに失敗しました');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('ストリームリーダーを取得できませんでした');
      }

      let fullResponse = '';
      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

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
              // localStorageには保存しない（リフレッシュで消えるように）
              return;
            }

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'error') {
                throw new Error(parsed.error);
              }

              if (parsed.type === 'text' && parsed.content) {
                fullResponse += parsed.content;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    ...assistantMessage,
                    content: fullResponse,
                  };
                  return newMessages;
                });
              }

              if (parsed.type === 'done' && parsed.text) {
                fullResponse = parsed.text;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    ...assistantMessage,
                    content: fullResponse,
                  };
                  return newMessages;
                });
                setIsStreaming(false);
                // localStorageには保存しない（リフレッシュで消えるように）
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

  const handleClear = () => {
    if (confirm('会話履歴をクリアしますか？')) {
      setMessages([]);
      setError(null);
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800">
      {/* オーバーレイ */}
      <div className="absolute inset-0 overflow-y-auto">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl min-h-screen">
          {/* ヘッダー */}
          <div className="text-center mb-4 sm:mb-8">
            <div className="flex items-center justify-center gap-2 sm:gap-4 mb-2 sm:mb-4">
              <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg overflow-hidden ring-2 sm:ring-4 ring-white/50">
                <img
                  src="/background.jpg"
                  alt="AI Icon"
                  className="w-full h-full object-cover object-center object-[center_60%]"
                />
              </div>
              <h1 className="text-2xl sm:text-4xl font-bold text-white drop-shadow-lg">Frequently</h1>
            </div>
            <p className="text-white/90 text-xs sm:text-sm drop-shadow">チャットボット</p>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50/90 dark:bg-red-900/80 backdrop-blur-sm border border-red-200 dark:border-red-800 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
              <div className="flex items-start gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-red-800 dark:text-red-300 font-semibold mb-1 sm:mb-2 text-sm sm:text-base">
                    エラーが発生しました
                  </p>
                  <p className="text-red-700 dark:text-red-400 text-xs sm:text-sm break-words">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* チャット履歴 */}
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg p-3 sm:p-6 mb-4 sm:mb-6 max-h-[calc(100vh-280px)] sm:max-h-[60vh] overflow-y-auto">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8 sm:py-12">
                <p className="text-base sm:text-lg mb-2">👋 こんにちは！</p>
                <p className="text-sm sm:text-base">メッセージを入力して会話を始めましょう</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[80%] rounded-lg p-3 sm:p-4 ${
                        message.role === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm sm:text-base break-words">{message.content}</p>
                      {isStreaming && index === messages.length - 1 && (
                        <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 入力フォーム */}
          <form onSubmit={handleSubmit} className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg p-3 sm:p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="メッセージを入力..."
                disabled={isStreaming}
                className="flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 text-base"
                style={{ fontSize: '16px' }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-semibold text-sm sm:text-base whitespace-nowrap"
              >
                {isStreaming ? '送信中...' : '送信'}
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-lg sm:text-xl"
                >
                  🗑️
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

