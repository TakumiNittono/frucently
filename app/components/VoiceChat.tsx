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

  // クリーンアップ（コンポーネントアンマウント時）
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

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

        // ユーザーメッセージを会話履歴に保存（内部保存のみ）
        addMessageToHistory('user', currentTranscript);
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

                // AI応答を会話履歴に保存（内部保存のみ）
                if (fullResponse) {
                  addMessageToHistory('assistant', fullResponse);
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
        <h1 className="text-3xl font-bold text-white mb-6 text-center">
          Frequently
        </h1>

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

        {/* コントロールボタン */}
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg p-6 mb-6 text-center">
          {!isListening ? (
            <button
              onClick={async () => {
                setError(null);
                await startListening();
              }}
              disabled={!!(error || recorderError || playerError || vadError)}
              className="px-12 py-6 rounded-full text-white font-semibold text-xl transition-all bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              🎤 会話を開始
            </button>
          ) : (
            <button
              onClick={() => {
                stopListening();
                stopAudio();
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                }
                setIsProcessing(false);
                isProcessingRef.current = false;
              }}
              className="px-12 py-6 rounded-full text-white font-semibold text-xl transition-all bg-red-600 hover:bg-red-700 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              ⏹️ 停止
            </button>
          )}
          
          {isListening && (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              {isSpeaking ? '🗣️ 発話中' : isRecording ? '● 録音中' : isProcessing ? '🤔 処理中' : isPlaying ? '🔊 AI応答中' : '🎤 リスニング中'}
            </p>
          )}
        </div>


        {/* 会話表示 */}
        {transcript && (
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg p-6 mb-4">
            <p className="text-gray-800 dark:text-gray-200">{transcript}</p>
          </div>
        )}

        {response && (
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
            <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {response}
              {isProcessing && (
                <span className="inline-block w-2 h-5 bg-indigo-600 animate-pulse ml-1" />
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
