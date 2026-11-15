import { adminDB, currentStore, requireAdmin, reply, boolParam, errorReply } from '@/lib/admin-server'

export const dynamic = 'force-dynamic'

// GET /api/admin-context?active=1 → the current store (active stores only when active=1).
export async function GET(request) {
  const denied = await requireAdmin(request)
  if (denied) return denied
  try {
    const activeOnly = boolParam(new URL(request.url).searchParams.get('active'))
    const store = await currentStore(adminDB(), { activeOnly })
    return reply({ store_code: store.store_code, store })
  } catch (error) {
    return errorReply(error, '店舗情報の取得に失敗しました。')
  }
}
