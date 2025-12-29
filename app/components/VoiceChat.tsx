'use client';

import { useState, useRef, useEffect } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useVAD } from '../hooks/useVAD';
import {
  addMessageToHistory,
  getRecentMessages,
  clearConversationHistory,
  type ConversationMessage,
} from '../lib/conversation';
import { performanceMonitor } from '../lib/performance';

export default function VoiceChat() {
  const { isRecording, startRecording, stopRecording, audioBlob, error: recorderError } =
    useAudioRecorder();
  const { isPlaying, playAudio, stopAudio, error: playerError } =
    useAudioPlayer();
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Array<{
    type: 'user' | 'ai';
    text: string;
    timestamp: Date;
  }>>([]);

  // インタラプト用のリファレンス
  const abortControllerRef = useRef<AbortController | null>(null);
  const isProcessingRef = useRef(false);

  // VADコールバック
  const handleSpeechStart = () => {
    console.log('発話開始を検知');
    
    // AIが話している最中にユーザーが話し始めたら、AIを停止（インタラプト）
    if (isPlaying || isProcessingRef.current) {
      performanceMonitor.startTimer('interrupt');
      console.log('インタラプト: AIを停止');
      stopAudio();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setIsProcessing(false);
      isProcessingRef.current = false;
      setResponse('');
      
      setTimeout(() => {
        const interruptLatency = performanceMonitor.endTimer('interrupt');
        console.log(`インタラプト遅延: ${interruptLatency.toFixed(0)}ms`);
      }, 10);
    }

    // 録音開始
    if (!isRecording) {
      startRecording();
    }
  };

  const handleSpeechEnd = async () => {
    console.log('発話終了を検知');
    
    // 録音停止
    if (isRecording) {
      stopRecording();
      
      // 録音が完了するまで少し待つ
      setTimeout(async () => {
        await processAudio();
      }, 300);
    }
  };

  // VADフック
  const { isListening, isSpeaking, startListening, stopListening, error: vadError } = useVAD(
    handleSpeechStart,
    handleSpeechEnd,
    {
      silenceThreshold: 0.01,
      silenceDuration: 500, // 500msの沈黙で発話終了
      speechThreshold: 0.02, // 音量が2%を超えたら発話開始
    }
  );

  // コンポーネントマウント時に自動的にリスニング開始
  useEffect(() => {
    startListening();
    return () => {
      stopListening();
    };
  }, [startListening, stopListening]);

  const processAudio = async () => {
    if (isProcessingRef.current) {
      return; // 既に処理中の場合はスキップ
    }

    setIsProcessing(true);
    isProcessingRef.current = true;
    setError(null);
    setResponse('');

    // パフォーマンス測定を開始
    performanceMonitor.reset();
    performanceMonitor.startTimer('endToEnd');

    // AbortControllerを作成
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 録音された音声をSTTで処理
      let currentTranscript = '';

      if (audioBlob) {
        // デバッグ情報
        console.log('音声Blob情報:', {
          size: audioBlob.size,
          type: audioBlob.type,
        });

        // 音声ファイルが空でないか確認
        if (audioBlob.size === 0) {
          throw new Error('録音された音声が空です。マイクが正しく動作しているか確認してください。');
        }

        // 音声ファイルをSTT APIに送信
        performanceMonitor.startTimer('stt');
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        const sttResponse = await fetch('/api/stt', {
          method: 'POST',
          body: formData,
          signal: abortController.signal,
        });

        const sttData = await sttResponse.json();

        if (!sttResponse.ok) {
          let errorMessage = sttData.error || '音声認識に失敗しました';

          if (sttResponse.status === 500 && sttData.error) {
            errorMessage = sttData.error;
          } else if (sttResponse.status === 401) {
            errorMessage = 'Deepgram APIキーが無効です。.env.localファイルのDEEPGRAM_API_KEYを確認してください。';
          } else if (sttResponse.status === 400) {
            errorMessage = sttData.error || '音声ファイルが無効です。';
          }

          console.error('STT APIエラー:', {
            status: sttResponse.status,
            error: sttData,
          });

          throw new Error(errorMessage);
        }

        currentTranscript = sttData.transcript || '';

        if (!currentTranscript) {
          console.warn('転写結果が空です:', sttData);
          throw new Error(sttData.error || '音声からテキストを認識できませんでした。もう一度、はっきりと話してみてください。');
        }

        console.log('転写成功:', currentTranscript);
        const sttLatency = performanceMonitor.endTimer('stt');
        console.log(`STT遅延: ${sttLatency.toFixed(0)}ms`);
        setTranscript(currentTranscript);

        // ユーザーメッセージを会話履歴に保存
        addMessageToHistory('user', currentTranscript);

        // 会話履歴に追加（UI表示用）
        setConversationHistory((prev) => [
          ...prev,
          { type: 'user', text: currentTranscript, timestamp: new Date() },
        ]);
      } else {
        return; // audioBlobがない場合は処理を終了
      }

      if (!currentTranscript) {
        throw new Error('転写テキストが取得できませんでした');
      }

      // 最新の会話履歴を取得
      const conversationHistory = getRecentMessages(10);

      // LLM APIに送信（会話履歴を含める）
      performanceMonitor.startTimer('llm');
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: currentTranscript,
          conversationHistory: conversationHistory,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error('音声処理に失敗しました');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('ストリームリーダーを取得できませんでした');
      }

      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 中断チェック
        if (abortController.signal.aborted) {
          reader.cancel();
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setIsProcessing(false);
              isProcessingRef.current = false;
              return;
            }

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'error') {
                throw new Error(parsed.error);
              }

              if (parsed.type === 'text' && parsed.content) {
                // 最初のトークンを受信したらTTFTを記録
                if (fullResponse === '' && parsed.content) {
                  const ttft = performanceMonitor.endTimer('llm');
                  console.log(`LLM TTFT: ${ttft.toFixed(0)}ms`);
                }
                fullResponse += parsed.content;
                setResponse(fullResponse);
              }

              if (parsed.type === 'done') {
                setIsProcessing(false);
                isProcessingRef.current = false;

                // AI応答を会話履歴に保存
                if (fullResponse) {
                  addMessageToHistory('assistant', fullResponse);
                  setConversationHistory((prev) => [
                    ...prev,
                    { type: 'ai', text: fullResponse, timestamp: new Date() },
                  ]);
                }

                // TTSで音声再生
                if (parsed.text) {
                  await playTTS(parsed.text);
                }
              }
            } catch (parseError) {
              console.error('JSON解析エラー:', parseError);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('処理が中断されました');
        return;
      }
      setError(err instanceof Error ? err.message : '処理中にエラーが発生しました');
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const playTTS = async (text: string) => {
    try {
      performanceMonitor.startTimer('tts');
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = errorData.error || '音声合成に失敗しました';

        if (response.status === 401) {
          errorMessage = 'ElevenLabs APIキーが無効です。.env.localファイルのELEVENLABS_API_KEYを確認してください。';
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }

        throw new Error(errorMessage);
      }

      const audioBuffer = await response.arrayBuffer();

      if (audioBuffer.byteLength === 0) {
        throw new Error('音声データが空です');
      }

      const ttsLatency = performanceMonitor.endTimer('tts');
      console.log(`TTS遅延: ${ttsLatency.toFixed(0)}ms`);

      await playAudio(audioBuffer);

      // エンドツーエンド遅延を記録
      const endToEndLatency = performanceMonitor.endTimer('endToEnd');
      console.log(`エンドツーエンド遅延: ${endToEndLatency.toFixed(0)}ms`);
      performanceMonitor.logMetrics();
    } catch (err) {
      console.error('TTS再生エラー:', err);
      // TTSエラーは警告のみ（テキスト表示は継続）
    }
  };

  return (
    <div 
      className="min-h-screen p-8 relative"
      style={{
        backgroundImage: 'url(/background.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* オーバーレイ（テキストの可読性を確保） */}
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40"></div>
      
      <div className="max-w-4xl mx-auto relative z-10">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          Frequently - ハンズフリーモード
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">
          ボタンを押さずに、自然に話しかけてください
        </p>

        {/* エラー表示 */}
        {(error || recorderError || playerError || vadError) && (
          <div className="bg-red-50/90 dark:bg-red-900/80 backdrop-blur-sm border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <p className="text-red-800 dark:text-red-300 font-semibold mb-2">
                  エラーが発生しました
                </p>
                <p className="text-red-700 dark:text-red-400">
                  {error || recorderError || playerError || vadError}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ステータス表示 */}
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-center gap-6">
            {/* リスニング状態 */}
            <div className="flex flex-col items-center">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                  isListening
                    ? 'bg-green-500 animate-pulse'
                    : 'bg-gray-400'
                }`}
              >
                <span className="text-2xl">🎤</span>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {isListening ? 'リスニング中' : '停止中'}
              </p>
            </div>

            {/* 発話状態 */}
            <div className="flex flex-col items-center">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                  isSpeaking
                    ? 'bg-blue-500 animate-pulse'
                    : isRecording
                    ? 'bg-red-500 animate-pulse'
                    : 'bg-gray-300'
                }`}
              >
                <span className="text-2xl">
                  {isSpeaking ? '🗣️' : isRecording ? '●' : '👤'}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {isSpeaking
                  ? '発話中'
                  : isRecording
                  ? '録音中'
                  : '待機中'}
              </p>
            </div>

            {/* AI応答状態 */}
            <div className="flex flex-col items-center">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                  isPlaying
                    ? 'bg-purple-500 animate-pulse'
                    : isProcessing
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-gray-300'
                }`}
              >
                <span className="text-2xl">
                  {isPlaying ? '🔊' : isProcessing ? '🤔' : '🤖'}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {isPlaying
                  ? 'AI応答中'
                  : isProcessing
                  ? '処理中'
                  : '待機中'}
              </p>
            </div>
          </div>

          {/* 操作説明 */}
          <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>💡 話しかけるだけで自動的に会話が始まります</p>
            <p className="mt-1">💡 AIが話している最中に話し始めると、AIが停止します（インタラプト）</p>
            <p className="mt-1">💡 会話履歴は自動的に保存され、AIが文脈を理解します</p>
          </div>

          {/* 会話履歴クリアボタン */}
          <div className="mt-4 text-center">
            <button
              onClick={() => {
                if (confirm('会話履歴をクリアしますか？')) {
                  clearConversationHistory();
                  setConversationHistory([]);
                  setTranscript('');
                  setResponse('');
                }
              }}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              🗑️ 会話履歴をクリア
            </button>
          </div>
        </div>

        {/* 会話履歴 */}
        {conversationHistory.length > 0 && (
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg p-6 mb-6 max-h-96 overflow-y-auto">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              会話履歴
            </h2>
            <div className="space-y-4">
              {conversationHistory.map((item, index) => (
                <div
                  key={index}
                  className={`flex ${
                    item.type === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      item.type === 'user'
                        ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    <p className="text-sm font-semibold mb-1">
                      {item.type === 'user' ? 'あなた' : 'AI'}
                    </p>
                    <p className="whitespace-pre-wrap">{item.text}</p>
                    <p className="text-xs mt-1 opacity-70">
                      {item.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 現在の転写と応答 */}
        {transcript && (
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              あなたの発話
            </h2>
            <p className="text-gray-800 dark:text-gray-200">{transcript}</p>
          </div>
        )}

        {response && (
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              AI応答
            </h2>
            <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {response}
              {isProcessing && (
                <span className="inline-block w-2 h-5 bg-indigo-600 animate-pulse ml-1" />
              )}
            </p>
          </div>
        )}

        {/* ステータス情報 */}
        <div className="mt-6 text-sm text-gray-500 dark:text-gray-400 text-center space-y-1">
          <p>✅ 音声認識（STT）: Deepgram Nova-2 - 動作中</p>
          <p>✅ LLM（Groq）: Llama 3.1 - 動作中</p>
          <p>✅ 音声合成（TTS）: ElevenLabs Turbo - 動作中</p>
          <p>✅ VAD: 音量ベース - 動作中</p>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            ハンズフリーモードで動作中。話しかけるだけで会話が始まります。
          </p>
        </div>
      </div>
    </div>
  );
}
