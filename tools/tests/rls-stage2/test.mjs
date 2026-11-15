// 段階2の前進 SQL（docs/ops/rls-stage2.sql）と復元 SQL（docs/ops/rls-stage2-restore.sql）を、
// PGlite（PostgreSQL 18.6・WASM）上の合成データで通しで検証する回帰テスト。
// 本番の Supabase には接続しない。本番のスナップショットの実データも使わない。
// 実行方法と期待結果は README.md を参照。
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const FORWARD = fs.readFileSync(`${REPO}/docs/ops/rls-stage2.sql`, 'utf8')
const RESTORE = fs.readFileSync(`${REPO}/docs/ops/rls-stage2-restore.sql`, 'utf8')
const RESTORE_PLAN_ONLY = RESTORE // 実行行はコメントのまま

// 本番の形を小さく再現した合成データ（名前は本番と同じものを一部使う。行データは架空）
async function fixture() {
  const db = await PGlite.create()
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role writer nologin;  -- トリガー関数の EXECUTE を持たないロール（トリガーの確認用）
    create schema ops;
    -- 本番と同じ既定の権限（postgres が public に作るものは anon・authenticated・service_role に付与）
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

    create table public.stores (store_id serial primary key, store_code text);
    create table public.users (user_id serial primary key, store_id int, display_name text, updated_at timestamptz);
    create table public.stamp_cards (card_id serial primary key, user_id int, current_count int default 0, updated_at timestamptz);
    create table public.app_settings (setting_key text primary key, setting_value text);
    create table public.payroll_monthly_bonus_runs (run_id serial primary key);
    insert into public.stores (store_code) values ('S1');
    insert into public.users (store_id, display_name) values (1, 'テスト');
    insert into public.stamp_cards (user_id) values (1);
    insert into public.app_settings values ('current_store_code', 'S1');

    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
    create trigger trg_stamp_updated before update on public.stamp_cards for each row execute function public.set_updated_at();
    create function public.increment_stamp_card(p_card_id bigint, p_diff int) returns int language sql security definer as
      $$ update public.stamp_cards set current_count = current_count + p_diff where card_id = p_card_id returning current_count $$;
    create function public.get_payroll_history_matrix(p_year integer) returns int language sql as $$ select p_year $$;
    grant execute on function public.get_payroll_history_matrix(integer) to authenticated with grant option;

    create view public.v_stamp_cards_current as
      select c.card_id, c.current_count, u.display_name from public.stamp_cards c join public.users u using (user_id);
    -- ビューを読む通常の関数（本番の staff_card_adjust_admin と同じく、service_role だけが実行できる）
    create function public.staff_card_adjust_admin(p_card_id bigint) returns int language sql as
      $$ select current_count from public.v_stamp_cards_current where card_id = p_card_id $$;
    revoke all on function public.staff_card_adjust_admin(bigint) from public, anon, authenticated;

    -- RLS とポリシー（本番の users・app_settings と同じ形）
    alter table public.users enable row level security;
    create policy "allow read" on public.users for select to public using (true);
    create policy "allow insert" on public.users for insert to public with check (true);
    create policy "allow update" on public.users for update to public using (true) with check (true);
    alter table public.app_settings enable row level security;
    create policy app_settings_select_anon on public.app_settings for select to anon using (true);
    create policy app_settings_select_authenticated on public.app_settings for select to authenticated using (true);
    alter table public.stores enable row level security;
    create policy stores_select_anon on public.stores for select to anon using (true);
    alter table public.payroll_monthly_bonus_runs enable row level security;  -- ポリシーなし

    -- 段階2の対象外（既に anon の権限がないテーブル）
    create table public.bambi_hunters (hunter_no int);
    revoke all on public.bambi_hunters from anon, authenticated;
    alter table public.bambi_hunters enable row level security;

    grant select, insert, update on public.stamp_cards to writer;
    grant usage on schema public to anon, authenticated, service_role, writer;
  `)
  return db
}

// 権限・RLS・ポリシー・ビューのオプション・既定の権限を、比べられる明細にする（public と postgres の分）
async function capture(db) {
  const q = async sql => (await db.query(sql)).rows.map(r => Object.values(r).join('|'))
  return {
    acl: await q(`
      select 'rel', c.relname, case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type, a.is_grantable
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner))) a
      where n.nspname = 'public' and c.relkind in ('r','v','S')
      union all
      select 'fn', p.oid::regprocedure::text, case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type, a.is_grantable
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname = 'public' order by 1,2,3,4,5`),
    rls: await q(`select c.relname, c.relrowsecurity, coalesce(c.reloptions::text, '') from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','v') order by 1`),
    pol: await q(`select tablename, policyname, permissive, roles::text, cmd, coalesce(qual, ''), coalesce(with_check, '') from pg_policies where schemaname = 'public' order by 1,2`),
    def: await q(`select defaclnamespace::text, defaclobjtype, a.privilege_type, case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end, a.is_grantable
      from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole = 'postgres'::regrole order by 1,2,3,4`),
  }
}
// 永続的なカタログ（一時スキーマ以外）の指紋
async function catalog(db) {
  const r = await db.query(`
    select md5(string_agg(x, E'\n' order by x)) s from (
      select format('rel %s.%s %s %s %s %s', n.nspname, c.relname, c.relkind, c.relacl, c.relrowsecurity, c.reloptions) x
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname !~ '^pg_(toast_)?temp'
      union all select format('fn %s %s', p.oid::regprocedure, p.proacl) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname !~ '^pg_(toast_)?temp'
      union all select format('pol %s %s %s', tablename, policyname, qual) from pg_policies
      union all select format('def %s %s %s', defaclnamespace, defaclobjtype, defaclacl) from pg_default_acl
    ) t`)
  return r.rows[0].s
}
const diff = (a, b) => {
  const out = []
  for (const k of Object.keys(a)) {
    const A = new Set(a[k]), B = new Set(b[k])
    for (const x of a[k]) if (!B.has(x)) out.push(`-${k}:${x}`)
    for (const x of b[k]) if (!A.has(x)) out.push(`+${k}:${x}`)
  }
  return out
}

