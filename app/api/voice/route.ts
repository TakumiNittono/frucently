import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcript } = body;

    if (!transcript) {
      return new Response(
        JSON.stringify({ error: '転写テキストが提供されていません' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // TODO: DeepgramでSTT処理
    // 現在はテキスト入力として処理（後で実装）

    // GroqでLLM処理
    if (!process.env.GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GROQ_API_KEYが設定されていません' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'あなたは親しみやすい日本語AIアシスタントです。自然で丁寧な日本語で会話してください。',
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      stream: true,
      temperature: 0.7,
      max_tokens: 512,
    });

    // ストリーミングレスポンスを作成
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder();
          let fullText = '';

          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullText += content;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'text', content })}\n\n`
                )
              );
            }
          }

          // TODO: CartesiaでTTS処理
          // 現在はテキストのみ返す（後で実装）
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'done', text: fullText })}\n\n`
            )
          );
          controller.close();
        } catch (error: any) {
          console.error('ストリーミングエラー:', error);
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`
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
      JSON.stringify({
        error: 'リクエストの処理中にエラーが発生しました',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

