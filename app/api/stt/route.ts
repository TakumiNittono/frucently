import { NextRequest } from 'next/server';
import { createClient } from '@deepgram/sdk';
import { retryWithBackoff } from '@/app/lib/retry';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: '音声ファイルが提供されていません' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!process.env.DEEPGRAM_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'DEEPGRAM_API_KEYが設定されていません。.env.localファイルを確認してください。' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Deepgramクライアントを初期化（環境変数が読み込まれた後）
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    // 音声ファイルをバッファに変換
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // デバッグ情報
    console.log('STT処理開始:', {
      fileName: audioFile.name,
      fileSize: audioFile.size,
      fileType: audioFile.type,
      bufferSize: buffer.length,
    });

    // 音声ファイルが空でないか確認
    if (buffer.length === 0) {
      console.error('音声ファイルが空です');
      return new Response(
        JSON.stringify({ 
          error: '音声ファイルが空です。マイクが正しく動作しているか確認してください。',
          transcript: ''
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Deepgramで音声認識（リトライ可能）
    const { result, error } = await retryWithBackoff(
      () =>
        deepgram.listen.prerecorded.transcribeFile(buffer, {
          model: 'nova-2',
          language: 'ja',
          punctuate: true,
          interim_results: false,
        }),
      {
        maxRetries: 2,
        initialDelay: 1000,
      }
    );

    if (error) {
      console.error('Deepgram エラー:', error);
      const errorMessage = error.message || '音声認識に失敗しました';
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          details: error 
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // デバッグ情報
    console.log('Deepgram結果:', {
      hasResult: !!result,
      channels: result?.results?.channels?.length || 0,
      alternatives: result?.results?.channels?.[0]?.alternatives?.length || 0,
    });

    const transcript =
      result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    if (!transcript) {
      console.warn('転写結果が空です。音声が認識されませんでした。', {
        result: JSON.stringify(result, null, 2),
      });
      return new Response(
        JSON.stringify({ 
          error: '音声からテキストを認識できませんでした。もう一度、はっきりと話してみてください。',
          transcript: '',
          debug: {
            hasResult: !!result,
            channels: result?.results?.channels?.length || 0,
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('転写成功:', transcript);

    return new Response(
      JSON.stringify({ transcript }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('STT処理エラー:', error);
    const errorMessage = error?.message || '音声認識の処理中にエラーが発生しました';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error?.stack 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

