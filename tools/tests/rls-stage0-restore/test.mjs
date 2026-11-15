// 段階0の前進 SQL（docs/ops/rls-stage0.sql）と復元 SQL（docs/ops/rls-stage0-restore.sql）を、
// PGlite（PostgreSQL 18.6・WASM）上の合成データで通しで検証する回帰テスト。
// 本番の Supabase には接続しない。本番のスナップショットの実データも使わない。
// 実行方法と期待結果は README.md を参照。
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// リポジトリのルート（このファイルは tools/tests/rls-stage0-restore/ にある）
const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const FORWARD = fs.readFileSync(`${REPO}/docs/ops/rls-stage0.sql`, 'utf8')
const RESTORE = fs.readFileSync(`${REPO}/docs/ops/rls-stage0-restore.sql`, 'utf8')

const FUNCS = [
  'reset_system_runtime_data(text,text)', 'reset_all_stamp_cards(text,text)', 'reset_all_bingo_cards(text,text)',
  'reset_regular_customer_stamp_cards(text,text)', 'archive_active_stamp_cards(text,text)',
  'archive_active_bingo_cards(text,text)', 'staff_clock_in(bigint,text,text,text)',
  'staff_clock_out(bigint,text,text,text)', 'staff_fix_work_session(bigint,date,text,text,text,text,text)',
  'snapshot_staff_stamps_for_period(bigint)', 'build_payroll_run_preview(bigint,bigint)',
  'upsert_ranch_care_event(bigint,bigint,date,integer,text,text)',
]
const OTHER_FUNC = 'get_payroll_history_matrix(integer)' // 段階0の対象外
const SCOPE5 = ['users_backup_before_stamp_migration_20260413', 'users_backup_before_drop_stamp_count_20260413',
  'users_backup_before_drop_legacy_columns_20260413', 'stamp_migration_map', 'card_templates']
const NORMAL = ['users', 'stores', 'payroll_periods']
const ITO = ['ito_issue_log', 'ito_issue_state', 'ito_topics']

async function fixture(variant = {}) {
  const db = await PGlite.create()
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema ops;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, name text);
    insert into supabase_migrations.schema_migrations values
      ('20261114224036','hunter_print_dispatch_function'),
      ('20261114225226','rls_stage0_revoke_unused_anon_privileges');
  `)
  for (const f of [...FUNCS, OTHER_FUNC]) {
    const [name, args] = f.split('(')
    await db.exec(`create function public.${name}(${args} returns void language sql as $$ select $$;`)
    if (!(variant.nullAclFunc === f)) {
      await db.exec(`grant execute on function public.${f} to anon, authenticated, service_role;`)
    }
  }
  for (const t of [...NORMAL, ...SCOPE5, ...ITO, 'bambi_hunters']) {
    await db.exec(`create table public.${t} (id int);`)
    if (t === 'bambi_hunters') await db.exec(`grant all on public.${t} to service_role;`)
    else if (variant.nullAclTable === t) { /* ACL を NULL のまま */ }
    else await db.exec(`grant all on public.${t} to anon, authenticated, service_role;`)
  }
  await db.exec(`create view public.v_users as select * from public.users;
                 grant all on public.v_users to anon, authenticated, service_role;
                 alter table public.users enable row level security;`)
  if (variant.setup) await db.exec(variant.setup)
  return db
}

// 正規化した ACL 明細と RLS（public のテーブル・ビュー・関数すべて）
async function capture(db) {
  const acl = await db.query(`
    select 'relation' kind, c.relname obj,
      case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end grantee,
      a.privilege_type priv, a.is_grantable grantable, a.grantor::regrole::text grantor
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'public' and c.relkind in ('r','p','v','m')
    union all
    select 'function', p.oid::regprocedure::text,
      case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end,
      a.privilege_type, a.is_grantable, a.grantor::regrole::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'public'
    order by 1,2,3,4,5`)
  const rls = await db.query(`select c.relname obj, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') order by 1`)
  return { acl: acl.rows.map(r => `${r.kind}|${r.obj}|${r.grantee}|${r.priv}|${r.grantable}|${r.grantor}`),
           rls: rls.rows.map(r => `${r.obj}|${r.rls}`) }
}
// 永続的なカタログ（pg_temp 以外）の指紋
async function catalog(db) {
  const r = await db.query(`
    select string_agg(x, E'\n' order by x) s from (
      select format('ns %s', nspname) x from pg_namespace where nspname !~ '^pg_(toast_)?temp'
      union all
      select format('rel %s.%s %s %s %s', n.nspname, c.relname, c.relkind, c.relacl, c.relrowsecurity)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_(toast_)?temp'
      union all
      select format('fn %s %s', p.oid::regprocedure, p.proacl)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname !~ '^pg_(toast_)?temp'
      union all
      select format('row %s', s::text) from ops.acl_snapshot_stage0 s
    ) t`)
  return r.rows[0].s
}
function diff(a, b) {
  const A = new Set(a), B = new Set(b)
  return { onlyBefore: a.filter(x => !B.has(x)), onlyAfter: b.filter(x => !A.has(x)) }
}
function same(a, b) {
  const d1 = diff(a.acl, b.acl), d2 = diff(a.rls, b.rls)
  return { ok: !d1.onlyBefore.length && !d1.onlyAfter.length && !d2.onlyBefore.length && !d2.onlyAfter.length, acl: d1, rls: d2 }
}
const withoutIto = c => ({ acl: c.acl.filter(x => !ITO.some(t => x.includes(`|${t}|`))), rls: c.rls.filter(x => !ITO.some(t => x.startsWith(`${t}|`))) })

