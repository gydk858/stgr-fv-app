// 給与管理（/admin/staff/payroll）の読み取りと保存。/api/admin-payroll から使う。
// 店舗はサーバーが current_store_code から決める（給与管理は従来どおり店舗の status を問わない）。
// 給与期間・単価ルール・明細は、現在の店舗のものかを確認してから読み書きする。
import { currentStore, intParam, InputError } from './admin-server'

const BIGINT_MAX = Number.MAX_SAFE_INTEGER
const isMonthlyBonus = value => String(value || '').trim().toLowerCase() === 'monthly_bonus' // 画面の normalizeHalfType と同じ判定
const pad = n => String(n).padStart(2, '0')
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const amount = (value, name) => intParam(value, name, { min: -BIGINT_MAX, max: BIGINT_MAX })
const memoParam = value => (typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 2000) : null)
const yearMonth = src => ({
  year: intParam(src.year, 'year', { min: 2000, max: 2100 }),
  month: intParam(src.month, 'month', { min: 1, max: 12 }),
})
const payrollStore = (db, timing) => currentStore(db, { activeOnly: false, timing })

const PERIOD_COLUMNS = 'payroll_period_id, target_year, target_month, half_type, period_start, period_end, payday, status, store_id'

async function ownPeriod(db, store, periodId) {
  const { data, error } = await db.from('payroll_periods').select(PERIOD_COLUMNS)
    .eq('payroll_period_id', periodId).eq('store_id', store.store_id).maybeSingle()
  if (error) throw error
  if (!data) throw new InputError('対象の給与期間が見つかりません。')
  return data
}

async function ownRuleSet(db, store, ruleSetId) {
  if (ruleSetId === null) return null
  const { data, error } = await db.from('payroll_rate_rule_sets').select('payroll_rate_rule_set_id')
    .eq('payroll_rate_rule_set_id', ruleSetId).eq('store_id', store.store_id).maybeSingle()
  if (error) throw error
  if (!data) throw new InputError('対象の単価ルールが見つかりません。')
  return ruleSetId
}

const periodIdParam = value => intParam(value, 'payroll_period_id', { min: 1 })
const optionalRuleSetId = value =>
  value === null || value === undefined || value === '' ? null : intParam(value, 'payroll_rate_rule_set_id', { min: 1 })

