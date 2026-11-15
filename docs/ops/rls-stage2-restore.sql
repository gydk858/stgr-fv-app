-- RLS・権限 段階2の戻し方
-- 対象：Supabase プロジェクト arahjxdrmqqvzzmyxuot
-- 前提：段階2（docs/ops/rls-stage2.sql）の適用時に保存した ops.acl_snapshot_stage2
-- 状態：段階2は**未適用**（2026-11-15）。この SQL は、段階2の適用後に問題が出たときに使う。
-- 検証：PGlite 0.5.14（PostgreSQL 18.6）上の合成データで、前進 → 復元の往復と、止まる条件を確認した
--       （回帰テスト：tools/tests/rls-stage2/）。本番の PostgreSQL 17.6 では実行していない。
--
-- ■ 何を戻すか（段階2で変えたものだけ）
--   * public のテーブル・ビュー・シーケンス・関数の、PUBLIC・anon・authenticated への権限（付与オプションを含む）。
--     service_role・postgres など、ほかのロールの権限には触れない。
--   * RLS の有効・無効、ビューのオプション（security_invoker）。
--   * 削除したポリシー（保存した定義から作り直す）。
--   * postgres の既定の権限（anon・authenticated・PUBLIC の分）。
--
-- ■ 止まる条件（severity = 'block' が1件でもあれば、復元は実行されない）
--   * ops.acl_snapshot_stage2 が無い、または保存が複数回分ある／指定した captured_at と一致しない
--   * 同じ名前のポリシーが、保存した定義と違う内容で存在する（段階2の後に誰かが作った可能性）
--   * 実行するロールが postgres ではない（復元の実行時）
--
-- ■ 判別できないこと（限界）
--   * 段階2の後に作られたオブジェクトやポリシーには触れない（info として表示する）。
--   * 段階2の後に削除されたオブジェクトは戻せない（info として表示し、ほかは続ける）。
--   * 付与者（grantor）は比べない。復元した権限の付与者は postgres になる。
--   * スナップショットには OID を保存していないため、同じ名前で作り直されたオブジェクトは見分けられない。
--   * supabase_admin の既定の権限は、段階2でも変えておらず、ここでも扱わない。
--
-- ■ 使い方（Supabase の SQL Editor では、ファイル全体を1回の実行で流す）
--   1. そのまま実行する：計画を表示するだけで、権限は変えない。作るのは一時関数（pg_temp）だけ。
--      最初の行（seq 0）に captured_at と plan_hash が出る。block が0件であることを確認する。
--   2. 復元する（承認後のみ）：ファイル末尾の「復元の実行」のコメントを外し、1 で表示された
--      captured_at と plan_hash を貼り付けて、ファイル全体を実行する。
--      計画が 1 の表示から変わっていれば止まる。復元は1つの文の中で行い、途中で失敗するか、
--      復元後に差が残れば、全体が取り消される。
--   3. もう一度そのまま実行し、restore と block が0件であることを確認する。
--   4. 段階0の復元（rls-stage0-restore.sql）は、ops.acl_snapshot_stage2 があると止まる。
--      段階0まで戻す場合は、段階2を戻した後に、ops.acl_snapshot_stage2 を別名に退避してから行う。

------------------------------------------------------------------------------
-- ACL のうち、PUBLIC・anon・authenticated の分を「付与先|権限|付与オプション」の配列にする
------------------------------------------------------------------------------
create or replace function pg_temp.stage2_entries(p_acl aclitem[])
returns text[]
language sql stable
as $fn$
  -- 並び順を値で固定する（ACL の中の順番は GRANT・REVOKE で変わるため、順番の違いを差にしない）
  select coalesce(array_agg(x order by x), '{}')
  from (
    select format('%s|%s|%s', case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end,
                  a.privilege_type, case when a.is_grantable then 'true' else 'false' end) x
    from aclexplode(case when cardinality(p_acl) > 0 then p_acl end) a  -- 空・NULL は0行（空配列は aclexplode がエラーにする）
    where a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole)
  ) t
$fn$;

-- 対象の権限を、PUBLIC・anon・authenticated について「保存した状態」に揃える文
create or replace function pg_temp.stage2_grant_sql(p_target text, p_entries text[])
returns text
language sql immutable
as $fn$
  select format('revoke all on %s from public, anon, authenticated;', p_target)
    || coalesce(string_agg(format(' grant %s on %s to %s%s;',
         split_part(e, '|', 2), p_target,
         case split_part(e, '|', 1) when 'PUBLIC' then 'public' else quote_ident(split_part(e, '|', 1)) end,
         case split_part(e, '|', 3) when 'true' then ' with grant option' else '' end), '' order by e), '')
  from unnest(p_entries) e