async function stage0(db) {
  await db.exec(FORWARD)
}
async function dropIto(db) {
  await db.exec(`drop table public.ito_issue_log, public.ito_issue_state, public.ito_topics;
    insert into supabase_migrations.schema_migrations values ('20261114232439','drop_unused_ito_tables');`)
}
async function plan(db, at = null) {
  const res = await db.exec(RESTORE) // 計画表示まで（実行行はコメント）
  const head = res[res.length - 2].rows[0]
  const rows = (await db.query(`select * from pg_temp.stage0_restore_plan($1)`, [at])).rows
  const hash = (await db.query(`select pg_temp.stage0_restore_plan_hash(pg_temp.stage0_snapshot_resolve($1)) h`, [at])).rows[0].h
  const at2 = (await db.query(`select pg_temp.stage0_snapshot_resolve($1)::text t`, [at])).rows[0].t
  return { head, rows, hash, at: at2, count: s => rows.filter(r => r.severity === s).length }
}
async function execute(db, at, hash) {
  try {
    const r = await db.query(`select pg_temp.stage0_restore_execute($1, $2) n`, [at, hash])
    return { ok: true, n: r.rows[0].n }
  } catch (e) { return { ok: false, error: e.message } }
}

const results = []
function record(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

// ケースの共通の流れ：変更前 → 段階0 → ito 削除 → 計画 → 実行 → 比較
async function roundTrip(name, variant, check) {
  const db = await fixture(variant)
  const before = withoutIto(await capture(db))
  await stage0(db)
  await dropIto(db)
  const post = await capture(db)
  const cat0 = await catalog(db)
  const p = await plan(db)
  const cat1 = await catalog(db)
  const ex = await execute(db, p.at, p.hash)
  const after = await capture(db)
  const s = same(before, after)
  const pass = cat0 === cat1 && p.count('block') === 0 && ex.ok && s.ok && (!check || check({ before, post, after, p, db }))
  record(name, pass, `restore=${p.count('restore')} block=${p.count('block')} info=${p.count('info')} executed=${ex.ok ? ex.n : ex.error} 計画表示でカタログ不変=${cat0 === cat1} 変更前と一致=${s.ok}` +
    (s.ok ? '' : ` 差分=${JSON.stringify(s)}`))
  return { db, before, post, after, p }
}

const version = (await (await PGlite.create()).query('select version()')).rows[0].version
console.log('PGlite:', JSON.parse(fs.readFileSync(new URL('./node_modules/@electric-sql/pglite/package.json', import.meta.url))).version)
console.log('version():', version)

// 1. 通常
const base = await roundTrip('1 通常：変更前→段階0→復元で ACL・RLS が一致', {}, ({ p }) =>
  p.rows.filter(r => r.category === 'missing' && r.severity === 'info').length === 3)

// 2. PUBLIC・anon・authenticated が異なる
await roundTrip('2 PUBLIC・anon・authenticated の権限が異なる', { setup: `
  revoke execute on function public.staff_clock_in(bigint,text,text,text) from public, authenticated;
  revoke execute on function public.staff_clock_out(bigint,text,text,text) from anon, authenticated;
  revoke insert, update, delete, truncate, trigger, references, maintain on public.stores from anon;
  revoke all on public.payroll_periods from anon;
  revoke select on public.stamp_migration_map from authenticated;
  grant select on public.bambi_hunters to authenticated;` }, ({ after }) =>
  after.acl.some(x => x.startsWith('function|staff_clock_out(bigint,text,text,text)|PUBLIC|EXECUTE')) &&
  !after.acl.some(x => x.startsWith('function|staff_clock_out(bigint,text,text,text)|anon|')) &&
  !after.acl.some(x => x.startsWith('relation|payroll_periods|anon|')))

// 3. WITH GRANT OPTION
await roundTrip('3 WITH GRANT OPTION のある権限', { setup: `
  grant select, truncate on public.users to anon with grant option;
  grant select, references on public.card_templates to authenticated with grant option;
  grant execute on function public.reset_all_bingo_cards(text,text) to authenticated with grant option;` }, ({ after }) =>
  after.acl.includes('relation|users|anon|TRUNCATE|true|postgres') &&
  after.acl.includes('relation|card_templates|authenticated|REFERENCES|true|postgres') &&
  after.acl.includes('function|reset_all_bingo_cards(text,text)|authenticated|EXECUTE|true|postgres'))

// 4. ACL が NULL
{
  const r = await roundTrip('4 ACL が NULL（関数・段階0対象テーブル）',
    { nullAclFunc: 'upsert_ranch_care_event(bigint,bigint,date,integer,text,text)', nullAclTable: 'card_templates' })
  const raw = (await r.db.query(`select proacl::text a from pg_proc where proname='upsert_ranch_care_event'`)).rows[0].a
  record('4b ACL が NULL：生の ACL は NULL ではなく明示形式で戻る（意味は同じ）', true, `復元後の proacl=${raw}`)
}

// 5. 削除済みオブジェクト
{
  const db = await fixture()
  await stage0(db); await dropIto(db)
  await db.exec(`drop table public.stores; drop function public.staff_clock_in(bigint,text,text,text);`)
  const post = await capture(db)
  const p = await plan(db)
  const ex = await execute(db, p.at, p.hash)
  const after = await capture(db)
  const missing = p.rows.filter(r => r.category === 'missing')
  record('5 削除済み：ito_* は info（既知の除外）、想定外の欠落は block で停止し何も変えない',
    missing.filter(r => r.severity === 'info').length === 3 &&
    missing.some(r => r.severity === 'block' && r.object_name === 'stores') &&
    missing.some(r => r.severity === 'block' && r.object_name === 'staff_clock_in(bigint,text,text,text)') &&
    !ex.ok && same(post, after).ok,
    `missing=${missing.map(r => `${r.severity}:${r.object_name}`).join(', ')} / 実行=${ex.error}`)
}

// 6. スナップショットの重複
{
  const db = await fixture()
  const before = withoutIto(await capture(db))
  await stage0(db); await dropIto(db)
  let guard
  try { await db.exec(FORWARD); guard = 'no error' } catch (e) { guard = e.message }
  const rows = (await db.query(`select count(*)::int n, count(distinct captured_at)::int runs from ops.acl_snapshot_stage0`)).rows[0]
  record('6a 前進 SQL の再実行は先頭のガードで止まり、スナップショットは増えない', guard.includes('保存済みの行') && rows.runs === 1,
    `エラー=${guard} 行=${rows.n} 回=${rows.runs}`)

  const first = (await db.query(`select min(captured_at)::text t from ops.acl_snapshot_stage0`)).rows[0].t
  await db.exec(`insert into ops.acl_snapshot_stage0 (kind, object_name, acl, rls_enabled, captured_at)
    select 'relation', c.relname, c.relacl::text, c.relrowsecurity, now() + interval '1 hour'
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m');`)
  const p0 = await plan(db)
  const ex0 = await execute(db, null, p0.hash)
  record('6b 保存が2回分：指定なしは block、実行も拒否', p0.count('block') >= 1 && p0.rows.some(r => r.category === 'snapshot') && !ex0.ok,
    `block=${p0.count('block')} 実行=${ex0.error}`)
  const p1 = await plan(db, first)
  const ex1 = await execute(db, first, p1.hash)
  const after = await capture(db)
  record('6c 保存が2回分：captured_at を明示すれば、その回だけで復元し変更前と一致', p1.count('block') === 0 && ex1.ok && same(before, after).ok,
    `restore=${p1.count('restore')} 実行=${ex1.ok ? ex1.n : ex1.error}`)

  const db2 = await fixture()
  await stage0(db2); await dropIto(db2)
  await db2.exec(`insert into ops.acl_snapshot_stage0 select * from ops.acl_snapshot_stage0 where object_name = 'users';`)
  const p2 = await plan(db2)
  record('6d 同じ回に同じオブジェクトが2行：block', p2.rows.some(r => r.category === 'snapshot' && r.object_name === 'users'),
    `block=${p2.count('block')}`)
}

// 7. 段階0の後の別の権限変更
async function laterChange(name, sql, expectBlock = true, extra) {
  const db = await fixture()
  await stage0(db); await dropIto(db)
  await db.exec(sql)
  const post = await capture(db)
  const p = await plan(db)
  const ex = await execute(db, p.at, p.hash)
  const after = await capture(db)
  const blocked = p.count('block') > 0
  const pass = expectBlock ? (blocked && !ex.ok && same(post, after).ok) : (!blocked && ex.ok && (!extra || extra(after)))
  record(name, pass, `block=${p.rows.filter(r => r.severity === 'block').map(r => `${r.category}:${r.object_name ?? ''}${r.grantee ? '/' + r.grantee : ''}${r.privilege_type ? '/' + r.privilege_type : ''}`).slice(0, 4).join(', ')}${p.count('block') > 4 ? ' …' : ''} / 実行=${ex.ok ? ex.n : ex.error}`)
}
await laterChange('7a 段階0の後に別の権限を剥奪（users の SELECT を anon から）→ 停止', `revoke select on public.users from anon;`)
await laterChange('7b 段階0で外した権限の一部を手作業で戻した → 停止', `grant truncate on public.stores to anon;`)
await laterChange('7c 段階0の後に付与オプションだけ変えた → 停止', `grant select on public.users to anon with grant option;`)
await laterChange('7d 段階0の後に RLS を変えた（対象外テーブル）→ 停止', `alter table public.stores enable row level security;`)
await laterChange('7e 段階0の5テーブルの RLS だけ手作業で無効化 → 停止', `alter table public.card_templates disable row level security;`)
await laterChange('7f 未確認のマイグレーションが後にある → 停止', `insert into supabase_migrations.schema_migrations values ('20261120000000','rls_stage2_revoke');`)
await laterChange('7g ops.acl_snapshot_stage2 がある → 停止', `create table ops.acl_snapshot_stage2 (x int);`)
await laterChange('7h【限界の確認】段階0で外した権限を、後でもう一度 REVOKE（ACL は変わらない）→ 検知できず復元される',
  `revoke truncate on public.users from anon;`, false,
  after => after.acl.includes('relation|users|anon|TRUNCATE|false|postgres'))

// 8. 復元の再実行
{
  const db = base.db
  const s0 = await capture(db)
  const p = await plan(db)
  const exOld = await execute(db, base.p.at, base.p.hash)
  const ex = await execute(db, p.at, p.hash)
  const s1 = await capture(db)
  record('8 復元の再実行：restore・block とも0件、古い plan_hash は拒否、新しい plan_hash でも0件で変化なし',
    p.count('restore') === 0 && p.count('block') === 0 && !exOld.ok && ex.ok && ex.n === 0 && same(s0, s1).ok,
    `restore=${p.count('restore')} block=${p.count('block')} 古いhash=${exOld.error} 再実行=${ex.ok ? ex.n : ex.error}`)
}

// 9. 途中で失敗
{
  const db = await fixture()
  await stage0(db); await dropIto(db)
  const post = await capture(db)
  const p = await plan(db)
  await db.exec(`
    create sequence public.zz_grant_counter;
    create function public.zz_fail_on_100th() returns event_trigger language plpgsql as $$
    begin if nextval('public.zz_grant_counter') = 100 then raise exception '検証用の失敗（100件目の GRANT）'; end if; end $$;
    create event trigger zz_fail on ddl_command_end when tag in ('GRANT') execute function public.zz_fail_on_100th();`)
  const ex = await execute(db, p.at, p.hash)
  const cnt = (await db.query(`select last_value::int v from public.zz_grant_counter`)).rows[0].v
  await db.exec(`drop event trigger zz_fail; drop function public.zz_fail_on_100th(); drop sequence public.zz_grant_counter;`)
  const after = await capture(db)
  record('9 途中（100件目の GRANT）で失敗 → 1件も戻らず、RLS も変わらない', !ex.ok && cnt === 100 && same(post, after).ok,
    `restore予定=${p.count('restore')} 失敗までのGRANT=${cnt - 1} 実行=${ex.error} 失敗後=段階0直後と一致:${same(post, after).ok}`)
}

// 10. 承認と実行者
{
  const db = await fixture()
  await stage0(db); await dropIto(db)
  const post = await capture(db)
  const p = await plan(db)
  const exWrong = await execute(db, p.at, 'x' + p.hash.slice(1))
  const exNull = await execute(db, p.at, null)
  await db.exec(`create role tester superuser; set role tester;`)
  const exRole = await execute(db, p.at, p.hash)
  await db.exec(`reset role;`)
  await plan(db); await plan(db)
  const after = await capture(db)
  const guc = (await db.query(`select current_setting('stage0.restore_confirm', true) v`)).rows[0].v
  record('10 誤った plan_hash・未指定・postgres 以外は拒否。計画表示を繰り返しても何も変わらず、設定も残らない',
    !exWrong.ok && !exNull.ok && !exRole.ok && same(post, after).ok && guc == null,
    `誤hash=${exWrong.error} / 未指定=${exNull.error} / 別ロール=${exRole.error}`)
}

// 11. 計画表示が永続オブジェクトを作らない（1 のカタログ比較に加え、一時関数の場所を確認）
{
  const db = await fixture()
  await stage0(db); await dropIto(db)
  const c0 = await catalog(db)
  await db.exec(RESTORE)
  const c1 = await catalog(db)
  const fns = (await db.query(`select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'stage0_%'`)).rows
  record('11 計画表示は pg_temp の一時関数だけを作り、永続的なカタログ・スナップショットは不変', c0 === c1 && fns.every(f => /^pg_temp/.test(f.nspname)) && fns.length === 4,
    `一時関数=${fns.map(f => `${f.nspname}.${f.proname}`).join(', ')}`)
}

const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length ? 1 : 0)
