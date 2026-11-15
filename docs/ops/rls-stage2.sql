-- RLS・権限 段階2：anon・authenticated（ブラウザ公開キー）から public スキーマの権限をすべて外す
-- 対象：Supabase プロジェクト arahjxdrmqqvzzmyxuot（PostgreSQL 17.6）
-- 状態：**未適用**（2026-11-15 作成）。本番への適用は、ユーザーの承認後に、1つのマイグレーション（1トランザクション）で行う。
-- 戻し方：docs/ops/rls-stage2-restore.sql
-- 回帰テスト：tools/tests/rls-stage2/（PGlite 上の合成データ。本番には接続しない）
-- 前提と影響の調査：docs/ops/rls-stage1-plan.md の「7.」と「11.」
--
-- 方針
--   * service_role（サーバー側の API・Discord・ハンター・イベント）と postgres（pg_cron、SECURITY DEFINER 関数の所有者）の権限は変えない。
--     どちらも BYPASSRLS を持つため、RLS の有効化とポリシーの削除の影響を受けない（2026-11-15 に pg_roles で確認）。
--   * anon・authenticated・PUBLIC の権限だけを外す。代わりのポリシーは作らない（アプリは anon キーで DB を使わなくなったため）。
--   * 変更前の状態（ACL・RLS・ポリシー・ビューのオプション・既定の権限）を ops.acl_snapshot_stage2 に保存する。
--   * 最後に結果を確かめ、想定と違えば例外で全体を取り消す（マイグレーションは1トランザクション）。
--   * Storage（公開バケットの画像 URL）は public スキーマの権限とは別で、この SQL では変えない。

------------------------------------------------------------------------------
-- 0. 再実行の防止と、変更前の状態の保存（ops スキーマは API に公開されていない）
------------------------------------------------------------------------------
do $$
begin
  if to_regclass('ops.acl_snapshot_stage2') is not null then
    raise exception 'ops.acl_snapshot_stage2 があります。段階2は適用済みのため、再実行しないでください。';
  end if;
end $$;

create table ops.acl_snapshot_stage2 (
  kind text not null,          -- 'relation' | 'sequence' | 'function' | 'policy' | 'default_acl'
  object_name text not null,   -- テーブル等は名前、関数は「public.名前(引数の型)」、ポリシーは「テーブル.ポリシー」、既定の権限は「スキーマ:種類」（スキーマ指定なしは「:種類」）
  acl text,
  rls_enabled boolean,
  reloptions text[],
  policy_def jsonb,
  captured_at timestamptz not null default now(),
  unique (kind, object_name)
);
revoke all on ops.acl_snapshot_stage2 from public, anon, authenticated;

insert into ops.acl_snapshot_stage2 (kind, object_name, acl, rls_enabled, reloptions)
select case when c.relkind = 'S' then 'sequence' else 'relation' end,
       c.relname, c.relacl::text,
       case when c.relkind in ('r','p') then c.relrowsecurity end,
       c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p','v','m','S','f');

insert into ops.acl_snapshot_stage2 (kind, object_name, acl)
select 'function', format('public.%I(%s)', p.proname, oidvectortypes(p.proargtypes)), p.proacl::text   -- to_regprocedure で引ける形
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

insert into ops.acl_snapshot_stage2 (kind, object_name, policy_def)
select 'policy', tablename || '.' || policyname,
       jsonb_build_object('table', tablename, 'name', policyname, 'permissive', permissive,
                          'roles', to_jsonb(roles), 'cmd', cmd, 'qual', qual, 'with_check', with_check)
from pg_policies
where schemaname = 'public';

insert into ops.acl_snapshot_stage2 (kind, object_name, acl)
select 'default_acl', case when d.defaclnamespace = 0 then '' else d.defaclnamespace::regnamespace::text end || ':' || d.defaclobjtype::text, d.defaclacl::text
from pg_default_acl d
where d.defaclrole = 'postgres'::regrole;

------------------------------------------------------------------------------
-- 1. テーブル・ビュー・シーケンス：anon・authenticated・PUBLIC の権限をすべて外す
--    2026-11-15 時点で anon が使えるのは、テーブル29・ビュー3・シーケンス28（bambi_* は対象外で、既に権限なし）
------------------------------------------------------------------------------
revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;

------------------------------------------------------------------------------
-- 2. 関数：PUBLIC・anon・authenticated の実行権限を外す（service_role は明示の付与があり、残る）
--    2026-11-15 時点で、public の関数77個はすべて service_role に明示の EXECUTE がある（PUBLIC 経由だけのものは0）。
--    トリガー用の関数（7個）は、トリガーの実行時には EXECUTE を確認しないため、外しても動く（回帰テストで確認）。
------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

