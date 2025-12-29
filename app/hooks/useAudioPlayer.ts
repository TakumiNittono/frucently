'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  playAudio: (audioData: ArrayBuffer | Blob | string) => Promise<void>;
  stopAudio: () => void;
  error: string | null;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    // AudioContextの初期化
    audioContextRef.current = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    return () => {
      // クリーンアップ
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const playAudio = useCallback(
    async (audioData: ArrayBuffer | Blob | string) => {
      try {
        setError(null);

        if (!audioContextRef.current) {
          throw new Error('AudioContextが初期化されていません');
        }

        // 既存の音声を停止
        stopAudio();

        let arrayBuffer: ArrayBuffer;

        if (typeof audioData === 'string') {
          // URLの場合
          const response = await fetch(audioData);
          arrayBuffer = await response.arrayBuffer();
        } else if (audioData instanceof Blob) {
          // Blobの場合
          arrayBuffer = await audioData.arrayBuffer();
        } else {
          // ArrayBufferの場合
          arrayBuffer = audioData;
        }

        // オーディオデータをデコード
        const audioBuffer = await audioContextRef.current.decodeAudioData(
          arrayBuffer
        );

        // 音声ソースを作成
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);

        source.onended = () => {
          setIsPlaying(false);
        };

        sourceNodeRef.current = source;
        setIsPlaying(true);

        // 再生開始
        source.start(0);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : '音声再生に失敗しました';
        setError(errorMessage);
        console.error('音声再生エラー:', err);
        setIsPlaying(false);
      }
    },
    []
  );

  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (err) {
        // 既に停止している場合はエラーを無視
      }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  return {
    isPlaying,
    playAudio,
    stopAudio,
    error,
  };
}

