// docs/ops/staff-attendance-negative-guard.sql（record_staff_attendance_event）の回帰テスト。
// PGlite（PostgreSQL・WASM）上の合成データだけを使い、本番には接続しない。
// PGlite は接続が1つのため、同時実行（advisory lock）の検証はできない。ここでは判定の正しさだけを確認する。
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const GUARD = fs.readFileSync(`${REPO}/docs/ops/staff-attendance-negative-guard.sql`, 'utf8')
const ADJUST = fs.readFileSync(`${REPO}/docs/ops/staff-card-adjust-rpc.sql`, 'utf8')

const db = await PGlite.create()
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create table public.users (user_id bigint primary key, store_id bigint, display_name text);
  create table public.employee_profiles (employee_id bigserial, user_id bigint primary key, store_id bigint, staff_code text,
    employee_name text, employment_status text default 'active');
  create table public.staff_attendance_events (
    attendance_event_id bigserial primary key, store_id bigint, user_id bigint, staff_code text, work_date date,
    amount integer, event_type text, source text, note text, acted_by text, created_at timestamptz, updated_at timestamptz);
  insert into public.users values (1, 10, 'a'), (2, 10, 'b');
  insert into public.employee_profiles (user_id, store_id, staff_code) values (1, 10, 'T01'), (2, 10, 'T02');
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

// ---- staff_card_adjust_admin（出勤履歴とカード表示を1トランザクションで更新）----
// increment_stamp_card・reset_stamp_card・bambi_current_work_date_jst・v_staff_stamp_cards_current は、
// 本番の定義（2026-11-15 時点）と同じ処理の写し
await db.exec(`
  create table public.card_programs (program_id bigint primary key, code text);
  create table public.cards (card_id bigint primary key, user_id bigint, program_id bigint, status text, archived_at timestamptz);
  create table public.stamp_cards (card_id bigint primary key, current_count integer, max_count integer, completed_at timestamptz,
    last_stamped_at timestamptz, created_at timestamptz default now(), updated_at timestamptz);
  create table public.stamp_histories (stamp_history_id bigserial primary key, card_id bigint, action_type text, amount integer,
    before_count integer, after_count integer, reason text, acted_by text, acted_at timestamptz);
  create view public.v_staff_stamp_cards_current as
    select c.card_id, c.user_id, ep.employee_id, ep.staff_code, coalesce(ep.employee_name, u.display_name) display_name,
      ep.employment_status, cp.program_id, cp.code program_code, c.status card_status, sc.current_count, sc.max_count,
      sc.completed_at, sc.created_at, sc.updated_at, c.archived_at
    from public.cards c join public.users u on u.user_id = c.user_id join public.stamp_cards sc on sc.card_id = c.card_id
    join public.card_programs cp on cp.program_id = c.program_id join public.employee_profiles ep on ep.user_id = c.user_id
    where cp.code = 'stamp_staff_attendance' and c.status = 'active';
  create function public.bambi_current_work_date_jst() returns date language plpgsql as $f$
    declare v timestamp := timezone('Asia/Tokyo', now()); d date := v::date;
    begin if extract(hour from v) < 4 then d := d - 1; end if; return d; end $f$;
  create function public.increment_stamp_card(p_card_id bigint, p_amount integer, p_acted_by text default null, p_reason text default null)
  returns table(card_id bigint, current_count integer, max_count integer, completed_at timestamptz) language plpgsql as $f$
  declare v_before integer; v_after integer; v_max integer; v_existing timestamptz; v_completed timestamptz;
  begin
    select sc.current_count, sc.max_count, sc.completed_at into v_before, v_max, v_existing from public.stamp_cards sc where sc.card_id = p_card_id for update;
    if not found then raise exception 'stamp card not found: %', p_card_id; end if;
    v_after := greatest(0, least(v_before + p_amount, v_max));
    update public.stamp_cards sc set current_count = v_after, last_stamped_at = now(),
      completed_at = case when v_after >= v_max then coalesce(v_existing, now()) else null end, updated_at = now()
      where sc.card_id = p_card_id returning sc.completed_at into v_completed;
    insert into public.stamp_histories (card_id, action_type, amount, before_count, after_count, reason, acted_by, acted_at)
    values (p_card_id, case when p_amount > 0 then 'add' when p_amount < 0 then 'remove' else 'set' end, p_amount, v_before, v_after, p_reason, p_acted_by, now());
    return query select p_card_id, v_after, v_max, v_completed;
  end $f$;
  create function public.reset_stamp_card(p_card_id bigint, p_acted_by text default null, p_reason text default null)
  returns table(card_id bigint, current_count integer, max_count integer) language plpgsql as $f$
  declare v_before integer; v_max integer;
  begin
    select sc.current_count, sc.max_count into v_before, v_max from public.stamp_cards sc where sc.card_id = p_card_id for update;
    if not found then raise exception 'stamp card not found: %', p_card_id; end if;
    update public.stamp_cards set current_count = 0, completed_at = null, last_stamped_at = now(), updated_at = now() where stamp_cards.card_id = p_card_id;
    insert into public.stamp_histories (card_id, action_type, amount, before_count, after_count, reason, acted_by, acted_at)
    values (p_card_id, 'reset', 0, v_before, 0, p_reason, p_acted_by, now());
    return query select p_card_id, 0, v_max;
  end $f$;
  insert into public.card_programs values (1, 'stamp_staff_attendance');
  insert into public.users values (3, 10, 'c'), (4, 20, 'd'), (5, 10, 'e');
  insert into public.employee_profiles (user_id, store_id, staff_code, employment_status) values
    (3, 10, 'T03', 'active'), (4, 20, 'U04', 'active'), (5, 10, 'T05', 'retired');
  insert into public.cards values (30, 3, 1, 'active', null), (40, 4, 1, 'active', null), (50, 5, 1, 'active', null);
  insert into public.stamp_cards (card_id, current_count, max_count) values (30, 1, 15), (40, 0, 15), (50, 0, 15);
`)
await db.exec(ADJUST)

