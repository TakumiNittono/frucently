import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';
import { injectConversationHistory } from '@/app/lib/conversation';
import { retryWithBackoff } from '@/app/lib/retry';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcript, conversationHistory } = body;

    if (!transcript) {
      return new Response(
        JSON.stringify({ error: '転写テキストが提供されていません' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // GroqでLLM処理
    if (!process.env.GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GROQ_API_KEYが設定されていません' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 会話履歴をプロンプトに注入
    const systemPrompt = 'あなたは親しみやすい日本語AIアシスタントです。自然で丁寧な日本語で会話してください。過去の会話の文脈を理解して、自然な会話を続けてください。';
    
    // クライアントから送られてきた会話履歴を使用（なければ空）
    let messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    // 会話履歴がある場合、それをメッセージに追加
    if (conversationHistory && Array.isArray(conversationHistory)) {
      // 最新10件の会話履歴をメッセージに追加
      const recentHistory = conversationHistory.slice(-10);
      for (const msg of recentHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }
    }

    // 現在のユーザーメッセージを追加
    messages.push({
      role: 'user',
      content: transcript,
    });

    // Groq API呼び出しをリトライ可能にする
    const completion = await retryWithBackoff(
      () =>
        groq.chat.completions.create({
          messages: messages as any,
          model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
          stream: true,
          temperature: 0.7,
          max_tokens: 512,
        }),
      {
        maxRetries: 2,
        initialDelay: 1000,
      }
    );

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