$fn$;

------------------------------------------------------------------------------
-- 計画（読み取りだけ。権限は変えない）
------------------------------------------------------------------------------
create or replace function pg_temp.stage2_plan(p_captured_at timestamptz default null)
returns table(seq int, severity text, item_kind text, item text, stmt text)
language plpgsql volatile
as $fn$
declare
  v_at timestamptz;
  v_n int;
  r record;
  c record;
  f record;
  p record;
  d jsonb;
  v_kind "char";
  v_want text[];
  v_cur text[];
  v_roles text;
  v_key text;
  v_ns oid;
  v_type "char";
  v_word text;
  v_default text[];
  e text;
  i int := 0;
begin
  if to_regclass('ops.acl_snapshot_stage2') is null then
    seq := 0; severity := 'block'; item_kind := 'snapshot'; item := 'ops.acl_snapshot_stage2';
    stmt := 'スナップショットがありません（段階2は未適用）'; return next; return;
  end if;
  select count(distinct s.captured_at), min(s.captured_at) into v_n, v_at from ops.acl_snapshot_stage2 s;
  if v_n <> 1 or (p_captured_at is not null and p_captured_at <> v_at) then
    seq := 0; severity := 'block'; item_kind := 'snapshot'; item := 'ops.acl_snapshot_stage2';
    stmt := format('対象のスナップショットを決められません（保存 %s 回分、指定 %s）', v_n, coalesce(p_captured_at::text, 'なし'));
    return next; return;
  end if;

  -- テーブル・ビュー・シーケンス
  for r in select s.* from ops.acl_snapshot_stage2 s where s.kind in ('relation','sequence') order by s.kind, s.object_name loop
    select cl.oid, cl.relkind, cl.relowner, cl.relacl, cl.relrowsecurity, cl.reloptions into c
    from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and cl.relname = r.object_name;
    if not found then
      i := i + 1; seq := i; severity := 'info'; item_kind := r.kind; item := r.object_name;
      stmt := '段階2の後に削除されています（戻せないため対象外）'; return next; continue;
    end if;
    v_kind := case when c.relkind = 'S' then 's' else 'r' end;
    v_want := pg_temp.stage2_entries(coalesce(r.acl::aclitem[], acldefault(v_kind, c.relowner)));
    v_cur  := pg_temp.stage2_entries(coalesce(c.relacl, acldefault(v_kind, c.relowner)));
    if v_want is distinct from v_cur then
      i := i + 1; seq := i; severity := 'restore'; item_kind := r.kind; item := r.object_name;
      stmt := pg_temp.stage2_grant_sql(format('%s public.%I', case when c.relkind = 'S' then 'sequence' else 'table' end, r.object_name), v_want);
      return next;
    end if;
    if c.relkind in ('r','p') and r.rls_enabled is distinct from c.relrowsecurity then
      i := i + 1; seq := i; severity := 'restore'; item_kind := 'rls'; item := r.object_name;
      stmt := format('alter table public.%I %s row level security;', r.object_name, case when r.rls_enabled then 'enable' else 'disable' end);
      return next;
    end if;
    if c.relkind = 'v' and coalesce(r.reloptions, '{}') is distinct from coalesce(c.reloptions, '{}') then
      i := i + 1; seq := i; severity := 'restore'; item_kind := 'view_options'; item := r.object_name;
      stmt := format('alter view public.%I reset (security_invoker);', r.object_name)
        || case when coalesce(cardinality(r.reloptions), 0) > 0
                then format(' alter view public.%I set (%s);', r.object_name, array_to_string(r.reloptions, ', ')) else '' end;
      return next;
    end if;
  end loop;

  -- 関数
  for r in select s.* from ops.acl_snapshot_stage2 s where s.kind = 'function' order by s.object_name loop
    select pr.oid, pr.proowner, pr.proacl into f from pg_proc pr where pr.oid = to_regprocedure(r.object_name);
    if not found or f.oid is null then
      i := i + 1; seq := i; severity := 'info'; item_kind := 'function'; item := r.object_name;
      stmt := '段階2の後に削除されています（戻せないため対象外）'; return next; continue;
    end if;
    v_want := pg_temp.stage2_entries(coalesce(r.acl::aclitem[], acldefault('f', f.proowner)));
    v_cur  := pg_temp.stage2_entries(coalesce(f.proacl, acldefault('f', f.proowner)));
    if v_want is distinct from v_cur then
      i := i + 1; seq := i; severity := 'restore'; item_kind := 'function'; item := r.object_name;
      stmt := pg_temp.stage2_grant_sql('function ' || r.object_name, v_want);
      return next;
    end if;
  end loop;

  -- ポリシー（削除したものを作り直す）
  for r in select s.* from ops.acl_snapshot_stage2 s where s.kind = 'policy' order by s.object_name loop
    d := r.policy_def;
    if to_regclass(format('public.%I', d->>'table')) is null then
      i := i + 1; seq := i; severity := 'info'; item_kind := 'policy'; item := r.object_name;
      stmt := 'テーブルが段階2の後に削除されています（対象外）'; return next; continue;
    end if;
    select pp.* into p from pg_policies pp where pp.schemaname = 'public' and pp.tablename = d->>'table' and pp.policyname = d->>'name';
    if found then
      if p.permissive is distinct from d->>'permissive' or to_jsonb(p.roles) is distinct from d->'roles'
         or p.cmd is distinct from d->>'cmd' or p.qual is distinct from d->>'qual' or p.with_check is distinct from d->>'with_check' then
        i := i + 1; seq := i; severity := 'block'; item_kind := 'policy'; item := r.object_name;
        stmt := '同じ名前のポリシーが、保存した定義と違う内容で存在します'; return next;
      end if;
      continue;
    end if;
    select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ' order by x) into v_roles
    from jsonb_array_elements_text(d->'roles') x;
    i := i + 1; seq := i; severity := 'restore'; item_kind := 'policy'; item := r.object_name;
    stmt := format('create policy %I on public.%I as %s for %s to %s', d->>'name', d->>'table', d->>'permissive', d->>'cmd', v_roles)
      || case when d->>'qual' is not null then format(' using (%s)', d->>'qual') else '' end
      || case when d->>'with_check' is not null then format(' with check (%s)', d->>'with_check') else '' end || ';';
    return next;
  end loop;

  -- 段階2の後に作られた、anon・authenticated・public 向けのポリシー（触れない）
  for p in select pp.tablename, pp.policyname from pg_policies pp
           where pp.schemaname = 'public'
             and not exists (select 1 from ops.acl_snapshot_stage2 s where s.kind = 'policy' and s.object_name = pp.tablename || '.' || pp.policyname)
           order by 1, 2 loop
    i := i + 1; seq := i; severity := 'info'; item_kind := 'policy'; item := p.tablename || '.' || p.policyname;
    stmt := '段階2の後に作られたポリシーです（触れない）'; return next;
  end loop;

  -- postgres の既定の権限（PUBLIC・anon・authenticated の分）
  for v_key in
    select s.object_name from ops.acl_snapshot_stage2 s where s.kind = 'default_acl'
    union
    select case when da.defaclnamespace = 0 then '' else da.defaclnamespace::regnamespace::text end || ':' || da.defaclobjtype::text
    from pg_default_acl da where da.defaclrole = 'postgres'::regrole
    union select ':f'
    order by 1
  loop
    v_type := split_part(v_key, ':', 2);
    v_ns := case when split_part(v_key, ':', 1) = '' then 0 else to_regnamespace(split_part(v_key, ':', 1)) end;
    if v_ns is null then continue; end if;
    v_word := case v_type when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' when 'T' then 'types' when 'n' then 'schemas' end;
    -- 行が無いときの既定：スキーマ指定なしは PostgreSQL の既定（関数・型は PUBLIC が使える）、スキーマ指定ありは追加なし
    v_default := case when v_ns = 0 then pg_temp.stage2_entries(acldefault(v_type, 'postgres'::regrole)) else '{}' end;
    -- 保存時に行が無かった種類は、行が無いときの既定（v_default）を目標にする
    select case when s.object_name is null then v_default else pg_temp.stage2_entries(s.acl::aclitem[]) end into v_want
    from (select 1) one left join ops.acl_snapshot_stage2 s on s.kind = 'default_acl' and s.object_name = v_key;
    select pg_temp.stage2_entries(da.defaclacl) into v_cur from pg_default_acl da
    where da.defaclrole = 'postgres'::regrole and da.defaclnamespace = v_ns and da.defaclobjtype = v_type;
    if not found then v_cur := v_default; end if;
    if v_want is distinct from v_cur then
      i := i + 1; seq := i; severity := 'restore'; item_kind := 'default_acl'; item := v_key;
      stmt := '';
      foreach e in array v_cur loop
        if not e = any (v_want) then
          stmt := stmt || format('alter default privileges for role postgres%s revoke %s on %s from %s; ',
            case when v_ns = 0 then '' else ' in schema ' || quote_ident(split_part(v_key, ':', 1)) end,
            split_part(e, '|', 2), v_word,
            case split_part(e, '|', 1) when 'PUBLIC' then 'public' else quote_ident(split_part(e, '|', 1)) end);
        end if;
      end loop;
      foreach e in array v_want loop
        if not e = any (v_cur) then
          stmt := stmt || format('alter default privileges for role postgres%s grant %s on %s to %s%s; ',
            case when v_ns = 0 then '' else ' in schema ' || quote_ident(split_part(v_key, ':', 1)) end,
            split_part(e, '|', 2), v_word,
            case split_part(e, '|', 1) when 'PUBLIC' then 'public' else quote_ident(split_part(e, '|', 1)) end,
            case split_part(e, '|', 3) when 'true' then ' with grant option' else '' end);
        end if;
      end loop;
      return next;
    end if;
  end loop;

  -- 先頭行：対象のスナップショットと計画の指紋
  seq := 0; severity := 'summary'; item_kind := 'snapshot'; item := v_at::text;
  stmt := 'plan_hash=' || md5(coalesce((select string_agg(x.severity || '|' || x.item_kind || '|' || x.item || '|' || x.stmt, E'\n' order by x.seq)
                                         from pg_temp.stage2_plan_rows x), ''));
  return next;
