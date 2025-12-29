import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Frequently - 爆速ハンズフリー音声AI会話',
  description: 'リアルタイムで自然な日本語会話が可能な、超低遅延のハンズフリー音声AIシステム',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}

