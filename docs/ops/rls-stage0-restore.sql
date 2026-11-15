-- RLS・権限 段階0の戻し方（2026-11-15 改訂。旧版は rls-stage0.sql 末尾のコメントにあった）
-- 対象：Supabase プロジェクト arahjxdrmqqvzzmyxuot
-- 前提：段階0（docs/ops/rls-stage0.sql、migration 20261114225226）の適用時に保存した ops.acl_snapshot_stage0
-- 検証：PGlite 0.5.14（PostgreSQL 18.6）上の合成データで、postgres による GRANT・REVOKE と
--       ACL 明細・RLS 状態の一致を確認した（回帰テスト：tools/tests/rls-stage0-restore/）。
--       本番の PostgreSQL 17.6 では、このファイルそのままの実行（一時関数を含む）も復元もしていない。
--       anon・authenticated の実効権限、本番の認証、API 経由のアクセスは検証していない。
--       計画の block 0件は「定義した検査条件に当たらなかった」という意味で、無条件の安全保証ではない。
--
-- ■ 何を戻すか
--   * 戻すのは「段階0で外した権限」と「段階0で有効にした5テーブルの RLS」だけ。
--   * スナップショットの ACL を aclexplode で1件ずつ（付与先・権限・付与オプション）に分けて扱う。
--     PUBLIC・anon・authenticated は別々に扱い、まとめて付与しない。
--
-- ■ 止まる条件（severity = 'block' が1件でもあれば、復元は実行されない）
--   * 対象スナップショットを決められない（保存が複数回分あり、captured_at を指定していない／指定が一致しない）
--   * 同じスナップショットに同じオブジェクトが2行以上ある
--   * 既知の除外（ito_* の3テーブル）以外のオブジェクトが無い
--   * オブジェクトの今の ACL が「段階0直後の期待状態」とも「段階0前（スナップショット）」とも一致しない
--     （段階0の後に、別の付与・剥奪・付与オプションの変更があった）
--   * RLS の状態が、段階0直後の期待状態ともスナップショットとも一致しない
--   * 一部のオブジェクトだけ復元済みになっている（手作業で一部を戻した可能性）
--   * 段階0より後に、既知でないマイグレーションが適用されている（段階2など）
--   * ops.acl_snapshot_stage2 がある（段階2の適用後）
--
-- ■ 判別できないこと（限界）
--   * 段階0で外した権限を、その後もう一度 REVOKE した場合（例：段階2で同じ権限を外した）は、
--     今の ACL が段階0直後と同じになるため、ACL だけでは区別できない。
--     そのため、マイグレーション履歴と ops.acl_snapshot_stage2 の有無でも止める。
--     ただし、マイグレーションを使わずに SQL Editor などで直接変更した場合は検知できない。
--   * スナップショットにはオブジェクトの OID や所有者が保存されていないため、同じ名前で作り直された
--     オブジェクトは、ACL や RLS に差が出ない限り見分けられない。
--   * スナップショットの ACL が NULL（既定権限）の場合、当時の所有者の権限は推測になるため、
--     所有者の分は比較・復元の対象から外す（PUBLIC・anon・authenticated の分は既定権限から判断する）。
--   * スナップショットにないオブジェクト（段階0の後に作られたもの）には触れず、info として表示する。
--
-- ■ 使い方（Supabase の SQL Editor では、実行ボタンごとに別の接続になることがあるため、
--   このファイル全体を1回の実行で流す）
--   1. そのまま実行する：計画を表示するだけで、権限は変えない。作るのは一時関数（pg_temp）だけで、
--      接続を閉じると消える。永続的なテーブル・ビュー・関数は作らない。
--      最初の結果に snapshot_captured_at・plan_hash・件数が出る。block が0件であることを確認する。
--   2. 復元する（承認後のみ）：ファイル末尾の「復元の実行」の3行のコメントを外し、
--      1 で表示された snapshot_captured_at と plan_hash を貼り付けて、ファイル全体を実行する。
--      * 承認は実行のたびに引数で渡す。セッションの設定には残らないので、次の実行で意図せず復元されない。
--      * 計画が 1 の表示から変わっていれば（plan_hash が一致しなければ）止まる。
--      * 復元は1つの文の中で行い、途中で失敗するか、復元後の確認で差が残れば、全体が取り消される。
--   3. もう一度そのまま実行し、restore と block が0件であることを確認する。