const adj = async (store, user, action) => {
  try {
    const r = await db.query(`select * from public.staff_card_adjust_admin($1, $2, $3, 'test')`, [store, user, action])
    return r.rows[0]
  } catch (e) { return { error: e.message } }
}
const today = (await db.query(`select public.bambi_current_work_date_jst()::text d`)).rows[0].d
const monthStart = today.slice(0, 8) + '01'
const monthEnd = (await db.query(`select (date_trunc('month', $1::date) + interval '1 month - 1 day')::date::text d`, [today])).rows[0].d
const state = async (user, card) => ({
  total: await total(user, monthStart, monthEnd),
  card: Number((await db.query(`select current_count c from public.stamp_cards where card_id=$1`, [card])).rows[0].c),
  hist: Number((await db.query(`select count(*)::int n from public.stamp_histories where card_id=$1`, [card])).rows[0].n),
})

// 繰り越し表示 1（今月の出勤履歴 0）の従業員カード 30
{
  const before = await state(3, 30)
  const r = await adj(10, 3, 'remove')
  const after = await state(3, 30)
  check('11 adjust：今月 0 回での -1 は拒否し、出勤履歴もカードも変えない（1トランザクション）',
    !!r.error && r.error.includes('0未満') && JSON.stringify(before) === JSON.stringify(after), r.error)
}
{
  const r = await adj(10, 3, 'reset')
  const s1 = await state(3, 30)
  const ev = (await db.query(`select amount, event_type from public.staff_attendance_events where user_id=3 order by attendance_event_id desc limit 1`)).rows[0]
  check('12 adjust：リセットはカード表示だけ 0、出勤履歴は 0 を記録（合計は変わらない）',
    !r.error && s1.card === 0 && s1.total === 0 && ev.amount === 0 && ev.event_type === 'reset_adjust', r.error)
}
{
  const r = await adj(10, 3, 'add')
  const s1 = await state(3, 30)
  check('13 adjust：+1 で出勤履歴とカードが両方 +1、work_date は DB の営業日',
    !r.error && s1.card === 1 && s1.total === 1 && String(r.work_date).length > 0 && Number(r.attendance_event_id) > 0, r.error)
  const r2 = await adj(10, 3, 'remove')
  const s2 = await state(3, 30)
  check('14 adjust：月内の訂正 -1 は両方 -1', !r2.error && s2.card === 0 && s2.total === 0, r2.error)
}
{
  const r = await adj(10, 4, 'add')
  check('15 adjust：他店舗の従業員は拒否', !!r.error && r.error.includes('見つかりません'), r.error)
  const r2 = await adj(10, 5, 'add')
  check('16 adjust：退職済みは拒否', !!r2.error && r2.error.includes('退職済み'), r2.error)
  const r3 = await adj(10, 3, 'set')
  check('17 adjust：不正な操作名は拒否', !!r3.error && r3.error.includes('操作'), r3.error)
}
{
  // カード表示の更新（出勤履歴の記録の後）が失敗したら、出勤履歴の +1 も取り消される
  await db.exec(`
    alter function public.increment_stamp_card(bigint, integer, text, text) rename to increment_stamp_card_orig;
    create function public.increment_stamp_card(p_card_id bigint, p_amount integer, p_acted_by text default null, p_reason text default null)
    returns table(card_id bigint, current_count integer, max_count integer, completed_at timestamptz)
    language plpgsql as $f$ begin raise exception '検証用の失敗（カード更新）'; end $f$;`)
  const before = await state(3, 30)
  const evBefore = await rows()
  const r = await adj(10, 3, 'add')
  const after = await state(3, 30)
  check('18 adjust：カード更新が失敗すると、先に記録した出勤履歴の +1 も取り消される',
    !!r.error && r.error.includes('検証用の失敗') && await rows() === evBefore && JSON.stringify(before) === JSON.stringify(after), r.error)
  await db.exec(`
    drop function public.increment_stamp_card(bigint, integer, text, text);
    alter function public.increment_stamp_card_orig(bigint, integer, text, text) rename to increment_stamp_card;`)
}
{
  const acl = (await db.query(`select proacl::text a from pg_proc where proname='staff_card_adjust_admin'`)).rows[0].a
  check('19 adjust：実行権限は service_role だけ（PUBLIC・anon・authenticated なし）',
    acl.includes('service_role=X') && !/(^|[{,])=X/.test(acl) && !acl.includes('anon=') && !acl.includes('authenticated='), acl)
}

const failed = results.filter(x => !x).length
console.log(`\n${results.length - failed}/${results.length} PASS`)
await db.close()
process.exitCode = failed ? 1 : 0