export const payrollViews = {
  // 初期表示：店舗、有効な単価ルール（明細つき）、従業員（現在の店舗）
  async payroll_context(db, q, timing) {
    const store = await payrollStore(db, timing)
    const [sets, employees] = await timing.measure('db', Promise.all([
      db.from('payroll_rate_rule_sets')
        .select('payroll_rate_rule_set_id, store_id, rule_name, effective_from, effective_to, is_active, note, payroll_rate_rules(payroll_rate_rule_id, payroll_rate_rule_set_id, min_stamp_count, max_stamp_count, unit_pay)')
        .eq('store_id', store.store_id).eq('is_active', true)
        .order('effective_from', { ascending: false }).order('payroll_rate_rule_set_id', { ascending: false }),
      db.from('employee_profiles').select('user_id, staff_code, employee_name, employment_status')
        .eq('store_id', store.store_id).order('staff_code', { ascending: true }),
    ]))
    if (sets.error) throw sets.error
    if (employees.error) throw employees.error
    const rule_sets = (sets.data || []).map(({ payroll_rate_rules, ...set }) => ({
      ...set,
      rules: (payroll_rate_rules || []).slice().sort((a, b) =>
        Number(a.min_stamp_count) - Number(b.min_stamp_count) || Number(a.payroll_rate_rule_id) - Number(b.payroll_rate_rule_id)),
    }))
    return { store, rule_sets, employees: employees.data || [] }
  },

  async periods(db, q, timing) {
    const { year, month } = yearMonth({ year: q.get('year'), month: q.get('month') })
    const store = await payrollStore(db, timing)
    const { data, error } = await timing.measure('db', db.from('payroll_periods').select(PERIOD_COLUMNS)
      .eq('store_id', store.store_id).eq('target_year', year).eq('target_month', month)
      .order('period_start', { ascending: true }))
    if (error) throw error
    return { store, periods: data || [] }
  },

  async run_items(db, q, timing) {
    const store = await payrollStore(db, timing)
    const period = await ownPeriod(db, store, periodIdParam(q.get('payroll_period_id')))
    const { data, error } = await timing.measure('db', db.from('payroll_run_items')
      .select('payroll_run_item_id, payroll_period_id, user_id, staff_code, display_name, attendance_count, stamp_count_at_close, applied_unit_pay, calculated_pay_amount, transfer_amount, adjustment_amount, note, is_locked, store_id')
      .eq('payroll_period_id', period.payroll_period_id).order('staff_code', { ascending: true }))
    if (error) throw error
    return { run_items: data || [] }
  },

  // 金庫・牧場・備考：前回の支払い後金庫額、入力値（最新）、集計（最新）、牧場からの反映（最新）
  async inputs_summary(db, q, timing) {
    const store = await payrollStore(db, timing)
    const period = await ownPeriod(db, store, periodIdParam(q.get('payroll_period_id')))
    const id = period.payroll_period_id
    const [previous, input, summary, link] = await timing.measure('db', Promise.all([
      db.rpc('get_previous_payroll_vault_after', { p_payroll_period_id: id }),
      db.from('payroll_period_inputs')
        .select('payroll_period_input_id, payroll_period_id, payroll_rate_rule_set_id, sales_amount, ranch_profit_amount, vault_before_amount, extra_income_amount, memo, store_id')
        .eq('payroll_period_id', id).order('payroll_period_input_id', { ascending: false }).limit(1).maybeSingle(),
      db.from('payroll_period_summaries')
        .select('payroll_period_summary_id, payroll_period_id, total_pay_amount, total_transfer_amount, total_adjustment_amount, ranch_profit_amount, vault_before_amount, vault_plus_ranch_amount, vault_after_amount, store_profit_amount, total_profit_amount, memo, store_id')
        .eq('payroll_period_id', id).order('payroll_period_summary_id', { ascending: false }).limit(1).maybeSingle(),
      db.from('ranch_payroll_links')
        .select('ranch_payroll_link_id, payroll_period_id, store_id, target_year, target_month, half_type, period_start, period_end, ranch_profit_amount, applied_at, applied_by, memo')
        .eq('payroll_period_id', id).order('applied_at', { ascending: false }).limit(1).maybeSingle(),
    ]))
    // 前回金庫額と牧場の反映は、取得に失敗しても画面は初期値で続ける（従来どおり）
    if (input.error) throw input.error
    if (summary.error) throw summary.error
    return {
      previous: previous.error ? { error: previous.error.message } : (Array.isArray(previous.data) ? previous.data[0] || null : null),
      input: input.data || null,
      summary: summary.data || null,
      ranch_link: link.error ? null : link.data || null,
    }
  },

  // 牧場のお世話（期間内）と、その月の単価
  async ranch_care(db, q, timing) {
    const store = await payrollStore(db, timing)
    const period = await ownPeriod(db, store, periodIdParam(q.get('payroll_period_id')))
    const [setting, events] = await timing.measure('db', Promise.all([
      db.from('ranch_month_settings').select('unit_care_pay')
        .eq('store_id', store.store_id).eq('target_year', period.target_year).eq('target_month', period.target_month).maybeSingle(),
      db.from('ranch_care_events')
        .select('ranch_care_event_id, store_id, user_id, target_year, target_month, care_date, care_count, note')
        .eq('store_id', store.store_id).gte('care_date', String(period.period_start).slice(0, 10)).lte('care_date', String(period.period_end).slice(0, 10))
        .order('care_date', { ascending: true }),
    ]))
    if (events.error) throw events.error
    return { unit_care_pay: setting.error ? null : setting.data?.unit_care_pay ?? null, care_events: events.data || [] }
  },

  // 加算時間（月内の勤務セッション。現在の店舗の従業員だけ）
  async work_sessions(db, q, timing) {
    const { year, month } = yearMonth({ year: q.get('year'), month: q.get('month') })
    const store = await payrollStore(db, timing)
    const { data: staff, error: staffError } = await db.from('employee_profiles').select('user_id').eq('store_id', store.store_id)
    if (staffError) throw staffError
    const ids = (staff || []).map(s => s.user_id)
    if (!ids.length) return { work_sessions: [] }
    const { data, error } = await timing.measure('db', db.from('staff_work_sessions')
      .select('work_session_id, user_id, staff_code, work_date, bonus_eligible_minutes, status')
      .in('user_id', ids)
      .gte('work_date', `${year}-${pad(month)}-01`).lte('work_date', `${year}-${pad(month)}-${pad(lastDay(year, month))}`)
      .order('work_date', { ascending: true }).order('staff_code', { ascending: true }))
    if (error) throw error
    return { work_sessions: data || [] }
  },

  // 月末ボーナスの保存情報と配分明細
  async monthly_bonus(db, q, timing) {
    const store = await payrollStore(db, timing)
    const period = await ownPeriod(db, store, periodIdParam(q.get('payroll_period_id')))
    const { data: run, error } = await timing.measure('db', db.from('payroll_monthly_bonus_runs')
      .select('monthly_bonus_run_id, payroll_period_id, bonus_pool_amount, total_bonus_eligible_minutes, eligible_employee_count, total_distributed_amount, previous_vault_after_amount, vault_after_amount, memo, status')
      .eq('payroll_period_id', period.payroll_period_id).maybeSingle())
    if (error) throw error
    if (!run) return { run: null, items: [] }
    const { data: items, error: itemError } = await db.from('payroll_monthly_bonus_run_items')
      .select('monthly_bonus_run_item_id, monthly_bonus_run_id, payroll_period_id, user_id, staff_code, display_name, bonus_eligible_minutes, allocation_ratio, bonus_amount')
      .eq('monthly_bonus_run_id', run.monthly_bonus_run_id).order('staff_code', { ascending: true })
    if (itemError) return { run, items: [], items_error: itemError.message }
    return { run, items: items || [] }
  },
}