------------------------------------------------------------------------------
-- 対象スナップショットの決定（複数回分あり、指定がなければ NULL ＝ 止める）
------------------------------------------------------------------------------
create or replace function pg_temp.stage0_snapshot_resolve(p_snapshot_at timestamptz default null)
returns timestamptz
language sql stable
as $fn$
  select case
    when p_snapshot_at is not null then
      (select distinct captured_at from ops.acl_snapshot_stage0 where captured_at = p_snapshot_at)
    when (select count(distinct captured_at) from ops.acl_snapshot_stage0) = 1 then
      (select min(captured_at) from ops.acl_snapshot_stage0)
  end
$fn$;

------------------------------------------------------------------------------
-- 復元計画（読み取りのみ）
------------------------------------------------------------------------------
create or replace function pg_temp.stage0_restore_plan(p_snapshot_at timestamptz default null)
returns table (
  severity text,        -- 'restore' | 'block' | 'info'
  category text,
  kind text,
  object_name text,
  grantee text,
  privilege_type text,
  is_grantable boolean,
  detail text
)
language sql stable
as $fn$
with
chosen as (
  select pg_temp.stage0_snapshot_resolve(p_snapshot_at) as captured_at
),
snap_all as (
  select s.* from ops.acl_snapshot_stage0 s
  where s.captured_at = (select captured_at from chosen)
),
dup as (
  select s.kind, s.object_name from snap_all s group by 1, 2 having count(*) > 1
),
snap as (
  select s.* from snap_all s
  where not exists (select 1 from dup d where d.kind = s.kind and d.object_name = s.object_name)
),
known_dropped(object_name, reason) as (
  values
    ('ito_issue_log',   '既知の除外：2026-11-15 drop_unused_ito_tables で削除（別プロジェクトの未使用テーブル）'),
    ('ito_issue_state', '既知の除外：2026-11-15 drop_unused_ito_tables で削除（別プロジェクトの未使用テーブル）'),
    ('ito_topics',      '既知の除外：2026-11-15 drop_unused_ito_tables で削除（別プロジェクトの未使用テーブル）')
),
known_migrations(name) as (
  -- 段階0より後に適用され、段階0の権限に影響しないことを確認済みのマイグレーション
  values ('drop_unused_ito_tables')
),
rls_scope(object_name) as (
  values
    ('users_backup_before_stamp_migration_20260413'), ('users_backup_before_drop_stamp_count_20260413'),
    ('users_backup_before_drop_legacy_columns_20260413'), ('stamp_migration_map'), ('card_templates')
),
-- 段階0の範囲（rls-stage0.sql の前進側と同じ内容。変更するときは両方を合わせる）
scope(kind, object_name, grantee, privilege_type) as (
  -- 1. 12個の関数：EXECUTE を PUBLIC・anon・authenticated から外した
  select 'function', f, g, 'EXECUTE'
  from unnest(array[
    'reset_system_runtime_data(text,text)', 'reset_all_stamp_cards(text,text)', 'reset_all_bingo_cards(text,text)',
    'reset_regular_customer_stamp_cards(text,text)', 'archive_active_stamp_cards(text,text)',
    'archive_active_bingo_cards(text,text)', 'staff_clock_in(bigint,text,text,text)',
    'staff_clock_out(bigint,text,text,text)', 'staff_fix_work_session(bigint,date,text,text,text,text,text)',
    'snapshot_staff_stamps_for_period(bigint)', 'build_payroll_run_preview(bigint,bigint)',
    'upsert_ranch_care_event(bigint,bigint,date,integer,text,text)']) f,
  unnest(array['PUBLIC', 'anon', 'authenticated']) g
  union
  -- 2. 5テーブル：anon・authenticated から全権限を外した（PUBLIC は対象外）
  select 'relation', t.object_name, g, pr
  from rls_scope t,
  unnest(array['anon', 'authenticated']) g,
  unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) pr
  union
  -- 3. public の全テーブル・ビュー（段階0の時点のもの＝スナップショットの relation）：
  --    anon・authenticated から TRUNCATE・TRIGGER・REFERENCES を外した
  select 'relation', s.object_name, g, pr
  from snap s,
  unnest(array['anon', 'authenticated']) g,
  unnest(array['TRUNCATE', 'TRIGGER', 'REFERENCES']) pr
  where s.kind = 'relation'
),
target as (
  select s.kind, s.object_name, s.acl, s.rls_enabled,
    case s.kind
      when 'function' then to_regprocedure('public.' || s.object_name)::oid
      else to_regclass(format('public.%I', s.object_name))::oid
    end as obj_oid
  from snap s
),
present as (
  select t.*,
    case t.kind
      when 'function' then (select p.proowner from pg_proc p where p.oid = t.obj_oid)
      else (select c.relowner from pg_class c where c.oid = t.obj_oid)
    end as owner_oid,
    case t.kind
      when 'function' then (select p.proacl from pg_proc p where p.oid = t.obj_oid)
      else (select c.relacl from pg_class c where c.oid = t.obj_oid)
    end as cur_acl,
    (select c.relrowsecurity from pg_class c where t.kind = 'relation' and c.oid = t.obj_oid) as cur_rls
  from target t
  where t.obj_oid is not null
),
snap_items as (  -- 段階0前（スナップショット）の ACL
  select p.kind, p.object_name,
    case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
    a.privilege_type, a.is_grantable
  from present p
  cross join lateral aclexplode(coalesce(
    p.acl::aclitem[],
    acldefault((case p.kind when 'function' then 'f' else 'r' end)::"char", p.owner_oid))) a
  where not (p.acl is null and a.grantee = p.owner_oid)
),
cur_items as (  -- 今の ACL
  select p.kind, p.object_name,
    case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
    a.privilege_type, a.is_grantable
  from present p
  cross join lateral aclexplode(coalesce(
    p.cur_acl,
    acldefault((case p.kind when 'function' then 'f' else 'r' end)::"char", p.owner_oid))) a
  where not (p.acl is null and a.grantee = p.owner_oid)
),
post_items as (  -- 段階0直後に期待される ACL（スナップショットから段階0の範囲を除いたもの）
  select si.* from snap_items si
  where not exists (
    select 1 from scope sc
    where sc.kind = si.kind and sc.object_name = si.object_name
      and sc.grantee = si.grantee and sc.privilege_type = si.privilege_type)
),
diff_post as (
  select 'extra' as side, x.* from (select * from cur_items except select * from post_items) x
  union all
  select 'missing', x.* from (select * from post_items except select * from cur_items) x
),
diff_snap as (
  select x.* from (select * from cur_items except select * from snap_items) x
  union all
  select x.* from (select * from snap_items except select * from cur_items) x
),
obj_state as (
  select p.kind, p.object_name,
    not exists (select 1 from diff_post d where d.kind = p.kind and d.object_name = p.object_name) as is_post,
    not exists (select 1 from diff_snap d where d.kind = p.kind and d.object_name = p.object_name) as is_snap
  from present p
),
rls_state as (
  select p.object_name, p.rls_enabled as snap_rls, p.cur_rls,
    case when exists (select 1 from rls_scope r where r.object_name = p.object_name) then true
         else p.rls_enabled end as post_rls
  from present p
  where p.kind = 'relation'
),
needs as (  -- 戻す必要があるか（段階0直後の状態のもの）と、既に戻っているもの
  select
    (select count(*) from obj_state o where o.is_post and not o.is_snap) as acl_post,
    (select count(*) from obj_state o where o.is_snap and not o.is_post) as acl_restored,
    (select count(*) from rls_state r where r.cur_rls = r.post_rls and r.cur_rls is distinct from r.snap_rls) as rls_post,
    (select count(*) from rls_state r where r.cur_rls = r.snap_rls and r.cur_rls is distinct from r.post_rls) as rls_restored
)
-- 対象スナップショット
select 'block', 'snapshot', null::text, null::text, null::text, null::text, null::boolean,
  format('対象スナップショットを決められません。保存済み: %s。captured_at を明示してください。',
    (select string_agg(format('%s（%s 行）', captured_at, n), '、' order by captured_at)
     from (select captured_at, count(*) n from ops.acl_snapshot_stage0 group by captured_at) r))
