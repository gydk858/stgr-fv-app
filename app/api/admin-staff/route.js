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
import { syncStaffCardImage } from '@/lib/card-images/staff'

export const dynamic = 'force-dynamic'

const STAFF_PROGRAM_CODE = 'stamp_staff_attendance'
const STAFF_MAX_COUNT = 15

// 営業日（JST、4時前は前日）の月の初日と末日。DB の bambi_current_work_date_jst() と同じ規則。
function currentWorkMonth(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  if (jst.getUTCHours() < 4) jst.setUTCDate(jst.getUTCDate() - 1)
  const y = jst.getUTCFullYear()
  const m = jst.getUTCMonth()
  const first = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  const last = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)
  return { first, last }
}

const staffCodeParam = value => {
  const code = typeof value === 'string' ? value.trim() : ''
  if (!code || code.length > 50) throw new InputError('従業員コードを入力してください。')
  return code
}

// 現在の店舗（有効なもの）の従業員と、その有効な従業員カード。月の出勤履歴の合計も返す。
async function loadStaffCard(db, store, { staffCode, userId }, timing) {
  let query = db
    .from('employee_profiles')
    .select('user_id, staff_code, employee_name, store_id, employment_status')
    .eq('store_id', store.store_id)
  query = staffCode ? query.eq('staff_code', staffCode) : query.eq('user_id', userId)
  const run = (name, work) => (timing ? timing.measure(name, work) : work)
  const { data: profile, error } = await run('profile', query.maybeSingle())
  if (error) throw error
  if (!profile) throw new InputError('この従業員カードは見つかりません')

  const month = currentWorkMonth()
  const [cardResult, eventsResult] = await run('card', Promise.all([
    db.from('v_staff_stamp_cards_current').select('*')
      .eq('user_id', profile.user_id).eq('program_code', STAFF_PROGRAM_CODE).eq('card_status', 'active').maybeSingle(),
    db.from('staff_attendance_events').select('amount')
      .eq('user_id', profile.user_id).gte('work_date', month.first).lte('work_date', month.last),
  ]))
  if (cardResult.error) throw cardResult.error
  if (eventsResult.error) throw eventsResult.error
  if (!cardResult.data) throw new InputError('この従業員カードは見つかりません')

  return {
    card: { ...cardResult.data, employment_status: profile.employment_status || 'active' },
    month_attendance_total: (eventsResult.data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0),
  }
}

// 画像は DB の更新が終わってから作る。失敗しても DB の更新は取り消さず、画像だけを作り直せるように結果を分けて返す。
async function renderStaffCardImage(userId) {
  try {
    const response = await syncStaffCardImage(userId)
    const body = await response.json().catch(() => ({}))
    if (response.ok && body.ok) return { image_ok: true }
    return { image_ok: false, image_error: body.message || body.error || `画像の生成に失敗しました（${response.status}）` }
  } catch (error) {
    console.error('staff card image failed', { userId })
    return { image_ok: false, image_error: error?.message || '画像の生成に失敗しました' }
  }
}
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

  // 従業員カード（/admin/staff/card）：従業員コードで検索
  async card(db, q, timing) {
    const staffCode = staffCodeParam(q.get('staff_code'))
    const store = await currentStore(db, { activeOnly: true, timing })
    return { store, ...(await loadStaffCard(db, store, { staffCode }, timing)) }
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

  // 従業員カードの +1 / -1 / リセット。出勤履歴とカード表示は staff_card_adjust_admin の1トランザクションで更新し、
  // その後に画像を作る。月の出勤履歴の合計が 0 未満になる減算は RPC が拒否する。
  async adjust_card(db, body) {
    const userId = intParam(body.user_id, 'user_id', { min: 1 })
    const action = String(body.card_action || '')
    if (!['add', 'remove', 'reset'].includes(action)) throw new InputError('操作の指定が正しくありません。')
    const store = await currentStore(db, { activeOnly: true })

    const { error } = await db.rpc('staff_card_adjust_admin', {
      p_store_id: store.store_id,
      p_user_id: userId,
      p_action: action,
      p_acted_by: 'admin_staff_ui',
    })
    if (error) {
      // RPC の業務上の拒否（合計が 0 未満・退職済み・対象なし）は、そのまま画面に出す
      if (error.code === 'P0001') throw new InputError(error.message)
      throw error
    }
    const image = await renderStaffCardImage(userId)
    return { ...(await loadStaffCard(db, store, { userId })), ...image }
  },

  // 従業員カードの新規発行（店舗はサーバーが決める）
  async create_card(db, body) {
    const staffCode = staffCodeParam(body.staff_code)
    const displayName = textParam(body.display_name, '氏名', { optional: true, max: 100 })
    const store = await currentStore(db, { activeOnly: true })

    const { data, error } = await db.rpc('create_staff_card_for_store', {
      p_store_code: store.store_code,
      p_staff_code: staffCode,
      p_display_name: displayName,
      p_max_count: STAFF_MAX_COUNT,
      p_note: `管理画面から従業員カード新規発行 (${store.store_code})`,
    })
    if (error) {
      if (String(error.message).includes('staff_code already exists in store')) {
        throw new InputError('その従業員コードはこの店舗ですでに使用されています')
      }
      throw error
    }
    const created = Array.isArray(data) ? data[0] : null
    if (!created) throw new Error('従業員カード発行結果を取得できませんでした')
    const image = await renderStaffCardImage(created.user_id)
    return { store, ...(await loadStaffCard(db, store, { userId: created.user_id })), ...image }
  },

  // 従業員カードの氏名（表示名）の保存。現在の店舗の従業員かを確認してから更新する。
  async save_card_name(db, body) {
    const userId = intParam(body.user_id, 'user_id', { min: 1 })
    const name = textParam(body.name, '氏名', { optional: true, max: 100 })
    const store = await currentStore(db, { activeOnly: true })
    await loadStaffCard(db, store, { userId })

    const now = new Date().toISOString()
    const { data: user, error: userError } = await db
      .from('users')
      .update({ display_name: name ?? '未登録', updated_at: now })
      .eq('user_id', userId)
      .select('user_id')
      .maybeSingle()
    if (userError) throw userError
    if (!user) throw new InputError('氏名の保存に失敗しました')

    const { error: profileError } = await db
      .from('employee_profiles')
      .update({ employee_name: name, updated_at: now })
      .eq('user_id', userId)
      .eq('store_id', store.store_id)
    if (profileError) throw profileError

    const image = await renderStaffCardImage(userId)
    return { ...(await loadStaffCard(db, store, { userId })), ...image }
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