async function forward(db) {
  try { await db.exec(`begin;\n${FORWARD}\ncommit;`); return { ok: true } }
  catch (e) { await db.exec('rollback;').catch(() => {}); return { ok: false, error: e.message } }
}
async function plan(db) {
  await db.exec(RESTORE_PLAN_ONLY)
  const rows = (await db.query(`select * from pg_temp.stage2_plan_refresh()`)).rows
  const head = rows.find(r => r.seq === 0)
  return { rows, at: head.severity === 'summary' ? head.item : null, hash: head.stmt.replace('plan_hash=', ''), count: s => rows.filter(r => r.severity === s).length }
}
async function restore(db, at, hash) {
  try { const r = await db.query(`select * from pg_temp.stage2_restore($1::timestamptz, $2)`, [at, hash]); return { ok: true, n: r.rows.length } }
  catch (e) { return { ok: false, error: e.message } }
}
async function denied(db, role, sql) {
  try { await db.exec(`set role ${role}; ${sql}`); return false }
  catch (e) { return /permission denied/.test(e.message) }
  finally { await db.exec('reset role;') }
}
async function allowed(db, role, sql) {
  try { const r = await db.exec(`set role ${role}; ${sql}`); return r[r.length - 1]?.rows ?? [] }
  catch (e) { return { error: e.message } }
  finally { await db.exec('reset role;') }
}