where (select captured_at from chosen) is null
union all
select 'block', 'snapshot', d.kind, d.object_name, null, null, null, '同じスナップショットに同じオブジェクトが複数行あります'
from dup d
union all
-- 欠落しているオブジェクト
select case when k.object_name is not null and t.kind = 'relation' then 'info' else 'block' end,
  'missing', t.kind, t.object_name, null, null, null,
  coalesce(case when t.kind = 'relation' then k.reason end, '想定外の欠落：スナップショットにあるオブジェクトが見つかりません')
from target t left join known_dropped k on k.object_name = t.object_name
where t.obj_oid is null
union all
-- 段階0の後に変わった ACL（段階0直後とも段階0前とも一致しない）
select 'block', 'acl drift', d.kind, d.object_name, d.grantee, d.privilege_type, d.is_grantable,
  case d.side when 'extra' then '段階0直後には無いはずの権限が付いています'
              else '段階0直後にはあるはずの権限がありません' end
from diff_post d
join obj_state o on o.kind = d.kind and o.object_name = d.object_name
where not o.is_post and not o.is_snap
union all
-- 戻す権限
select 'restore', 'acl', si.kind, si.object_name, si.grantee, si.privilege_type, si.is_grantable,
  '段階0で外した権限を戻す'
from (select * from snap_items except select * from post_items) si
join obj_state o on o.kind = si.kind and o.object_name = si.object_name
where o.is_post and not o.is_snap
union all
-- RLS
select case
    when r.cur_rls = r.snap_rls then null
    when r.cur_rls = r.post_rls then 'restore'
    else 'block' end,
  case when r.cur_rls = r.post_rls then 'rls' else 'rls drift' end,
  'relation', r.object_name, null, null, null,
  case when r.cur_rls = r.post_rls then format('RLS を %s に戻す', case when r.snap_rls then '有効' else '無効' end)
       else format('RLS が段階0の後に変わっています（段階0前 %s、段階0直後 %s、現在 %s）', r.snap_rls, r.post_rls, r.cur_rls) end
