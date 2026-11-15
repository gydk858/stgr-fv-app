import { requireAdmin } from '@/lib/admin-server'
import { syncStampCardImage } from '@/lib/card-images/stamp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// 管理画面からのスタンプカード画像の再生成。管理ログインと同じオリジンを必須にする。
// Discord からは lib/card-images/stamp.js を直接呼ぶ（このルートは経由しない）。
export async function POST(request, context) {
  const denied = await requireAdmin(request, { write: true })
  if (denied) return denied
  const { user_id } = await context.params
  return syncStampCardImage(user_id)
}
