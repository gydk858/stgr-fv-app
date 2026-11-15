import {
  adminDB,
  createTiming,
  currentStore,
  requireAdmin,
  reply,
  intParam,
  boolParam,
  dateParam,
  textParam,
  readJson,
  errorReply,
  InputError,
} from '@/lib/admin-server'

export const dynamic = 'force-dynamic'

const INT_MAX = 2147483647

// Read-only views for the payroll screens. Each view maps to fixed queries on the server;
// the browser cannot choose tables, RPC names or the store.
const views = {
  // 給与履歴（/admin/staff/payroll/history）
  async history(db, q, timing) {
    const { data, error } = await timing.measure('db', db.rpc('get_payroll_history_matrix', {
      p_start_year: intParam(q.get('start_year'), 'start_year', { min: 2000, max: 2100 }),
      p_start_month: intParam(q.get('start_month'), 'start_month', { min: 1, max: 12 }),
      p_end_year: intParam(q.get('end_year'), 'end_year', { min: 2000, max: 2100 }),
      p_end_month: intParam(q.get('end_month'), 'end_month', { min: 1, max: 12 }),
      p_include_retired: boolParam(q.get('include_retired')),
    }))
    if (error) throw error
    return { data: data || [] }
  },

  // 月次給与（/admin/staff/payroll/monthly）。店舗は status を問わない（従来どおり）。
  // 期間と、その明細・集計・入力値を外部キーの埋め込みで1回で取得する。
  async monthly(db, q, timing) {
    const year = intParam(q.get('year'), 'year', { min: 2000, max: 2100 })
    const month = intParam(q.get('month'), 'month', { min: 1, max: 12 })
    const store = await currentStore(db, { activeOnly: false, timing })

    const { data: rows, error } = await timing.measure('db', db
      .from('payroll_periods')
      .select(`payroll_period_id, target_year, target_month, half_type, period_start, period_end, payday, status, store_id,
        payroll_run_items(payroll_run_item_id, payroll_period_id, user_id, staff_code, display_name, attendance_count, stamp_count_at_close, applied_unit_pay, calculated_pay_amount, transfer_amount, adjustment_amount, note, is_locked, store_id),
        payroll_period_summaries(payroll_period_summary_id, payroll_period_id, total_pay_amount, total_transfer_amount, total_adjustment_amount, ranch_profit_amount, vault_before_amount, vault_plus_ranch_amount, vault_after_amount, store_profit_amount, total_profit_amount, memo, store_id),
        payroll_period_inputs(payroll_period_input_id, payroll_period_id, payroll_rate_rule_set_id, sales_amount, ranch_profit_amount, vault_before_amount, extra_income_amount, memo, store_id)`)
      .eq('store_id', store.store_id)
      .eq('target_year', year)
      .eq('target_month', month)
      .order('period_start', { ascending: true }))
    if (error) throw error

    // 従来の個別クエリと同じ並び順にそろえる
    const periods = (rows || []).map(({ payroll_run_items, payroll_period_summaries, payroll_period_inputs, ...p }) => p)
    const all = key => (rows || []).flatMap(r => r[key] || [])
    const byNum = (key, dir = 1) => (a, b) => dir * (Number(a[key]) - Number(b[key]))
    const byCode = (a, b) => (a.staff_code == null) - (b.staff_code == null) ||
      (a.staff_code < b.staff_code ? -1 : a.staff_code > b.staff_code ? 1 : 0) || // order by staff_code（NULL は最後）
      Number(a.payroll_run_item_id) - Number(b.payroll_run_item_id) // 同じ staff_code の順を固定する
    const run_items = all('payroll_run_items').sort(byCode)
    const summaries = all('payroll_period_summaries').sort(byNum('payroll_period_summary_id', -1))
    const inputs = all('payroll_period_inputs').sort(byNum('payroll_period_input_id', -1))
    return { store, periods, run_items, summaries, inputs }
  },

  // 単価ルール（/admin/staff/payroll/rate-rules）。ルールセットと明細を外部キーの埋め込みで1回で取得する。
  async rate_rules(db, q, timing) {
    const store = await currentStore(db, { activeOnly: false, timing })
    const { data, error } = await timing.measure('db', db
      .from('payroll_rate_rule_sets')
      .select(`payroll_rate_rule_set_id, store_id, rule_name, effective_from, effective_to, is_active, note, created_at, updated_at,
        payroll_rate_rules(payroll_rate_rule_id, payroll_rate_rule_set_id, min_stamp_count, max_stamp_count, unit_pay, created_at)`)
      .eq('store_id', store.store_id)
      .order('is_active', { ascending: false })
      .order('effective_from', { ascending: false })
      .order('payroll_rate_rule_set_id', { ascending: false }))
    if (error) throw error

    const rule_sets = (data || []).map(({ payroll_rate_rules, ...set }) => set)
    const rules = (data || []).flatMap(set => set.payroll_rate_rules || [])
      .sort((a, b) => Number(a.min_stamp_count) - Number(b.min_stamp_count) ||
        Number(a.payroll_rate_rule_id) - Number(b.payroll_rate_rule_id)) // 同じ下限の順を固定する
    return { store, rule_sets, rules }
  },
}

// Confirms the rule set belongs to the current store before changing it.
async function ownRuleSet(db, store, id) {
  const { data, error } = await db
    .from('payroll_rate_rule_sets')
    .select('payroll_rate_rule_set_id')
    .eq('payroll_rate_rule_set_id', id)
    .eq('store_id', store.store_id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new InputError('対象の単価ルールが見つかりません。')
}

const actions = {
  async save_rate_rule_set(db, body) {
    const store = await currentStore(db, { activeOnly: false })
    const id = body.payroll_rate_rule_set_id == null || body.payroll_rate_rule_set_id === ''
      ? null
      : intParam(body.payroll_rate_rule_set_id, 'payroll_rate_rule_set_id', { min: 1 })
    if (id) await ownRuleSet(db, store, id)

    const { data, error } = await db.rpc('save_payroll_rate_rule_set_basic', {
      p_payroll_rate_rule_set_id: id,
      p_store_id: store.store_id,
      p_rule_name: textParam(body.rule_name, 'ルール名', { max: 200 }),
      p_effective_from: dateParam(body.effective_from, '適用開始日'),
      p_effective_to: dateParam(body.effective_to, '適用終了日', { optional: true }),
      p_is_active: boolParam(body.is_active),
      p_note: textParam(body.note, 'メモ', { optional: true, max: 2000 }),
      p_unit_pay_0_5: intParam(body.unit_pay_0_5, '0〜5個の単価', { min: 0, max: INT_MAX }),
      p_unit_pay_6_10: intParam(body.unit_pay_6_10, '6〜10個の単価', { min: 0, max: INT_MAX }),
      p_unit_pay_11_plus: intParam(body.unit_pay_11_plus, '11個以上の単価', { min: 0, max: INT_MAX }),
    })
    if (error) throw error
    return { data: data || [] }
  },

  async delete_rate_rule_set(db, body) {
    const store = await currentStore(db, { activeOnly: false })
    const id = intParam(body.payroll_rate_rule_set_id, 'payroll_rate_rule_set_id', { min: 1 })
    await ownRuleSet(db, store, id)
    const { data, error } = await db.rpc('delete_payroll_rate_rule_set_basic', { p_payroll_rate_rule_set_id: id })
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
    return errorReply(error, '給与データの取得に失敗しました。')
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
    return errorReply(error, '給与データの保存に失敗しました。')
  }
}
