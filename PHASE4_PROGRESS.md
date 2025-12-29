# フェーズ4: コンテキスト・マネジメント - 進捗管理

**期間**: Week 7-8  
**開始日**: ___________  
**完了予定日**: ___________  
**ステータス**: 🔵 未開始 / 🟡 進行中 / 🟢 完了

---

## 目標

過去の会話履歴をSupabaseに保存し、会話の冒頭で「昨日ドローンの話をしましたね」と即座に思い出せるようにプロンプトに動的に注入する。

---

## タスクリスト

### 1. Supabaseセットアップ
- [ ] Supabaseプロジェクト作成
- [ ] データベース接続確認
- [ ] pgvector拡張の有効化
  - [ ] `CREATE EXTENSION vector;` の実行
- [ ] 環境変数の設定
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`

**メモ**:  
_________________________________________________  
_________________________________________________  

### 2. データベーススキーマ作成
- [ ] `conversations` テーブルの作成
  - [ ] `id` (UUID, PRIMARY KEY)
  - [ ] `user_id` (UUID, FOREIGN KEY)
  - [ ] `created_at` (TIMESTAMP)
  - [ ] `updated_at` (TIMESTAMP)
  - [ ] `title` (TEXT)
  - [ ] `metadata` (JSONB)
- [ ] `conversation_messages` テーブルの作成
  - [ ] `id` (UUID, PRIMARY KEY)
  - [ ] `conversation_id` (UUID, FOREIGN KEY)
  - [ ] `role` (TEXT, CHECK: 'user' or 'assistant')
  - [ ] `content` (TEXT)
  - [ ] `embedding` (vector(1536))
  - [ ] `created_at` (TIMESTAMP)
- [ ] インデックスの作成
  - [ ] `conversation_messages.embedding` のベクトルインデックス
  - [ ] `conversation_messages.conversation_id` のインデックス
  - [ ] `conversation_messages.user_id` のインデックス

**メモ**:  
_________________________________________________  
_________________________________________________  

### 3. 認証実装
- [ ] Supabase Auth統合
  - [ ] 認証コンポーネントの実装
  - [ ] ログイン/ログアウト機能
  - [ ] セッション管理
- [ ] ユーザー単位の会話管理
  - [ ] ユーザーIDの取得
  - [ ] 会話のユーザー紐付け

**メモ**:  
_________________________________________________  
_________________________________________________  

### 4. 会話履歴保存
- [ ] メッセージの保存
  - [ ] ユーザーメッセージの保存
  - [ ] AI応答の保存
  - [ ] 会話IDの管理
- [ ] ベクトル埋め込み生成・保存
  - [ ] OpenAI Embeddings APIの統合
  - [ ] メッセージの埋め込み生成
  - [ ] ベクトルの保存

**メモ**:  
_________________________________________________  
_________________________________________________  

### 5. セマンティック検索
- [ ] 関連会話の検索
  - [ ] ベクトル検索クエリの実装
  - [ ] コサイン類似度による検索
  - [ ] 検索結果のランキング
- [ ] プロンプトへの動的注入
  - [ ] 最新の会話履歴取得 (直近10件)
  - [ ] 関連会話の取得
  - [ ] プロンプトテンプレートの作成
  - [ ] 動的プロンプト生成

**メモ**:  
_________________________________________________  
_________________________________________________  

### 6. UI実装
- [ ] 会話履歴の表示
  - [ ] 会話一覧の表示
  - [ ] 会話の選択・切り替え
  - [ ] 会話の削除機能
- [ ] 会話タイトルの自動生成
  - [ ] 最初のメッセージからタイトル生成
  - [ ] タイトルの編集機能

**メモ**:  
_________________________________________________  
_________________________________________________  

### 7. テスト
- [ ] 会話履歴の保存確認
- [ ] セマンティック検索の精度確認
- [ ] プロンプト注入の動作確認
- [ ] 認証機能のテスト
- [ ] パフォーマンステスト

**メモ**:  
_________________________________________________  
_________________________________________________  

---

## 成果物

- [ ] 会話履歴を記憶する音声会話アプリ
- [ ] Supabaseデータベースが正常に動作する
- [ ] セマンティック検索が正常に動作する
- [ ] プロンプトに過去の会話が動的に注入される
- [ ] 認証機能が実装されている

---

## 技術的な詳細

### 使用技術
- Supabase (PostgreSQL + pgvector)
- OpenAI Embeddings API
- Next.js API Routes
- Supabase Auth

### 実装ファイル
- `app/lib/supabase.ts` - Supabaseクライアント
- `app/api/conversations/route.ts` - 会話API
- `app/api/messages/route.ts` - メッセージAPI
- `app/api/embeddings/route.ts` - 埋め込み生成API
- `app/components/ConversationList.tsx` - 会話一覧
- `app/hooks/useConversation.ts` - 会話管理フック
- `supabase/migrations/` - データベースマイグレーション

### データベーススキーマ

```sql
-- conversations テーブル
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  title TEXT,
  metadata JSONB
);

-- conversation_messages テーブル
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id),
  role TEXT CHECK (role IN ('user', 'assistant')),
  content TEXT,
  embedding vector(1536),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX ON conversation_messages USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON conversation_messages (conversation_id);
CREATE INDEX ON conversation_messages (user_id);
```

### プロンプト生成ロジック

```typescript
async function generateContextualPrompt(
  userId: string, 
  currentMessage: string
) {
  // 1. 最新の会話履歴を取得 (直近10件)
  const recentMessages = await getRecentMessages(userId, 10);
  
  // 2. セマンティック検索で関連する過去の会話を取得
  const relatedConversations = await semanticSearch(currentMessage, userId);
  
  // 3. プロンプトに動的に注入
  return `
あなたは親しみやすい日本語AIアシスタントです。

過去の会話の文脈:
${recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')}

関連する過去の会話:
${relatedConversations.map(c => c.content).join('\n')}

現在の会話:
ユーザー: ${currentMessage}
`;
}
```

---

## パフォーマンス目標

| 指標 | 目標値 | 実測値 | 達成状況 |
|------|--------|--------|----------|
| 会話履歴保存遅延 | 100ms | _____ | [ ] |
| セマンティック検索遅延 | 200ms | _____ | [ ] |
| プロンプト生成遅延 | 50ms | _____ | [ ] |
| データベースクエリ時間 | 100ms | _____ | [ ] |

---

## 課題・ブロッカー

| 日付 | 課題 | 解決策 | ステータス |
|------|------|--------|-----------|
|      |      |        |           |
|      |      |        |           |

---

## 学習メモ

### Supabase関連
_________________________________________________  
_________________________________________________  

### pgvector関連
_________________________________________________  
_________________________________________________  

### OpenAI Embeddings API関連
_________________________________________________  
_________________________________________________  

### セマンティック検索関連
_________________________________________________  
_________________________________________________  

---

## 完了チェックリスト

- [ ] すべてのタスクが完了
- [ ] Supabaseが正常に動作する
- [ ] 会話履歴が保存される
- [ ] セマンティック検索が正常に動作する
- [ ] プロンプトに過去の会話が注入される
- [ ] 認証機能が実装されている
- [ ] パフォーマンス目標を達成
- [ ] テストがパスした
- [ ] ドキュメントが更新された
- [ ] 次のフェーズへの引き継ぎ準備ができた

---

## 完了日

**実際の完了日**: ___________

---

## 次のフェーズへの引き継ぎ事項

_________________________________________________  
_________________________________________________  
_________________________________________________  

