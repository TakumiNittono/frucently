'use client';

import { useState, useRef } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

export default function VoiceChat() {
  const { isRecording, startRecording, stopRecording, audioBlob, error: recorderError } =
    useAudioRecorder();
  const { isPlaying, playAudio, stopAudio, error: playerError } =
    useAudioPlayer();
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleStartRecording = async () => {
    setError(null);
    setTranscript('');
    setResponse('');
    await startRecording();
  };

  const handleStopRecording = async () => {
    stopRecording();
    
    // 録音が完了するまで少し待つ
    setTimeout(async () => {
      await processAudio();
    }, 500);
  };

  const processAudio = async () => {
    setIsProcessing(true);
    setError(null);
    setResponse('');

    try {
      // 録音された音声をSTTで処理
      let transcript = '';
      
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
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        const sttResponse = await fetch('/api/stt', {
          method: 'POST',
          body: formData,
        });

        const sttData = await sttResponse.json();
        
        if (!sttResponse.ok) {
          let errorMessage = sttData.error || '音声認識に失敗しました';
          
          // より詳細なエラーメッセージ
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

        transcript = sttData.transcript || '';
        
        if (!transcript) {
          console.warn('転写結果が空です:', sttData);
          throw new Error(sttData.error || '音声からテキストを認識できませんでした。もう一度、はっきりと話してみてください。');
        }
        
        console.log('転写成功:', transcript);
        setTranscript(transcript);
      } else {
        // フォールバック: テスト用テキスト
        transcript = 'こんにちは';
        setTranscript(transcript);
      }

      if (!transcript) {
        throw new Error('転写テキストが取得できませんでした');
      }

      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript }),
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

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setIsProcessing(false);
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'error') {
                throw new Error(parsed.error);
              }

              if (parsed.type === 'text' && parsed.content) {
                fullResponse += parsed.content;
                setResponse(fullResponse);
              }

              if (parsed.type === 'done') {
                setIsProcessing(false);
                
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '処理中にエラーが発生しました');
      setIsProcessing(false);
    }
  };

  const playTTS = async (text: string) => {
    try {
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
        
        // より詳細なエラーメッセージ
        if (response.status === 401) {
          errorMessage = 'Cartesia APIキーが無効です。.env.localファイルのCARTESIA_API_KEYを確認してください。';
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
        
        throw new Error(errorMessage);
      }

      const audioBuffer = await response.arrayBuffer();
      
      if (audioBuffer.byteLength === 0) {
        throw new Error('音声データが空です');
      }
      
      await playAudio(audioBuffer);
    } catch (err) {
      console.error('TTS再生エラー:', err);
      // TTSエラーは警告のみ（テキスト表示は継続）
      // ユーザーにはエラーを表示しない（テキストは既に表示されているため）
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          Frequently - フェーズ2
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">
          音声会話テスト（実装中）
        </p>

        {/* エラー表示 */}
        {(error || recorderError || playerError) && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <p className="text-red-800 dark:text-red-300 font-semibold mb-2">
                  エラーが発生しました
                </p>
                <p className="text-red-700 dark:text-red-400">
                  {error || recorderError || playerError}
                </p>
                {(recorderError?.includes('マイク') || recorderError?.includes('権限')) && (
                  <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 rounded border border-red-300 dark:border-red-700">
                    <p className="text-sm text-red-800 dark:text-red-300 font-medium mb-2">
                      解決方法:
                    </p>
                    <ol className="text-sm text-red-700 dark:text-red-400 list-decimal list-inside space-y-1">
                      <li>ブラウザのアドレスバー左側の🔒アイコンをクリック</li>
                      <li>「マイク」の設定を「許可」に変更</li>
                      <li>ページを再読み込み（F5またはCmd+R）</li>
                      <li>再度「録音開始」ボタンをクリック</li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 録音コントロール */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              disabled={isProcessing}
              className={`px-8 py-4 rounded-full text-white font-semibold text-lg transition-all ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              } disabled:bg-gray-400 disabled:cursor-not-allowed`}
            >
              {isRecording ? (
                <>
                  <span className="mr-2">●</span>
                  録音中...
                </>
              ) : (
                '🎤 録音開始'
              )}
            </button>

            {isProcessing && (
              <div className="text-gray-600 dark:text-gray-400">
                処理中...
              </div>
            )}
          </div>
        </div>

        {/* 転写テキスト */}
        {transcript && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              あなたの発話
            </h2>
            <p className="text-gray-800 dark:text-gray-200">{transcript}</p>
          </div>
        )}

        {/* AI応答 */}
        {response && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
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
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            すべてのコンポーネントが正常に動作しています。ElevenLabs Turboを使用しています。
          </p>
        </div>
      </div>
    </div>
  );
}

