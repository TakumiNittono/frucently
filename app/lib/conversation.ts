/**
 * 会話履歴管理ユーティリティ
 * 現在はローカルストレージを使用（後でSupabaseに移行可能）
 */

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
  title?: string;
}

const STORAGE_KEY = 'frequently_conversations';
const MAX_RECENT_MESSAGES = 10; // プロンプトに注入する最新メッセージ数

/**
 * 会話履歴を取得
 */
export function getConversationHistory(): ConversationMessage[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const conversation: Conversation = JSON.parse(stored);
    return conversation.messages || [];
  } catch (error) {
    console.error('会話履歴の取得エラー:', error);
    return [];
  }
}

/**
 * 会話履歴にメッセージを追加
 */
export function addMessageToHistory(role: 'user' | 'assistant', content: string): void {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    let conversation: Conversation;

    if (stored) {
      conversation = JSON.parse(stored);
    } else {
      conversation = {
        id: `conv_${Date.now()}`,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    const message: ConversationMessage = {
      role,
      content,
      timestamp: new Date(),
    };

    conversation.messages.push(message);
    conversation.updatedAt = new Date();

    // タイトルが未設定の場合、最初のユーザーメッセージから生成
    if (!conversation.title && role === 'user') {
      conversation.title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation));
  } catch (error) {
    console.error('会話履歴の保存エラー:', error);
  }
}

/**
 * 最新の会話履歴を取得（プロンプト注入用）
 */
export function getRecentMessages(count: number = MAX_RECENT_MESSAGES): ConversationMessage[] {
  const history = getConversationHistory();
  return history.slice(-count);
}

/**
 * 会話履歴をクリア
 */
export function clearConversationHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * プロンプトに会話履歴を注入
 */
export function injectConversationHistory(
  userMessage: string,
  systemPrompt: string = 'あなたは親しみやすい日本語AIアシスタントです。'
): string {
  const recentMessages = getRecentMessages(MAX_RECENT_MESSAGES);

  if (recentMessages.length === 0) {
    return `${systemPrompt}\n\nユーザー: ${userMessage}`;
  }

  const historyContext = recentMessages
    .map((msg) => `${msg.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${msg.content}`)
    .join('\n');

  return `${systemPrompt}

過去の会話の文脈:
${historyContext}

現在の会話:
ユーザー: ${userMessage}`;
}

