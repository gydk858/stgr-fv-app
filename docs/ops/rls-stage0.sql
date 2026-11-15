-- RLS・権限 段階0：画面を壊さずに、anon（ブラウザ公開キー）から明らかに不要な権限を外す
-- 対象：Supabase プロジェクト arahjxdrmqqvzzmyxuot
-- 背景：docs/PROJECT-HANDOVER.md の「9. 未解決事項」と「11. 移行記録」（RLS 調査）を参照
--
-- 方針
--   * 管理画面（ブラウザ → anon キー）から呼ばれている関数・テーブルには触れない。
--   * service role（サーバー側）と postgres の権限は変えない。
--   * 変更前の ACL を ops.acl_snapshot_stage0 に保存し、戻すときはそこから復元する。
--   * 実行はユーザーの承認後。1つのマイグレーション（1トランザクション）で適用する。

------------------------------------------------------------------------------
-- 0. 変更前の ACL を保存（ops スキーマは API に公開されていない）
------------------------------------------------------------------------------
-- 再実行の防止：段階0の適用後にこの SQL をもう一度流すと、権限を外した後の状態が
-- 2回目のスナップショットとして追加され、復元の元データが混ざる。保存済みの行があれば止める。
-- （段階0は 2026-11-15 に適用済み。このファイルは記録用で、再実行しない）
do $$
declare
  has_rows boolean;
begin
  if to_regclass('ops.acl_snapshot_stage0') is not null then
    execute 'select exists (select 1 from ops.acl_snapshot_stage0)' into has_rows;
    if has_rows then
      raise exception 'ops.acl_snapshot_stage0 に保存済みの行があります。段階0は適用済みのため、再実行しないでください。';
    end if;
  end if;
end $$;

create table if not exists ops.acl_snapshot_stage0 (
  kind text not null,          -- 'function' | 'relation'
  object_name text not null,   -- 関数は identity 付き、テーブル・ビューは名前
  acl text,
  rls_enabled boolean,
  captured_at timestamptz not null default now()
);
revoke all on ops.acl_snapshot_stage0 from public, anon, authenticated;

insert into ops.acl_snapshot_stage0 (kind, object_name, acl, rls_enabled)
select 'function', p.oid::regprocedure::text, p.proacl::text, null
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = any (array[
  'reset_system_runtime_data','reset_all_stamp_cards','reset_all_bingo_cards',
  'reset_regular_customer_stamp_cards','archive_active_stamp_cards','archive_active_bingo_cards',
  'staff_clock_in','staff_clock_out','staff_fix_work_session',
  'snapshot_staff_stamps_for_period','build_payroll_run_preview','upsert_ranch_care_event'])
union all
select 'relation', c.relname, c.relacl::text, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p','v','m');

------------------------------------------------------------------------------
-- 1. コードから使われていない、またはサーバー（service role）だけが使う関数
--    PUBLIC（=X）経由でも実行できるため、PUBLIC からも外す
--    呼び出し元の確認（2026-11-15）
--      reset_all_stamp_cards              → /api/admin-reset-stamps（service role）
--      reset_regular_customer_stamp_cards → /api/admin-reset-system（service role）
--      staff_clock_in / staff_clock_out   → Discord スタンプ（service role）
--      それ以外                           → コードからの参照なし
--      snapshot_staff_stamps_for_period を呼ぶ build_payroll_run_preview も、参照なし
------------------------------------------------------------------------------
revoke execute on function public.reset_system_runtime_data(text, text)              from public, anon, authenticated;
revoke execute on function public.reset_all_stamp_cards(text, text)                  from public, anon, authenticated;
revoke execute on function public.reset_all_bingo_cards(text, text)                  from public, anon, authenticated;
revoke execute on function public.reset_regular_customer_stamp_cards(text, text)     from public, anon, authenticated;
revoke execute on function public.archive_active_stamp_cards(text, text)             from public, anon, authenticated;
revoke execute on function public.archive_active_bingo_cards(text, text)             from public, anon, authenticated;
revoke execute on function public.staff_clock_in(bigint, text, text, text)           from public, anon, authenticated;
revoke execute on function public.staff_clock_out(bigint, text, text, text)          from public, anon, authenticated;
revoke execute on function public.staff_fix_work_session(bigint, date, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.snapshot_staff_stamps_for_period(bigint)           from public, anon, authenticated;
revoke execute on function public.build_payroll_run_preview(bigint, bigint)          from public, anon, authenticated;
revoke execute on function public.upsert_ranch_care_event(bigint, bigint, date, integer, text, text) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 2. コードから参照されていない5テーブル：RLS を有効にし、anon / authenticated の権限を外す
--    card_templates は 0 行。cards.template_id → card_templates の外部キーは、
--    PostgreSQL の参照整合性チェック（所有者権限で動き、RLS の影響を受けない）なので影響しない
------------------------------------------------------------------------------
alter table public.users_backup_before_stamp_migration_20260413      enable row level security;
alter table public.users_backup_before_drop_stamp_count_20260413     enable row level security;
alter table public.users_backup_before_drop_legacy_columns_20260413  enable row level security;
alter table public.stamp_migration_map                               enable row level security;
alter table public.card_templates                                    enable row level security;
revoke all on public.users_backup_before_stamp_migration_20260413     from anon, authenticated;
revoke all on public.users_backup_before_drop_stamp_count_20260413    from anon, authenticated;
revoke all on public.users_backup_before_drop_legacy_columns_20260413 from anon, authenticated;
revoke all on public.stamp_migration_map                              from anon, authenticated;
revoke all on public.card_templates                                   from anon, authenticated;

------------------------------------------------------------------------------
-- 3. アプリが使わない種類の権限（TRUNCATE / TRIGGER / REFERENCES）を外す
------------------------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

------------------------------------------------------------------------------
-- 確認用（読み取りのみ）
------------------------------------------------------------------------------
-- 関数：anon / authenticated が実行できないこと、service_role は実行できること
-- select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') auth,
--        has_function_privilege('service_role', p.oid, 'EXECUTE') service
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.oid::regprocedure::text in
--   (select object_name from ops.acl_snapshot_stage0 where kind = 'function');
--
-- テーブル：TRUNCATE が anon に残っていないこと
-- select count(*) from information_schema.role_table_grants
-- where table_schema = 'public' and grantee in ('anon','authenticated')
--   and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES');

------------------------------------------------------------------------------
-- 戻し方
------------------------------------------------------------------------------
-- docs/ops/rls-stage0-restore.sql を使う（2026-11-15 改訂）。
-- 旧版の復元 SQL（このファイルの末尾にあったもの）は次の問題があったため削除した。
--   * ACL 文字列を LIKE で判定し、PUBLIC・anon・authenticated にまとめて付与していた。
--   * 'anon=arwdDxtm/' に完全一致したテーブルだけ GRANT ALL していた（段階0の範囲外の権限も戻す）。
--   * 削除済みの ito_* テーブルがスナップショットに残っており、GRANT が失敗して復元全体が止まる。
--   * ACL が NULL の行や、スナップショットの重複を考慮していなかった。
