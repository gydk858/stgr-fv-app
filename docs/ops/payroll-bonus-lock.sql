-- 月末ボーナスの期間も確定できるようにする（2026-11-17 案）
--
-- 原因：確定の関数 lock_payroll_period_admin は、確定の前に
--   ① 給与明細（payroll_run_items）がある
--   ② 金庫・牧場情報（payroll_period_summaries）が保存されている
-- を確かめている。月末ボーナスの保存先は payroll_monthly_bonus_runs で、②が作られないため、
-- 月末ボーナスの期間はいつも「金庫・牧場情報が保存されていないため、確定できません」になっていた。
-- （保存の関数 save_monthly_bonus_distribution は「確定済みなら保存できない」判定を持っており、
--   月末ボーナスも確定する前提で作られている）
--
-- 変更：月末ボーナスの期間（half_type = 'monthly_bonus'）だけ、①②の代わりに
--   「月末ボーナスの保存（payroll_monthly_bonus_runs）があること」を確かめる。
--   前半・後半の確定の条件、関数の名前・引数・戻り値・権限（postgres と service_role の EXECUTE）は変えない。
--   CREATE OR REPLACE は既存の権限をそのまま引き継ぐ。
-- 戻し方：docs/ops/payroll-bonus-lock-restore.sql（変更前の定義そのもの）を実行する。

CREATE OR REPLACE FUNCTION public.lock_payroll_period_admin(p_payroll_period_id bigint, p_locked_by text DEFAULT 'admin'::text)
 RETURNS TABLE(payroll_period_id bigint, status text, locked_item_count integer, locked_by text, locked_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_period record;
  v_locked_item_count integer := 0;
  v_locked_at timestamptz := now();
begin
  if p_payroll_period_id is null then
    raise exception '給与期間IDが指定されていません';
  end if;

  select *
  into v_period
  from public.payroll_periods pp
  where pp.payroll_period_id = p_payroll_period_id;

  if v_period.payroll_period_id is null then
    raise exception '給与期間が見つかりません';
  end if;

  if v_period.half_type = 'monthly_bonus' then
    -- 月末ボーナス：保存先は payroll_monthly_bonus_runs（金庫・牧場情報は作られない）
    if not exists (
      select 1
      from public.payroll_monthly_bonus_runs mbr
      where mbr.payroll_period_id = p_payroll_period_id
    ) then
      raise exception '月末ボーナスが保存されていないため、確定できません';
    end if;
  else
    if not exists (
      select 1
      from public.payroll_run_items pri
      where pri.payroll_period_id = p_payroll_period_id
    ) then
      raise exception '給与明細が作成されていないため、確定できません';
    end if;

    if not exists (
      select 1
      from public.payroll_period_summaries pps
      where pps.payroll_period_id = p_payroll_period_id
    ) then
      raise exception '金庫・牧場情報が保存されていないため、確定できません';
    end if;
  end if;

  update public.payroll_run_items pri
  set
    is_locked = true,
    updated_at = now()
  where pri.payroll_period_id = p_payroll_period_id;

  get diagnostics v_locked_item_count = row_count;

  update public.payroll_periods pp
  set
    status = 'locked',
    updated_at = now()
  where pp.payroll_period_id = p_payroll_period_id;

  return query
  select
    p_payroll_period_id::bigint,
    'locked'::text,
    v_locked_item_count::integer,
    coalesce(p_locked_by, 'admin')::text,
    v_locked_at::timestamptz;
end;
$function$;

-- 確認用（実行後）
-- select proacl from pg_proc where oid = 'public.lock_payroll_period_admin(bigint,text)'::regprocedure;
--   → {postgres=X/postgres,service_role=X/postgres} のままであること