end
$fn$;

-- 計画の行をいったん受ける一時テーブル（plan_hash の計算用。接続を閉じると消える）
create temp table if not exists stage2_plan_rows (seq int, severity text, item_kind text, item text, stmt text);

create or replace function pg_temp.stage2_plan_refresh(p_captured_at timestamptz default null)
returns table(seq int, severity text, item_kind text, item text, stmt text)
language plpgsql volatile
as $fn$
begin
  -- 先頭行（summary）の plan_hash は、それ以外の行から計算するため、2回に分けて作る
  truncate pg_temp.stage2_plan_rows;
  insert into pg_temp.stage2_plan_rows select * from pg_temp.stage2_plan(p_captured_at) x where x.severity <> 'summary';
  return query
    select x.seq, x.severity, x.item_kind, x.item, x.stmt from pg_temp.stage2_plan(p_captured_at) x
    where x.severity = 'summary'
    union all
    select y.seq, y.severity, y.item_kind, y.item, y.stmt from pg_temp.stage2_plan_rows y
    order by 1;
end
$fn$;

------------------------------------------------------------------------------
-- 復元の実行（postgres で、計画の captured_at と plan_hash を渡したときだけ）
------------------------------------------------------------------------------
create or replace function pg_temp.stage2_restore(p_captured_at timestamptz, p_plan_hash text)
returns table(seq int, severity text, item_kind text, item text, stmt text)
language plpgsql volatile
as $fn$
declare
  r record;
  v_hash text;
  v_left int;