export const payrollActions = {
  async create_periods(db, body) {
    const { year, month } = yearMonth(body)
    const store = await payrollStore(db)
    const { error } = await db.rpc('create_payroll_periods_for_month', {
      p_store_code: store.store_code,
      p_target_year: year,
      p_target_month: month,
      p_first_payday: `${year}-${pad(month)}-15`,
      p_second_payday: `${year}-${pad(month)}-${pad(lastDay(year, month))}`,
    })
    if (error) throw error
    return { ok: true }
  },

  // 単価ルールの選択を保存してから、履歴で給与プレビューを作る（従来と同じ順）
  async build_preview(db, body) {
    const store = await payrollStore(db)
    const period = await ownPeriod(db, store, periodIdParam(body.payroll_period_id))
    const ruleSetId = await ownRuleSet(db, store, intParam(body.payroll_rate_rule_set_id, 'payroll_rate_rule_set_id', { min: 1 }))
    const { error: saveError } = await db.rpc('save_payroll_period_rate_rule_selection', {
      p_payroll_period_id: period.payroll_period_id,
      p_payroll_rate_rule_set_id: ruleSetId,
    })
    if (saveError) throw saveError
    const { error } = await db.rpc('build_payroll_run_preview_from_history', {
      p_payroll_period_id: period.payroll_period_id,
      p_payroll_rate_rule_set_id: ruleSetId,
    })
    if (error) throw error
    return { ok: true }
  },

  async save_inputs(db, body) {
    const store = await payrollStore(db)
    const period = await ownPeriod(db, store, periodIdParam(body.payroll_period_id))
    const ruleSetId = await ownRuleSet(db, store, optionalRuleSetId(body.payroll_rate_rule_set_id))
    const { error } = await db.rpc('save_payroll_period_inputs_and_summary', {
      p_payroll_period_id: period.payroll_period_id,
      p_payroll_rate_rule_set_id: ruleSetId,
      p_sales_amount: amount(body.sales_amount, '前回の支払い後金庫額'),
      p_ranch_profit_amount: amount(body.ranch_profit_amount, '牧場利益'),
      p_vault_before_amount: amount(body.vault_before_amount, '今回の支払い前金庫額'),
      p_extra_income_amount: amount(body.extra_income_amount, 'その他の収入'),
      p_memo: memoParam(body.memo),
    })
    if (error) throw error
    return { ok: true }
  },

  async save_bonus(db, body) {
    const store = await payrollStore(db)
    const period = await ownPeriod(db, store, periodIdParam(body.payroll_period_id))
    if (!isMonthlyBonus(period.half_type)) throw new InputError('月末ボーナス期間を選択してください。')
    const pool = intParam(body.bonus_pool_amount, '月末ボーナス原資', { min: 0, max: BIGINT_MAX })
    const { data, error } = await db.rpc('save_monthly_bonus_distribution', {
      p_payroll_period_id: period.payroll_period_id,
      p_bonus_pool_amount: pool,
      p_memo: memoParam(body.memo),
      p_acted_by: 'admin_payroll_ui',
    })
    if (error) throw error
    return { data: data || [] }
  },

  async update_adjustment(db, body) {
    const itemId = intParam(body.payroll_run_item_id, 'payroll_run_item_id', { min: 1 })
    const store = await payrollStore(db)
    const { data: item, error: itemError } = await db.from('payroll_run_items').select('payroll_run_item_id, payroll_period_id')
      .eq('payroll_run_item_id', itemId).eq('store_id', store.store_id).maybeSingle()
    if (itemError) throw itemError
    if (!item) throw new InputError('対象の給与明細が見つかりません。')
    await ownPeriod(db, store, item.payroll_period_id)
    const { error } = await db.rpc('update_payroll_run_item_adjustment', {
      p_payroll_run_item_id: itemId,
      p_adjustment_amount: amount(body.adjustment_amount, '調整額'),
      p_note: memoParam(body.note),
    })
    if (error) throw error
    return { ok: true }
  },

  async lock_period(db, body) {
    const store = await payrollStore(db)
    const period = await ownPeriod(db, store, periodIdParam(body.payroll_period_id))
    const { data, error } = await db.rpc('lock_payroll_period_admin', {
      p_payroll_period_id: period.payroll_period_id,
      p_locked_by: 'admin_payroll_ui',
    })
    if (error) throw error
    return { data: data || [] }
  },

  async unlock_period(db, body) {
    const store = await payrollStore(db)
    const period = await ownPeriod(db, store, periodIdParam(body.payroll_period_id))
    const { data, error } = await db.rpc('unlock_payroll_period_admin', {
      p_payroll_period_id: period.payroll_period_id,
      p_unlocked_by: 'admin_payroll_ui',
    })
    if (error) throw error
    return { data: data || [] }
  },
}
