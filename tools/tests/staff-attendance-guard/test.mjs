// docs/ops/staff-attendance-negative-guard.sql（record_staff_attendance_event）の回帰テスト。
// PGlite（PostgreSQL・WASM）上の合成データだけを使い、本番には接続しない。
// PGlite は接続が1つのため、同時実行（advisory lock）の検証はできない。ここでは判定の正しさだけを確認する。
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const GUARD = fs.readFileSync(`${REPO}/docs/ops/staff-attendance-negative-guard.sql`, 'utf8')

const db = await PGlite.create()
await db.exec(`
  create table public.users (user_id bigint primary key, store_id bigint);
  create table public.employee_profiles (user_id bigint primary key, staff_code text);
  create table public.staff_attendance_events (
    attendance_event_id bigserial primary key, store_id bigint, user_id bigint, staff_code text, work_date date,
    amount integer, event_type text, source text, note text, acted_by text, created_at timestamptz, updated_at timestamptz);
  insert into public.users values (1, 10), (2, 10);
  insert into public.employee_profiles values (1, 'T01'), (2, 'T02');
`)
await db.exec(GUARD)

const rec = async (user, date, amount, type = 'work') => {
  try {
    await db.query(`select * from public.record_staff_attendance_event($1, $2::date, $3, $4, 'test', null, 'test')`, [user, date, amount, type])
    return 'ok'
  } catch (e) { return 'ERR ' + e.message }
}
const total = async (user, from, to) =>
  Number((await db.query(`select coalesce(sum(amount),0)::int t from public.staff_attendance_events where user_id=$1 and work_date between $2 and $3`, [user, from, to])).rows[0].t)
const rows = async () => Number((await db.query(`select count(*)::int n from public.staff_attendance_events`)).rows[0].n)

const results = []
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

console.log('version():', (await db.query('select version()')).rows[0].version)

// 1. 通常の +1 と、月内の訂正（-1）は従来どおり
check('1 +1（出勤）', await rec(1, '2026-10-18', 1) === 'ok')
check('2 0（リセットの記録）', await rec(1, '2026-10-20', 0, 'reset_adjust') === 'ok')
check('3 月内の訂正 -1（合計 1→0）', await rec(1, '2026-10-25', -1, 'adjust_minus') === 'ok' && await total(1, '2026-10-01', '2026-10-31') === 0)

// 2. 合計が 0 未満になる減算は拒否し、行を追加しない
{
  const before = await rows()
  const r = await rec(1, '2026-10-26', -1, 'adjust_minus')
  check('4 合計 0 の月の -1 は拒否', r.startsWith('ERR') && r.includes('0未満') && await rows() === before, r)
}

// 3. 月の境目：前月の合計があっても、当月が 0 なら当月付けの -1 は拒否（2026-11-01 の事例）
{
  await rec(2, '2026-10-18', 1)
  const nov = await rec(2, '2026-11-01', -1, 'adjust_minus')
  check('5 前月 1・当月 0 で、当月付けの -1 は拒否', nov.startsWith('ERR') && await total(2, '2026-11-01', '2026-11-30') === 0, nov)
  const oct = await rec(2, '2026-10-31', -1, 'adjust_minus')
  check('6 同じ従業員の前月付けの -1（前月の合計 1）は可', oct === 'ok' && await total(2, '2026-10-01', '2026-10-31') === 0)
}

// 4. 補正：+1 の後なら -1 も可（合計がちょうど 0 まで）
{
  await rec(2, '2026-11-15', 1)
  check('7 当月 +1 の後の -1 は可（1→0）', await rec(2, '2026-11-20', -1, 'adjust_minus') === 'ok' && await total(2, '2026-11-01', '2026-11-30') === 0)
  check('8 続けての -1 は拒否（0→-1）', (await rec(2, '2026-11-21', -1, 'adjust_minus')).startsWith('ERR'))
}

// 5. 他の従業員の合計に影響されない
check('9 他の従業員の月合計とは独立', (await rec(1, '2026-11-02', -1, 'adjust_minus')).startsWith('ERR'))

// 6. 既存の検証（user_id・work_date 必須）は維持
check('10 user_id なしは従来どおりエラー', (await rec(null, '2026-11-02', 1)).includes('user_id is required'))

const failed = results.filter(x => !x).length
console.log(`\n${results.length - failed}/${results.length} PASS`)
await db.close()
process.exitCode = failed ? 1 : 0