------------------------------------------------------------------------------
-- 3. RLS が無効な10テーブルで有効にする（service_role・postgres は BYPASSRLS のため影響なし）
------------------------------------------------------------------------------
--    2026-11-15 時点の対象：bingo_card_cells、bingo_cards、bingo_mark_histories、bingo_product_mappings、card_programs、
--    card_types、cards、staff_work_sessions、stamp_cards、stamp_histories（適用時点で無効なものすべてを対象にする）
do $$
declare
  r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
    order by c.relname
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    raise notice 'RLS を有効化：%', r.relname;
  end loop;
end $$;

------------------------------------------------------------------------------
-- 4. 条件が true のポリシー（anon・authenticated・public 向け、34個）を削除する
------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and roles && array['public','anon','authenticated']::name[]
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

------------------------------------------------------------------------------
-- 5. ビュー3つを security_invoker にする（多重防御。service_role は基表の権限と BYPASSRLS を持つ）
------------------------------------------------------------------------------
--    2026-11-15 時点の対象：v_bingo_cards_current、v_stamp_cards_current、v_staff_stamp_cards_current（public のビューすべて）
do $$
declare
  r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v' order by c.relname
  loop
    execute format('alter view public.%I set (security_invoker = true)', r.relname);
  end loop;
end $$;

------------------------------------------------------------------------------
-- 6. これから postgres が作るテーブル・シーケンス・関数に、anon・authenticated の権限が自動で付かないようにする
--    * supabase_admin の既定の権限は、postgres が supabase_admin のメンバーではないため変えられない（限界）。
--      2026-11-15 時点で public のオブジェクトの所有者はすべて postgres。
--    * 関数の PUBLIC 実行権限（PostgreSQL 全体の既定）は**変えない**。スキーマを限定して外す方法がなく、
--      全体で外すと、postgres が所有する extensions スキーマの関数（pgcrypto・uuid-ossp など）を
--      今後の拡張機能の追加・更新で作り直したときに、PUBLIC が実行できなくなるため（2026-11-15 確認）。
--      そのため、public に関数を新しく作るときは、作成と同じマイグレーションで
--        revoke execute on function public.<名前>(<引数の型>) from public, anon, authenticated;
--      を必ず書く（運用ルール。docs/ops/rls-stage1-plan.md の「段階2の準備」）。
------------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

------------------------------------------------------------------------------
-- 7. 結果の確認：想定と違えば例外で全体を取り消す
------------------------------------------------------------------------------
do $$
declare
  n_rel int; n_seq int; n_fn int; n_rls int; n_pol int; n_svc_rel int; n_svc_fn int; n_view int;
begin
  select count(*) into n_rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
    and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
      or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete,truncate,references,trigger'));

  select count(*) into n_seq from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'S'
    -- has_sequence_privilege はシーケンス以外でエラーになり、条件の評価順は保証されないため case で守る
    and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage,select,update')
                                     or has_sequence_privilege('authenticated', c.oid, 'usage,select,update') end;

  select count(*) into n_fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));

  select count(*) into n_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity;

  select count(*) into n_pol from pg_policies
  where schemaname = 'public' and roles && array['public','anon','authenticated']::name[];

  select count(*) into n_view from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce(c.reloptions @> array['security_invoker=true'], false);

  -- service_role が使えなくなったものがないか（変更前に持っていた権限が、変更後も残っているか）
  select count(*) into n_svc_rel from ops.acl_snapshot_stage2 s
  join pg_class c on c.relname = s.object_name join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  cross join lateral aclexplode(coalesce(s.acl::aclitem[], acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner))) a
  where s.kind in ('relation','sequence') and a.grantee = 'service_role'::regrole
    and not exists (select 1 from aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner))) b
                    where b.grantee = a.grantee and b.privilege_type = a.privilege_type);

  select count(*) into n_svc_fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and not has_function_privilege('service_role', p.oid, 'execute');

  if n_rel + n_seq + n_fn + n_rls + n_pol + n_view + n_svc_rel + n_svc_fn > 0 then
    raise exception '段階2の確認で差がありました（anon・authenticated のテーブル %、シーケンス %、関数 %、RLS 無効 %、ポリシー %、security_invoker でないビュー %、service_role が失ったテーブル権限 %・関数 %）。全体を取り消します。',
      n_rel, n_seq, n_fn, n_rls, n_pol, n_view, n_svc_rel, n_svc_fn;
  end if;
end $$;

------------------------------------------------------------------------------
-- 適用後の確認（読み取りのみ。合格基準は docs/ops/rls-stage1-plan.md の「7.」）
------------------------------------------------------------------------------
-- 1. カタログ：上の「7.」と同じ条件が0件であること（例外にならずに完了していれば満たしている）。
-- 2. API：anon キーで PostgREST を呼び、拒否されること（tools/rls-stage2-anon-check.mjs。キーの値は表示しない）。
-- 3. アプリ：管理画面14画面、Discord、ハンター、イベント、19:50 の定期更新（docs/ops/rls-stage1-plan.md の「11.」）。