begin
  if current_user <> 'postgres' then
    raise exception '復元は postgres で実行してください（現在：%）', current_user;
  end if;
  if p_captured_at is null or p_plan_hash is null then
    raise exception 'captured_at と plan_hash を指定してください（計画の表示で確認した値）';
  end if;
  select x.stmt into v_hash from pg_temp.stage2_plan_refresh(p_captured_at) x where x.seq = 0;
  if exists (select 1 from pg_temp.stage2_plan_rows y where y.severity = 'block') or v_hash not like 'plan_hash=%' then
    raise exception '止まる条件（block）があります。計画を表示して確認してください。';
  end if;
  if v_hash <> 'plan_hash=' || p_plan_hash then
    raise exception '計画が表示したときから変わっています（plan_hash が一致しません）';
  end if;
  for r in select y.* from pg_temp.stage2_plan_rows y where y.severity = 'restore' order by y.seq loop
    execute r.stmt;
    seq := r.seq; severity := 'done'; item_kind := r.item_kind; item := r.item; stmt := r.stmt;
    return next;
  end loop;
  perform 1 from pg_temp.stage2_plan_refresh(p_captured_at);
  select count(*) into v_left from pg_temp.stage2_plan_rows y where y.severity in ('restore','block');
  if v_left > 0 then
    raise exception '復元後も差が % 件残りました。全体を取り消します。', v_left;
  end if;
end
$fn$;

------------------------------------------------------------------------------
-- 計画の表示（そのまま実行したときの結果）
------------------------------------------------------------------------------
select * from pg_temp.stage2_plan_refresh();

------------------------------------------------------------------------------
-- 復元の実行（承認後のみ。コメントを外し、計画の表示で出た値を貼り付ける）
------------------------------------------------------------------------------
-- select * from pg_temp.stage2_restore('<captured_at>'::timestamptz, '<plan_hash>');
