import { NextRequest } from 'next/server';

// ElevenLabs TTS処理
async function handleElevenLabsTTS(text: string): Promise<Response> {
  if (!process.env.ELEVENLABS_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'ELEVENLABS_API_KEYが設定されていません' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // ElevenLabs Turbo API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_turbo_v2_5', // Turboモデル（高速）
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('ElevenLabs エラー:', {
        status: response.status,
        statusText: response.statusText,
        errorData,
      });

      let errorMessage = '音声合成に失敗しました';
      if (response.status === 401) {
        errorMessage = 'ElevenLabs APIキーが無効です。.env.localファイルのELEVENLABS_API_KEYを確認してください。';
      } else if (response.status === 400) {
        errorMessage = '無効なリクエストです。テキストまたはパラメータを確認してください。';
      } else if (errorData?.detail?.message) {
        errorMessage = errorData.detail.message;
      }

      return new Response(
        JSON.stringify({
          error: errorMessage,
          status: response.status,
          provider: 'elevenlabs',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const audioBuffer = await response.arrayBuffer();

    if (audioBuffer.byteLength === 0) {
      return new Response(
        JSON.stringify({ error: '音声データが空です' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    console.error('ElevenLabs TTS処理エラー:', error);
    return new Response(
      JSON.stringify({
        error: error?.message || 'ElevenLabs音声合成の処理中にエラーが発生しました',
        provider: 'elevenlabs',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'テキストが提供されていません' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // TTSプロバイダーの優先順位: ElevenLabs（メイン） → Cartesia（フォールバック）
    const useCartesia = process.env.TTS_PROVIDER === 'cartesia' && process.env.CARTESIA_API_KEY;
    
    // ElevenLabsが設定されている場合、またはプロバイダー指定がない場合はElevenLabsを使用
    if (!useCartesia && process.env.ELEVENLABS_API_KEY) {
      return await handleElevenLabsTTS(text);
    }
    
    // Cartesiaを使用する場合
    if (useCartesia) {
      // 下記のCartesia処理に進む
    } else if (!process.env.ELEVENLABS_API_KEY && !process.env.CARTESIA_API_KEY) {
      return new Response(
        JSON.stringify({ 
          error: 'TTS APIキーが設定されていません。ELEVENLABS_API_KEYまたはCARTESIA_API_KEYを設定してください。',
          hint: 'ElevenLabs Turboを推奨します（https://elevenlabs.io/）'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Cartesia API処理（フォールバックまたは明示的に指定された場合）
    if (!process.env.CARTESIA_API_KEY) {
      // ElevenLabsにフォールバック
      if (process.env.ELEVENLABS_API_KEY) {
        return await handleElevenLabsTTS(text);
      }
      return new Response(
        JSON.stringify({ error: 'CARTESIA_API_KEYが設定されていません' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Cartesia APIで音声合成
    // エンドポイントの候補を試す
    // 注意: CartesiaのAPIエンドポイントは変更される可能性があります
    // 公式ドキュメント: https://docs.cartesia.ai/
    const endpoints = [
      'https://api.cartesia.ai/v1/tts/tts',
      'https://api.cartesia.ai/tts/tts',
      'https://api.cartesia.ai/v1/tts',
      'https://api.cartesia.ai/tts',
      'https://api.cartesia.ai/api/v1/tts',
    ];
    
    let response: Response | null = null;
    let lastError: any = null;
    
    // 各エンドポイントを試す
    for (const endpoint of endpoints) {
      try {
        console.log(`Cartesia API試行: ${endpoint}`);
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.CARTESIA_API_KEY,
          },
          body: JSON.stringify({
            text: text,
            model: 'sonic-multilingual',
            voice_id: 'default',
            output_format: 'pcm_16000',
          }),
        });
        
        console.log(`Cartesia API応答: ${endpoint} - ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          console.log(`Cartesia API成功: ${endpoint}`);
          break; // 成功したらループを抜ける
        }
      } catch (err) {
        console.error(`Cartesia APIエラー (${endpoint}):`, err);
        lastError = err;
        continue;
      }
    }
    
    if (!response) {
      // Cartesia APIへの接続に失敗した場合、ElevenLabsにフォールバック
      if (process.env.ELEVENLABS_API_KEY) {
        console.log('Cartesia API接続失敗、ElevenLabs Turboにフォールバック');
        return await handleElevenLabsTTS(text);
      }
      throw new Error('Cartesia APIへの接続に失敗しました。ElevenLabs APIキーを設定すると自動的にフォールバックします。');
    }

    if (!response.ok) {
      // Cartesiaが失敗した場合、ElevenLabsにフォールバック
      if (process.env.ELEVENLABS_API_KEY) {
        console.log('Cartesia失敗、ElevenLabs Turboにフォールバック');
        return await handleElevenLabsTTS(text);
      }
      
      const errorData = await response.json().catch(() => ({}));
      const errorText = await response.text().catch(() => '');
      console.error('Cartesia エラー:', {
        status: response.status,
        statusText: response.statusText,
        errorData,
        errorText,
        url: response.url
      });
      
      let errorMessage = '音声合成に失敗しました';
      if (response.status === 401) {
        errorMessage = 'Cartesia APIキーが無効です。.env.localファイルのCARTESIA_API_KEYを確認してください。';
      } else if (response.status === 404) {
        errorMessage = 'Cartesia APIエンドポイントが見つかりません。ElevenLabs APIキーを設定すると自動的にフォールバックします。';
      } else if (response.status === 400) {
        errorMessage = '無効なリクエストです。テキストまたはパラメータを確認してください。';
      } else if (errorData?.error) {
        errorMessage = errorData.error;
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          status: response.status,
          details: errorData || errorText
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 音声データを取得
    const audioBuffer = await response.arrayBuffer();

    if (audioBuffer.byteLength === 0) {
      return new Response(
        JSON.stringify({ error: '音声データが空です' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/pcm',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    console.error('TTS処理エラー:', error);
    const errorMessage = error?.message || '音声合成の処理中にエラーが発生しました';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error?.stack 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

