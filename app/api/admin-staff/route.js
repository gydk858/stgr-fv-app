import {
  adminDB,
  createTiming,
  currentStore,
  requireAdmin,
  reply,
  intParam,
  dateParam,
  textParam,
  readJson,
  errorReply,
  InputError,
} from '@/lib/admin-server'

export const dynamic = 'force-dynamic'

const STAFF_PROGRAM_CODE = 'stamp_staff_attendance'
const STAFF_GRADES = ['Recruit', 'Employee', 'Experienced', 'Chief']
const EMPLOYMENT_STATUSES = ['active', 'retired']

const yearMonth = src => ({
  year: intParam(src.year, 'year', { min: 2000, max: 2100 }),
  month: intParam(src.month, 'month', { min: 1, max: 12 }),
})

// Read-only views for the staff screens. The store is always decided on the server.
const views = {
  // 月末リセット（/admin/staff/manage）：リセット前チェック。店舗は RPC が current_store_code から決める。
  async reset_status(db, q, timing) {
    const { year, month } = yearMonth({ year: q.get('year'), month: q.get('month') })
    const { data, error } = await timing.measure('db', db.rpc('check_staff_monthly_reset_status', {
      p_target_year: year,
      p_target_month: month,
    }))
    if (error) throw error
    return { data: data || [] }
  },

  // 従業員（/admin/staff/employees）：現在の店舗（有効なもののみ。従来どおり）の従業員と、在籍カード
  async employees(db, q, timing) {
    const store = await currentStore(db, { activeOnly: true, timing })
    const { data: employees, error } = await timing.measure('db', db
      .from('employee_profiles')
      .select('user_id, store_id, staff_code, employee_name, employment_status, staff_grade, resigned_at, employee_note, updated_at')
      .eq('store_id', store.store_id)
      .order('staff_code', { ascending: true }))
    if (error) throw error

    const userIds = (employees || []).map(e => e.user_id).filter(id => id !== null && id !== undefined)
    let cards = []
    if (userIds.length) {
      const { data, error: cardError } = await timing.measure('cards', db
        .from('v_staff_stamp_cards_current')
        .select('user_id, staff_code, current_count, max_count, card_id, card_status, program_code')
        .in('user_id', userIds)
        .eq('program_code', STAFF_PROGRAM_CODE)
        .eq('card_status', 'active'))
      if (cardError) throw cardError
      cards = data || []
    }
    return { store, employees: employees || [], cards }
  },
}

const actions = {
  // 月末一括リセット。実行者と理由はサーバーで固定する。RPC 側でも can_reset を再確認している。
  async reset_month(db, body) {
    const { year, month } = yearMonth(body)
    const { data, error } = await db.rpc('reset_active_staff_attendance_cards_for_month', {
      p_target_year: year,
      p_target_month: month,
      p_acted_by: 'admin_staff_manage_ui',
      p_reason: `${year}年${month}月 管理画面から在籍中従業員カード月末一括リセット`,
    })
    if (error) throw error
    return { data: data || [] }
  },

  // 従業員の保存。RPC は user_id だけで更新するため、現在の店舗の従業員かを先に確認する。
  async save_employee(db, body) {
    const userId = intParam(body.user_id, 'user_id', { min: 1 })
    const employmentStatus = String(body.employment_status || 'active')
    if (!EMPLOYMENT_STATUSES.includes(employmentStatus)) throw new InputError('在籍状況の値が正しくありません。')
    const staffGrade = STAFF_GRADES.includes(body.staff_grade) ? body.staff_grade : 'Recruit'
    const employeeName = textParam(body.employee_name, '従業員名', { optional: true, max: 100 })
    const employeeNote = textParam(body.employee_note, 'メモ', { optional: true, max: 2000 })
    const resignedAt = employmentStatus === 'retired'
      ? dateParam(body.resigned_at, '退職日', { optional: true })
      : null

    const store = await currentStore(db, { activeOnly: true })
    const { data: own, error: ownError } = await db
      .from('employee_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .eq('store_id', store.store_id)
      .maybeSingle()
    if (ownError) throw ownError
    if (!own) throw new InputError('対象の従業員が見つかりません。')

    const { error: profileError } = await db.rpc('update_employee_profile_admin', {
      p_user_id: userId,
      p_employee_name: employeeName,
      p_employment_status: employmentStatus,
      p_resigned_at: resignedAt,
      p_employee_note: employeeNote,
    })
    if (profileError) throw profileError

    const { error: gradeError } = await db.rpc('update_employee_grade_admin', {
      p_user_id: userId,
      p_staff_grade: staffGrade,
      p_updated_by: 'admin_ui',
    })
    if (gradeError) throw gradeError
    return { ok: true }
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
    const timing = createTiming()
    const body = await view(adminDB(), q, timing)
    return reply(body, 200, timing.header())
  } catch (error) {
    return errorReply(error, '従業員データの取得に失敗しました。')
  }
}

export async function POST(request) {
  const denied = await requireAdmin(request, { write: true })
  if (denied) return denied
  try {
    const body = await readJson(request)
    const action = Object.hasOwn(actions, body.action) ? actions[body.action] : null
    if (!action) throw new InputError('action の指定が正しくありません。')
    return reply(await action(adminDB(), body))
  } catch (error) {
    return errorReply(error, '従業員データの保存に失敗しました。')
  }
}
