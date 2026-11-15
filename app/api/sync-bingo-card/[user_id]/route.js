import { requireAdmin } from '@/lib/admin-server'
import { syncBingoCardImage } from '@/lib/card-images/bingo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// 管理画面からのビンゴカード画像の再生成。管理ログインと同じオリジンを必須にする。
// Discord からは lib/card-images/bingo.js を直接呼ぶ（このルートは経由しない）。
export async function POST(request, context) {
  const denied = await requireAdmin(request, { write: true })
  if (denied) return denied
  const { user_id } = await context.params
  return syncBingoCardImage(user_id)
}