from rls_state r
where r.cur_rls is distinct from r.snap_rls
union all
-- 一部だけ戻っている
select 'block', 'partial', null, null, null, null, null,
  format('段階0直後の状態のもの（ACL %s 件・RLS %s 件）と、既に戻っているもの（ACL %s 件・RLS %s 件）が混在しています',
         n.acl_post, n.rls_post, n.acl_restored, n.rls_restored)
from needs n
where (n.acl_post + n.rls_post) > 0 and (n.acl_restored + n.rls_restored) > 0
union all
-- 段階0より後のマイグレーション
select case when exists (select 1 from known_migrations k where k.name = m.name) then 'info' else 'block' end,
  'migration', null, m.name, null, null, null,
  case when exists (select 1 from known_migrations k where k.name = m.name)
    then format('段階0の後に適用（%s）。段階0の権限に影響しないことを確認済み', m.version)
    else format('段階0の後に適用された、未確認のマイグレーション（%s）。権限を変えていないか確認してください', m.version) end
from supabase_migrations.schema_migrations m
where m.version > '20261114225226'
union all
select 'block', 'stage2', null, 'ops.acl_snapshot_stage2', null, null, null,
  '段階2のスナップショットがあります。段階2の適用後は、段階0の復元をそのまま実行できません'
where to_regclass('ops.acl_snapshot_stage2') is not null
union all
-- 段階0の後に作られたテーブル・ビュー（触れない）
select 'info', 'new object', 'relation', c.relname, null, null, null, 'スナップショットに無いため対象外（触れない）'
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  and (select captured_at from chosen) is not null
  and not exists (select 1 from snap_all s where s.kind = 'relation' and s.object_name = c.relname)
$fn$;

------------------------------------------------------------------------------
-- 計画のハッシュ（承認の対象。対象スナップショットと、戻す内容をすべて含む）
------------------------------------------------------------------------------
create or replace function pg_temp.stage0_restore_plan_hash(p_snapshot_at timestamptz)
returns text
language sql stable
as $fn$
  select md5(
    coalesce(pg_temp.stage0_snapshot_resolve(p_snapshot_at)::text, '') || '#' ||
    coalesce((
      select string_agg(concat_ws('|', p.category, p.kind, p.object_name, p.grantee, p.privilege_type, p.is_grantable),
                        ',' order by p.category, p.kind, p.object_name, p.grantee, p.privilege_type)
      from pg_temp.stage0_restore_plan(p_snapshot_at) p
      where p.severity = 'restore'), ''))
