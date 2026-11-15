import {
  adminDB,
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

  // 月次給与（/admin/staff/payroll/monthly）。店舗は status を問わない（従来どおり）。
  async monthly(db, q) {
    const year = intParam(q.get('year'), 'year', { min: 2000, max: 2100 })
    const month = intParam(q.get('month'), 'month', { min: 1, max: 12 })
    const store = await currentStore(db, { activeOnly: false })

    const { data: periods, error: periodError } = await db
      .from('payroll_periods')
      .select('payroll_period_id, target_year, target_month, half_type, period_start, period_end, payday, status, store_id')
      .eq('store_id', store.store_id)
      .eq('target_year', year)
      .eq('target_month', month)
      .order('period_start', { ascending: true })
    if (periodError) throw periodError

    const empty = { periods: periods || [], run_items: [], summaries: [], inputs: [] }
    if (!periods?.length) return empty
    const ids = periods.map(p => p.payroll_period_id)

    const [items, summaries, inputs] = await Promise.all([
      db
        .from('payroll_run_items')
        .select('payroll_run_item_id, payroll_period_id, user_id, staff_code, display_name, attendance_count, stamp_count_at_close, applied_unit_pay, calculated_pay_amount, transfer_amount, adjustment_amount, note, is_locked, store_id')
        .in('payroll_period_id', ids)
        .order('staff_code', { ascending: true }),
      db
        .from('payroll_period_summaries')
        .select('payroll_period_summary_id, payroll_period_id, total_pay_amount, total_transfer_amount, total_adjustment_amount, ranch_profit_amount, vault_before_amount, vault_plus_ranch_amount, vault_after_amount, store_profit_amount, total_profit_amount, memo, store_id')
        .in('payroll_period_id', ids)
        .order('payroll_period_summary_id', { ascending: false }),
      db
        .from('payroll_period_inputs')
        .select('payroll_period_input_id, payroll_period_id, payroll_rate_rule_set_id, sales_amount, ranch_profit_amount, vault_before_amount, extra_income_amount, memo, store_id')
        .in('payroll_period_id', ids)
        .order('payroll_period_input_id', { ascending: false }),
    ])
    for (const r of [items, summaries, inputs]) if (r.error) throw r.error

    return { periods, run_items: items.data || [], summaries: summaries.data || [], inputs: inputs.data || [] }
  },

  // 単価ルール（/admin/staff/payroll/rate-rules）。ルールセットとその明細。
  async rate_rules(db) {
    const store = await currentStore(db, { activeOnly: false })
    const { data: sets, error } = await db
      .from('payroll_rate_rule_sets')
      .select('payroll_rate_rule_set_id, store_id, rule_name, effective_from, effective_to, is_active, note, created_at, updated_at')
      .eq('store_id', store.store_id)
      .order('is_active', { ascending: false })
      .order('effective_from', { ascending: false })
      .order('payroll_rate_rule_set_id', { ascending: false })
    if (error) throw error

    let rules = []
    if (sets?.length) {
      const { data, error: rulesError } = await db
        .from('payroll_rate_rules')
        .select('payroll_rate_rule_id, payroll_rate_rule_set_id, min_stamp_count, max_stamp_count, unit_pay, created_at')
        .in('payroll_rate_rule_set_id', sets.map(s => s.payroll_rate_rule_set_id))
        .order('min_stamp_count', { ascending: true })
      if (rulesError) throw rulesError
      rules = data || []
    }
    return { rule_sets: sets || [], rules }
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
    return reply(await view(adminDB(), q))
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
