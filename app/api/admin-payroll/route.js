import { adminDB, requireAdmin, reply, intParam, boolParam, errorReply, InputError } from '@/lib/admin-server'

export const dynamic = 'force-dynamic'

// Read-only views for the payroll screens. Each view maps to one fixed query on the server;
// the browser cannot choose tables or RPC names.
const views = {
  // 給与履歴（/admin/staff/payroll/history）
  async history(db, q) {
    const { data, error } = await db.rpc('get_payroll_history_matrix', {
      p_start_year: intParam(q.get('start_year'), 'start_year', { min: 2000, max: 2100 }),
      p_start_month: intParam(q.get('start_month'), 'start_month', { min: 1, max: 12 }),
      p_end_year: intParam(q.get('end_year'), 'end_year', { min: 2000, max: 2100 }),
      p_end_month: intParam(q.get('end_month'), 'end_month', { min: 1, max: 12 }),
      p_include_retired: boolParam(q.get('include_retired')),
    })
    if (error) throw error
    return { data: data || [] }
  },
}

export async function GET(request) {
  const denied = await requireAdmin(request)
  if (denied) return denied
  try {
    const q = new URL(request.url).searchParams
    const name = q.get('view')
    const view = Object.hasOwn(views, name) ? views[name] : null
    if (!view) throw new InputError('view の指定が正しくありません。')
    return reply(await view(adminDB(), q))
  } catch (error) {
    return errorReply(error, '給与データの取得に失敗しました。')
  }
}
