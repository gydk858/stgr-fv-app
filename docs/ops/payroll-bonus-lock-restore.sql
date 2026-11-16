-- 戻し用：lock_payroll_period_admin を 2026-11-17 の変更前の定義に戻す
-- （docs/ops/payroll-bonus-lock.sql を取り消すときに実行する。2026-11-17 に本番から取得した定義そのもの）

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
