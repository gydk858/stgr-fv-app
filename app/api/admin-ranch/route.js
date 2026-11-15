import {
  adminDB,
  createTiming,
  currentStore,
  requireAdmin,
  reply,
  intParam,
  boolParam,
  dateParam,
  readJson,
  errorReply,
  InputError,
} from '@/lib/admin-server'

export const dynamic = 'force-dynamic'

const BIGINT_MAX = Number.MAX_SAFE_INTEGER
const yearMonth = src => ({
  year: intParam(src.year, 'year', { min: 2000, max: 2100 }),
  month: intParam(src.month, 'month', { min: 1, max: 12 }),
})
const pad = n => String(n).padStart(2, '0')
const monthRange = (year, month) => ({
  first: `${year}-${pad(month)}-01`,
  last: `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`,
})
const amountParam = (value, name) => intParam(value, name, { min: -BIGINT_MAX, max: BIGINT_MAX })

// 牧場（/admin/staff/ranch）は、有効な店舗だけを対象にする（従来どおり）。
const ranchStore = (db, timing) => currentStore(db, { activeOnly: true, timing })

// 現在の店舗の在籍中の従業員か
async function ownEmployee(db, store, userId) {
  const { data, error } = await db
    .from('employee_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('store_id', store.store_id)
    .eq('employment_status', 'active')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new InputError('対象の従業員が見つかりません。')
}

async function ownRow(db, table, idColumn, id, store, label) {
  const { data, error } = await db.from(table).select(idColumn).eq(idColumn, id).eq('store_id', store.store_id).maybeSingle()
  if (error) throw error
  if (!data) throw new InputError(`対象の${label}が見つかりません。`)
}

const views = {
  // 月の画面データ一式。店舗を決めた後、7つの読み取りを並列に行う。
  async month(db, q, timing) {
    const { year, month } = yearMonth({ year: q.get('year'), month: q.get('month') })
    const store = await ranchStore(db, timing)
    const range = monthRange(year, month)

    const results = await timing.measure('db', Promise.all([
      db.from('employee_profiles')
        .select('user_id, store_id, staff_code, employee_name, employment_status, staff_grade, ranch_visible')
        .eq('store_id', store.store_id).eq('employment_status', 'active').order('staff_code', { ascending: true }),
      db.from('ranch_month_settings').select('*')
        .eq('store_id', store.store_id).eq('target_year', year).eq('target_month', month).maybeSingle(),
      db.from('ranch_care_events').select('*')
        .eq('store_id', store.store_id).eq('target_year', year).eq('target_month', month).order('care_date', { ascending: true }),
      db.from('ranch_profit_entries').select('*')
        .eq('store_id', store.store_id).gte('profit_date', range.first).lte('profit_date', range.last)
        .order('profit_date', { ascending: true }).order('ranch_profit_entry_id', { ascending: true }),
      db.rpc('get_ranch_month_summary', { p_store_id: store.store_id, p_target_year: year, p_target_month: month }),
      db.from('payroll_periods')
        .select('payroll_period_id, target_year, target_month, half_type, period_start, period_end, payday, status, store_id')
        .eq('store_id', store.store_id).eq('target_year', year).eq('target_month', month).order('period_start', { ascending: true }),
    ]))
    for (const r of results) if (r.error) throw r.error
    const [employees, setting, careEvents, profitEntries, summary, payrollPeriods] = results.map(r => r.data)

    return {
      store,
      employees: employees || [],
      month_setting: setting || null,
      care_events: careEvents || [],
      profit_entries: profitEntries || [],
      summary: Array.isArray(summary) && summary.length ? summary[0] : null,
      payroll_periods: payrollPeriods || [],
    }
  },
}

const actions = {
  async save_setting(db, body) {
    const { year, month } = yearMonth(body)
    const store = await ranchStore(db)
    const memo = typeof body.memo === 'string' && body.memo.trim() !== '' ? body.memo.trim().slice(0, 2000) : null
    const { error } = await db.rpc('upsert_ranch_month_setting', {
      p_store_id: store.store_id,
      p_target_year: year,
      p_target_month: month,
      p_unit_care_pay: amountParam(body.unit_care_pay, 'お世話単価'),
      p_memo: memo,
    })
    if (error) throw error
    return { ok: true }
  },

  // お世話記録の ON / OFF（現在の店舗の在籍中の従業員だけ）
  async set_care(db, body) {
    const userId = intParam(body.user_id, 'user_id', { min: 1 })
    const careDate = dateParam(body.care_date, 'お世話日')
    const on = boolParam(body.on)
    const store = await ranchStore(db)
    await ownEmployee(db, store, userId)

    if (!on) {
      const { error } = await db.from('ranch_care_events').delete()
        .eq('store_id', store.store_id).eq('user_id', userId).eq('care_date', careDate)
      if (error) throw error
    } else {
      const { error } = await db.from('ranch_care_events').upsert({
        store_id: store.store_id,
        user_id: userId,
        target_year: Number(careDate.slice(0, 4)),
        target_month: Number(careDate.slice(5, 7)),
        care_date: careDate,
        care_count: 1,
        note: null,
        acted_by: 'admin_ranch_ui',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id,user_id,care_date' })
      if (error) throw error
    }
    return { ok: true }
  },

  async set_visible(db, body) {
    const userId = intParam(body.user_id, 'user_id', { min: 1 })
    const store = await ranchStore(db)
    await ownEmployee(db, store, userId)
    const { error } = await db.rpc('update_employee_ranch_visible_admin', {
      p_user_id: userId,
      p_ranch_visible: boolParam(body.visible),
      p_updated_by: 'admin_ranch_ui',
    })
    if (error) throw error
    return { ok: true }
  },

  async add_profit(db, body) {
    const store = await ranchStore(db)
    const { error } = await db.rpc('add_ranch_profit_entry', {
      p_store_id: store.store_id,
      p_profit_date: dateParam(body.profit_date, '利益日付'),
      p_profit_amount: amountParam(body.profit_amount, '利益金額'),
      p_memo: null,
      p_acted_by: 'admin_ranch_ui',
    })
    if (error) throw error
    return { ok: true }
  },

  async update_profit(db, body) {
    const id = intParam(body.ranch_profit_entry_id, 'ranch_profit_entry_id', { min: 1 })
    const store = await ranchStore(db)
    await ownRow(db, 'ranch_profit_entries', 'ranch_profit_entry_id', id, store, '牧場利益')
    const { error } = await db.rpc('update_ranch_profit_entry', {
      p_ranch_profit_entry_id: id,
      p_profit_date: dateParam(body.profit_date, '利益日付'),
      p_profit_amount: amountParam(body.profit_amount, '利益金額'),
      p_memo: null,
      p_acted_by: 'admin_ranch_ui',
    })
    if (error) throw error
    return { ok: true }
  },

  async delete_profit(db, body) {
    const id = intParam(body.ranch_profit_entry_id, 'ranch_profit_entry_id', { min: 1 })
    const store = await ranchStore(db)
    await ownRow(db, 'ranch_profit_entries', 'ranch_profit_entry_id', id, store, '牧場利益')
    const { error } = await db.rpc('delete_ranch_profit_entry', { p_ranch_profit_entry_id: id })
    if (error) throw error
    return { ok: true }
  },

  // 給与期間への牧場利益の反映（現在の店舗の給与期間だけ）
  async apply_payroll(db, body) {
    const id = intParam(body.payroll_period_id, 'payroll_period_id', { min: 1 })
    const store = await ranchStore(db)
    await ownRow(db, 'payroll_periods', 'payroll_period_id', id, store, '給与期間')
    const { data, error } = await db.rpc('apply_ranch_profit_to_payroll_period', {
      p_payroll_period_id: id,
      p_applied_by: 'admin_ranch_ui',
      p_memo: '牧場管理画面から反映',
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
    const timing = createTiming()
    const body = await view(adminDB(), q, timing)
    return reply(body, 200, timing.header())
  } catch (error) {
    return errorReply(error, '牧場データの取得に失敗しました。')
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
    return errorReply(error, '牧場データの保存に失敗しました。')
  }
}
