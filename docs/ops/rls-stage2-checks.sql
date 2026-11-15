-- RLS・権限 段階2の確認用クエリ（読み取りのみ。権限は変えない）
-- 段階2の適用前と適用後に、同じクエリを実行して結果を比べる。
-- 前提：docs/ops/rls-stage2.sql

------------------------------------------------------------------------------
-- A. service_role の実効権限（適用前後で同じであること）
--    has_*_privilege は PUBLIC 経由の権限も含めた「実効」の権限を返す。
------------------------------------------------------------------------------
select
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v')) as relations,
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v')
     and has_table_privilege('service_role', c.oid, 'select,insert,update,delete')) as relations_service_rw,
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'S') as sequences,
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
     and case when c.relkind = 'S' then has_sequence_privilege('service_role', c.oid, 'usage') and has_sequence_privilege('service_role', c.oid, 'select')
     and has_sequence_privilege('service_role', c.oid, 'update') end) as sequences_service_all,
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace) as functions,
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('service_role', p.oid, 'execute')) as functions_service_exec,
  -- PUBLIC から EXECUTE を外す関数のうち、service_role に明示の付与がないもの（0 であること）
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
     and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 'service_role'::regrole and a.privilege_type = 'EXECUTE')) as public_exec_without_service_grant,
  (select rolbypassrls from pg_roles where rolname = 'service_role') as service_bypassrls,
  (select has_schema_privilege('service_role', 'public', 'usage')) as service_schema_usage;

------------------------------------------------------------------------------
-- B. anon・authenticated の実効権限（適用後は、すべて 0 であること）
------------------------------------------------------------------------------
select r.rolname,
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f')
     and has_table_privilege(r.rolname, c.oid, 'select,insert,update,delete,truncate,references,trigger')) as relations,
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
     and case when c.relkind = 'S' then has_sequence_privilege(r.rolname, c.oid, 'usage,select,update') end) as sequences,
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and has_function_privilege(r.rolname, p.oid, 'execute')) as functions,
  (select count(*) from pg_policies where schemaname = 'public' and roles && array[r.rolname, 'public']::name[]) as policies
from pg_roles r where r.rolname in ('anon', 'authenticated') order by 1;

------------------------------------------------------------------------------
-- C. 段階2で変えないもの（適用前後で同じであること）
------------------------------------------------------------------------------
select
  (select json_agg(json_build_object('bucket', id, 'public', public) order by id) from storage.buckets) as buckets,
  (select count(*) from pg_policies where schemaname = 'storage') as storage_policies,
  (select json_agg(distinct pg_get_userbyid(proowner)) from pg_proc where pronamespace = 'storage'::regnamespace) as storage_function_owners,
  (select count(*) from pg_proc p where p.pronamespace = 'extensions'::regnamespace and has_function_privilege('anon', p.oid, 'execute')) as extensions_anon_exec,
  (select json_agg(json_build_object('job', jobname, 'user', username, 'active', active)) from cron.job) as cron_jobs;
