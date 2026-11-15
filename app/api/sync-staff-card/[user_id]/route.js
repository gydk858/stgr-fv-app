import { requireAdmin } from '@/lib/admin-server'
import { syncStaffCardImage } from '@/lib/card-images/staff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// 管理画面からの従業員カード画像の再生成。管理ログインと同じオリジンを必須にする。
// 書き込みを伴うため GET は受け付けない（呼び出し元はすべて POST）。
// Discord からは lib/card-images/staff.js を直接呼ぶ（このルートは経由しない）。
export async function POST(request, context) {
  const denied = await requireAdmin(request, { write: true })
  if (denied) return denied
  const { user_id } = await context.params
  return syncStaffCardImage(user_id)
}
