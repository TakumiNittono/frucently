import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'プロンプトが提供されていません' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GROQ_API_KEYが設定されていません' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ストリーミングレスポンスを作成
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const completion = await groq.chat.completions.create({
            messages: [
              {
                role: 'system',
                content: 'あなたは親しみやすい日本語AIアシスタントです。自然で丁寧な日本語で会話してください。',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
            stream: true,
            temperature: 0.7,
            max_tokens: 512,
          });

          const encoder = new TextEncoder();

          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error: any) {
          console.error('Groq API エラー:', error);
          const encoder = new TextEncoder();
          
          // エラーの種類に応じたメッセージを生成
          let errorMessage = 'ストリーミング中にエラーが発生しました';
          
          if (error?.status === 401) {
            errorMessage = 'APIキーが無効です。.env.localファイルのGROQ_API_KEYを確認してください。';
          } else if (error?.status === 400 && error?.error?.code === 'model_decommissioned') {
            errorMessage = '使用しているモデルが廃止されました。コード内のモデル名を最新のものに更新してください。';
          } else if (error?.status === 429) {
            errorMessage = 'レート制限に達しました。しばらく待ってから再試行してください。';
          } else if (error?.message) {
            errorMessage = `エラー: ${error.message}`;
          }
          
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: errorMessage })}\n\n`
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
    console.error('リクエスト処理エラー:', error);
    return new Response(
      JSON.stringify({ error: 'リクエストの処理中にエラーが発生しました' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