$fn$;

------------------------------------------------------------------------------
-- 復元の実行（承認後のみ、ファイル末尾の呼び出しから使う）
------------------------------------------------------------------------------
create or replace function pg_temp.stage0_restore_execute(p_snapshot_at timestamptz, p_plan_hash text)
returns integer
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  r record;
  n integer := 0;
  v_block integer;
begin
  if current_user <> 'postgres' then
    raise exception 'postgres で実行してください（付与者を元と同じにするため）。現在: %', current_user;
  end if;
  if p_snapshot_at is null or coalesce(p_plan_hash, '') = '' then
    raise exception '対象スナップショット（captured_at）と plan_hash を指定してください';
  end if;
  if pg_temp.stage0_snapshot_resolve(p_snapshot_at) is null then
    raise exception '指定した captured_at のスナップショットがありません: %', p_snapshot_at;
  end if;

  select count(*) into v_block from pg_temp.stage0_restore_plan(p_snapshot_at) where severity = 'block';
  if v_block > 0 then
    raise exception '止まる条件が % 件あります。計画を確認してください（何も変更していません）', v_block;
  end if;
  if pg_temp.stage0_restore_plan_hash(p_snapshot_at) <> p_plan_hash then
    raise exception '計画が承認時から変わっています（plan_hash 不一致）。もう一度計画を表示して確認してください';
  end if;

  for r in
    select * from pg_temp.stage0_restore_plan(p_snapshot_at)
    where severity = 'restore' and category = 'acl'
    order by kind, object_name, grantee, privilege_type
  loop
    execute format('grant %s on %s %s to %s%s',
      r.privilege_type,
      case r.kind when 'function' then 'function' else 'table' end,
      case r.kind
        when 'function' then to_regprocedure('public.' || r.object_name)::regprocedure::text
        else format('public.%I', r.object_name)
      end,
      case r.grantee when 'PUBLIC' then 'public' else quote_ident(r.grantee) end,
      case when r.is_grantable then ' with grant option' else '' end);
    n := n + 1;
  end loop;

  for r in
    select p.object_name, s.rls_enabled
    from pg_temp.stage0_restore_plan(p_snapshot_at) p
    join ops.acl_snapshot_stage0 s
      on s.kind = 'relation' and s.object_name = p.object_name
     and s.captured_at = pg_temp.stage0_snapshot_resolve(p_snapshot_at)
    where p.severity = 'restore' and p.category = 'rls'
  loop
    execute format('alter table public.%I %s row level security', r.object_name,
                   case when r.rls_enabled then 'enable' else 'disable' end);
    n := n + 1;
  end loop;

  -- 復元後の確認：戻すもの・止まる条件が残っていれば、全体を取り消す
  if exists (select 1 from pg_temp.stage0_restore_plan(p_snapshot_at) where severity in ('restore', 'block')) then
    raise exception '復元後の確認で差が残りました。全体を取り消します';
  end if;

  raise notice '段階0の復元: % 件を戻しました', n;
  return n;
end
$fn$;

------------------------------------------------------------------------------
-- 計画の表示
------------------------------------------------------------------------------
select pg_temp.stage0_snapshot_resolve(null) as snapshot_captured_at,
  pg_temp.stage0_restore_plan_hash(pg_temp.stage0_snapshot_resolve(null)) as plan_hash,
  count(*) filter (where severity = 'restore') as restore_items,
  count(*) filter (where severity = 'block') as block_items,
  count(*) filter (where severity = 'info') as info_items
from pg_temp.stage0_restore_plan(null);

select * from pg_temp.stage0_restore_plan(null)
order by case severity when 'block' then 0 when 'restore' then 1 else 2 end,
  category, kind, object_name, grantee, privilege_type;

-- 保存が複数回分あるときは、上の block に表示された captured_at を選び、null の代わりに指定して表示し直す。
-- 例：select * from pg_temp.stage0_restore_plan('2026-11-14 22:52:26.226075+00');

------------------------------------------------------------------------------
-- 復元の実行（承認後のみ。下の3行のコメントを外し、上で表示された値を貼り付ける）
------------------------------------------------------------------------------
-- begin;
-- select pg_temp.stage0_restore_execute('<snapshot_captured_at>', '<plan_hash>');
-- commit;