const results = []
function record(name, pass, detail) {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

{
  const v = await PGlite.create(); const ver = (await v.query('select version() v')).rows[0].v; await v.close()
  console.log(`PGlite: 0.5.14\nversion(): ${ver}\n`)
}

// 1. 前進：anon・authenticated の権限が無くなり、service_role・postgres は使える
{
  const db = await fixture()
  const before = await capture(db)
  const f = await forward(db)
  const after = await capture(db)
  const anonRel = (await db.query(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','S')
     and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))`)).rows[0].n
  const anonFn = (await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)).rows[0].n
  record('1a 前進が例外なく完了し、anon・authenticated はテーブル・ビュー・シーケンス・関数をどれも使えない', f.ok && anonRel === 0 && anonFn === 0, f.error || `rel=${anonRel} fn=${anonFn}`)

  const d = await denied(db, 'anon', 'select * from public.users;') && await denied(db, 'anon', 'select * from public.v_stamp_cards_current;')
    && await denied(db, 'anon', `select public.increment_stamp_card(1, 1);`) && await denied(db, 'authenticated', `insert into public.stamp_cards (user_id) values (1);`)
    && await denied(db, 'anon', `select nextval('public.stamp_cards_card_id_seq');`)
  record('1b anon・authenticated で、読み取り・書き込み・関数・シーケンスがすべて権限エラーになる', d)

  const s1 = await allowed(db, 'service_role', 'select * from public.v_stamp_cards_current;')
  const s2 = await allowed(db, 'service_role', 'select public.increment_stamp_card(1, 1) n;')
  const s3 = await allowed(db, 'service_role', 'select public.staff_card_adjust_admin(1) n;')
  const s4 = await allowed(db, 'service_role', `insert into public.users (store_id, display_name) values (1, 'B') returning user_id;`)
  const s5 = await allowed(db, 'service_role', `select count(*)::int n from public.users;`)
  record('1c service_role は、security_invoker のビュー・SECURITY DEFINER の関数・通常の関数・RLS を有効にしたテーブルの読み書きができる',
    Array.isArray(s1) && s1.length === 1 && s2[0]?.n === 1 && s3[0]?.n === 1 && Array.isArray(s4) && s5[0]?.n === 2,
    JSON.stringify([s1, s2, s3, s4, s5]).slice(0, 200))

  // トリガー関数の EXECUTE を持たないロールでも、トリガーが動く
  const w = await allowed(db, 'writer', `update public.stamp_cards set current_count = 5 where card_id = 1;`)
  const upd = (await db.query(`select updated_at is not null t from public.stamp_cards where card_id = 1`)).rows[0].t
  const wExec = (await db.query(`select has_function_privilege('writer', 'public.set_updated_at()', 'execute') e`)).rows[0].e
  record('1d トリガー関数の実行権限がなくても、トリガーは動く', Array.isArray(w) && upd === true && wExec === false, JSON.stringify(w))

  const others = diff(before, after).filter(x => /service_role|postgres/.test(x) && !/^[-+]def:/.test(x))
  record('1e service_role・postgres の権限は変わらない', others.length === 0, others.join(', '))

  // これから作るテーブルに anon の権限が自動で付かない。関数は PUBLIC の既定が残る（運用ルールで外す）。
  // 他のスキーマ（extensions など）の関数の PUBLIC 実行は変えない。
  await db.exec(`create table public.new_table (id int); create function public.new_fn() returns int language sql as $$ select 1 $$;
                 create function ops.new_ops_fn() returns int language sql as $$ select 1 $$;`)
  const nt = (await db.query(`select has_table_privilege('anon','public.new_table','select') a, has_table_privilege('service_role','public.new_table','select') s,
    has_function_privilege('anon','public.new_fn()','execute') fa, has_function_privilege('service_role','public.new_fn()','execute') fs,
    has_function_privilege('anon','ops.new_ops_fn()','execute') oa,
    exists (select 1 from pg_proc p, aclexplode(p.proacl) x where p.oid = 'public.new_fn()'::regprocedure and x.grantee = 'anon'::regrole) fa_direct`)).rows[0]
  await db.exec(`revoke execute on function public.new_fn() from public, anon, authenticated;`)
  const ruled = (await db.query(`select has_function_privilege('anon','public.new_fn()','execute') fa, has_function_privilege('service_role','public.new_fn()','execute') fs`)).rows[0]
  record('1f 新しいテーブルは anon が使えない。新しい関数は anon への直接付与はないが PUBLIC 経由で実行でき、運用ルールの revoke で外れる。他のスキーマの関数の PUBLIC 実行は変えない',
    !nt.a && nt.s && nt.fa && !nt.fa_direct && nt.fs && nt.oa && !ruled.fa && ruled.fs, JSON.stringify({ ...nt, ruled }))
  await db.close()
}

// 2. 再実行の防止
{
  const db = await fixture()
  await forward(db)
  const c0 = await catalog(db)
  const f2 = await forward(db)
  const c1 = await catalog(db)
  record('2 前進 SQL の再実行は例外で止まり、何も変わらない', !f2.ok && /適用済み/.test(f2.error) && c0 === c1, f2.error)
  await db.close()
}

// 3. 往復：前進 → 復元で、変更前と一致する。再実行は0件
{
  const db = await fixture()
  const before = await capture(db)
  await forward(db)
  const c0 = await catalog(db)
  const p = await plan(db)
  const c1 = await catalog(db)
  record('3a 計画表示は永続的なカタログを変えない', c0 === c1)
  const r = await restore(db, p.at, p.hash)
  const after = await capture(db)
  const d = diff(before, after)
  record('3b 復元後、ACL・RLS・ポリシー・ビューのオプション・既定の権限が変更前と一致', r.ok && d.length === 0 && p.count('block') === 0,
    r.error || `復元 ${r.n} 件 / 差 ${d.join(', ')}`)
  const p2 = await plan(db)
  const r2 = await restore(db, p2.at, p2.hash)
  record('3c 復元の再実行は0件で、何も変わらない', p2.count('restore') === 0 && r2.ok && r2.n === 0 && diff(before, await capture(db)).length === 0)
  const old = await restore(db, p.at, p.hash)
  record('3d 古い plan_hash は拒否される', !old.ok, old.error)
  await db.close()
}

// 4. 拒否：誤った plan_hash・未指定・誤った captured_at・postgres 以外
{
  const db = await fixture()
  await forward(db)
  const p = await plan(db)
  const c0 = await catalog(db)
  const a = await restore(db, p.at, 'x' + p.hash.slice(1))
  const b = await restore(db, p.at, null)
  const c = await restore(db, '2000-01-01T00:00:00Z', p.hash)
  await db.exec(`create role tester superuser; set role tester;`)
  const e = await restore(db, p.at, p.hash)
  await db.exec(`reset role;`)
  const c1 = await catalog(db)
  record('4 誤った plan_hash・未指定・誤った captured_at・postgres 以外は拒否され、何も変わらない',
    !a.ok && !b.ok && !c.ok && !e.ok && c0 === c1, [a.error, b.error, c.error, e.error].join(' / '))
  await db.close()
}

// 5. 止まる条件：同じ名前のポリシーが違う内容で作られている
{
  const db = await fixture()
  await forward(db)
  await db.exec(`create policy "allow read" on public.users for select to anon using (store_id = 1);`)
  const c0 = await catalog(db)
  const p = await plan(db)
  const r = await restore(db, p.at, p.hash)
  record('5 同じ名前で内容の違うポリシーがあれば block になり、復元しない', p.count('block') === 1 && !r.ok && c0 === await catalog(db), r.error)
  await db.close()
}

// 6. 段階2の後に削除・作成されたもの：info として扱い、ほかは戻す
{
  const db = await fixture()
  await forward(db)
  await db.exec(`drop table public.payroll_monthly_bonus_runs; create policy new_one on public.stores for select to service_role using (true);`)
  const p = await plan(db)
  const r = await restore(db, p.at, p.hash)
  const anonUsers = (await db.query(`select has_table_privilege('anon','public.users','select') a`)).rows[0].a
  const kept = (await db.query(`select count(*)::int n from pg_policies where policyname = 'new_one'`)).rows[0].n
  record('6 削除されたテーブルと新しいポリシーは info になり、ほかは戻る（新しいポリシーは残る）',
    r.ok && p.count('info') >= 2 && p.count('block') === 0 && anonUsers && kept === 1, r.error || `info=${p.count('info')}`)
  await db.close()
}

// 7. 途中で失敗すると、1件も残らない
{
  const db = await fixture()
  await forward(db)
  // スナップショットに、作り直すと失敗するポリシーを加える（存在しない列を参照）
  await db.exec(`insert into ops.acl_snapshot_stage2 (kind, object_name, policy_def, captured_at)
    select 'policy', 'users.zz_broken', jsonb_build_object('table','users','name','zz_broken','permissive','PERMISSIVE','roles','["anon"]'::jsonb,'cmd','SELECT','qual','no_such_column = 1','with_check',null), min(captured_at)
    from ops.acl_snapshot_stage2;`)
  const c0 = await catalog(db)
  const p = await plan(db)
  const r = await restore(db, p.at, p.hash)
  record('7 途中の文が失敗すると例外になり、それまでの復元も取り消される', !r.ok && p.count('restore') > 1 && c0 === await catalog(db), r.error)
  await db.close()
}

// 8. 段階2の前（スナップショットなし）では block
{
  const db = await fixture()
  const p = await plan(db)
  record('8 段階2の適用前に計画を表示すると block になる', p.count('block') === 1 && p.at === null)
  await db.close()
}

const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
process.exitCode = failed.length ? 1 : 0
