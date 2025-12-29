'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVADReturn {
  isListening: boolean;
  isSpeaking: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
  error: string | null;
}

/**
 * シンプルなVAD (Voice Activity Detection) フック
 * 音量レベルを監視して発話を検知
 */
export function useVAD(
  onSpeechStart: () => void,
  onSpeechEnd: () => void,
  options: {
    silenceThreshold?: number; // 沈黙と判定する音量閾値 (0-1)
    silenceDuration?: number; // 沈黙継続時間 (ms)
    speechThreshold?: number; // 発話と判定する音量閾値 (0-1)
  } = {}
): UseVADReturn {
  const {
    silenceThreshold = 0.01,
    silenceDuration = 500, // 500msの沈黙で発話終了
    speechThreshold = 0.02, // 音量が2%を超えたら発話開始
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);

  const checkAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // 平均音量を計算
    const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
    const normalizedVolume = average / 255; // 0-1に正規化

    const now = Date.now();

    if (normalizedVolume > speechThreshold) {
      // 発話が検知された
      if (!isSpeakingRef.current) {
        isSpeakingRef.current = true;
        setIsSpeaking(true);
        silenceStartRef.current = null;
        onSpeechStart();
      }
    } else if (normalizedVolume < silenceThreshold) {
      // 沈黙が検知された
      if (isSpeakingRef.current) {
        if (silenceStartRef.current === null) {
          silenceStartRef.current = now;
        } else if (now - silenceStartRef.current > silenceDuration) {
          // 沈黙が継続したので発話終了
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          silenceStartRef.current = null;
          onSpeechEnd();
        }
      }
    } else {
      // 中間レベル - 沈黙タイマーをリセット
      silenceStartRef.current = null;
    }

    if (isListening) {
      animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
    }
  }, [speechThreshold, silenceThreshold, silenceDuration, onSpeechStart, onSpeechEnd, isListening]);

  const startListening = useCallback(async () => {
    try {
      setError(null);

      // 既存のストリームがあれば停止
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // AudioContextを作成
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      // AnalyserNodeを作成
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      // マイク入力をAnalyserNodeに接続
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      silenceStartRef.current = null;

      // 音量監視を開始
      checkAudioLevel();
    } catch (err: any) {
      let errorMessage = 'マイクへのアクセスに失敗しました';

      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        errorMessage = 'マイクへのアクセスが拒否されました。ブラウザの設定でマイクの権限を許可してください。';
      } else if (err?.name === 'NotFoundError') {
        errorMessage = 'マイクが見つかりません。マイクが接続されているか確認してください。';
      } else if (err?.name === 'NotReadableError') {
        errorMessage = 'マイクが他のアプリケーションで使用中です。';
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      console.error('VAD開始エラー:', err);
    }
  }, [checkAudioLevel]);

  const stopListening = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setIsListening(false);
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    silenceStartRef.current = null;
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    isSpeaking,
    startListening,
    stopListening,
    error,
  };
}

