// 段階2の合格基準 1 の確認：anon キーで PostgREST（/rest/v1/）を呼び、拒否されることを確かめる。
// docs/ops/rls-stage2.sql の「適用後の確認」から使う。
//
// * キーと URL は .env.local の NEXT_PUBLIC_SUPABASE_URL・NEXT_PUBLIC_SUPABASE_ANON_KEY から読む。値は表示しない。
// * 副作用のない呼び出しだけを行う。
//   - 読み取り：GET（1行まで）。表示するのは HTTP の状態と件数だけで、行の内容は表示しない。
//   - 書き込み：存在しない行（主キー = -1、または存在しない文字列）だけを対象にした PATCH と DELETE。
//     2026-11-15 時点で、public のテーブルに文単位のトリガーはなく、0行の更新・削除で動く処理はない。
//     INSERT は、拒否されなかった場合に行が作られるため行わない（権限はカタログで確認する）。
//   - 関数：中身が日付の計算だけの bambi_current_work_date_jst を1つ呼ぶ。ほかの関数は呼ばない
//     （拒否されなかった場合に実行されてしまうため。実行権限はカタログの has_function_privilege で確認する）。
// * 使い方：node tools/rls-stage2-anon-check.mjs            … 結果を表示するだけ
//           node tools/rls-stage2-anon-check.mjs --expect-denied … 1件でも許可されていれば終了コード 1
//   段階2の適用前に実行すると、読み取りは 200 になる（今の状態の記録になる）。
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const base = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!base || !key) { console.error('.env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY が必要です（値は表示しません）'); process.exit(2) }
const expectDenied = process.argv.includes('--expect-denied')

// 2026-11-15 時点で anon が使えたテーブル（29）とビュー（3）。値は主キーの列（ビューは null）
const TABLES = {
  app_settings: 'setting_key', bingo_card_cells: 'bingo_cell_id', bingo_cards: 'card_id', bingo_mark_histories: 'bingo_mark_history_id',
  bingo_product_mappings: 'mapping_id', card_programs: 'program_id', card_types: 'card_type_id', cards: 'card_id',
  employee_profiles: 'employee_id', payroll_monthly_bonus_run_items: 'monthly_bonus_run_item_id', payroll_monthly_bonus_runs: 'monthly_bonus_run_id',
  payroll_period_inputs: 'payroll_period_input_id', payroll_period_summaries: 'payroll_period_summary_id', payroll_periods: 'payroll_period_id',
  payroll_rate_rule_sets: 'payroll_rate_rule_set_id', payroll_rate_rules: 'payroll_rate_rule_id', payroll_run_items: 'payroll_run_item_id',
  ranch_care_events: 'ranch_care_event_id', ranch_month_settings: 'ranch_month_setting_id', ranch_payroll_links: 'ranch_payroll_link_id',
  ranch_profit_entries: 'ranch_profit_entry_id', staff_attendance_events: 'attendance_event_id', staff_stamp_snapshots: 'staff_stamp_snapshot_id',
  staff_work_session_adjustments: 'adjustment_id', staff_work_sessions: 'work_session_id', stamp_cards: 'card_id', stamp_histories: 'stamp_history_id',
  stores: 'store_id', users: 'user_id',
  v_bingo_cards_current: null, v_staff_stamp_cards_current: null, v_stamp_cards_current: null,
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }

async function call(method, path, body) {
  const res = await fetch(`${base}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let code = ''
  try { code = JSON.parse(text)?.code || '' } catch { /* 本文が JSON でない */ }
  let rows = null
  if (method === 'GET' && res.ok) { try { const j = JSON.parse(text); rows = Array.isArray(j) ? j.length : null } catch { /* */ } }
  return { status: res.status, code, rows }
}
// 拒否：401・403、または権限エラー（42501）。存在しない扱い（404・PGRST205 など）も、使えないので拒否として数える
const isDenied = r => r.status === 401 || r.status === 403 || r.code === '42501' || r.status === 404

const out = []
for (const [t, pk] of Object.entries(TABLES)) {
  out.push({ target: t, op: 'GET', ...(await call('GET', `${t}?select=*&limit=1`)) })
  if (pk) {
    const v = pk === 'setting_key' ? '__rls_stage2_probe__' : '-1'
    out.push({ target: t, op: 'PATCH(0行)', ...(await call('PATCH', `${t}?${pk}=eq.${encodeURIComponent(v)}`, { [pk]: pk === 'setting_key' ? v : -1 })) })
    out.push({ target: t, op: 'DELETE(0行)', ...(await call('DELETE', `${t}?${pk}=eq.${encodeURIComponent(v)}`)) })
  }
}
out.push({ target: 'rpc/bambi_current_work_date_jst', op: 'POST', ...(await call('POST', 'rpc/bambi_current_work_date_jst', {})) })

// 428C9（自動採番の主キーは更新できない）は、権限とは別の理由の失敗なので「判定不能」にする。
// その表の書き込み権限は、DELETE の結果とカタログ（has_table_privilege）で判断する。
const isInconclusive = r => r.code === '428C9'

let allowed = 0, unknown = 0
for (const r of out) {
  const label = isDenied(r) ? '拒否' : isInconclusive(r) ? '判定不能' : '許可'
  if (label === '許可') allowed++
  if (label === '判定不能') unknown++
  console.log(`${label.padEnd(4)}  ${r.op.padEnd(11)} ${r.target.padEnd(34)} HTTP ${r.status}${r.code ? ` ${r.code}` : ''}${r.rows !== null ? ` 件数=${r.rows}` : ''}`)
}
console.log(`\n合計 ${out.length} 件：拒否 ${out.length - allowed - unknown}、許可 ${allowed}、判定不能 ${unknown}`)
if (expectDenied && allowed > 0) process.exitCode = 1
