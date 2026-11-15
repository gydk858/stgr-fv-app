-- 出勤履歴（staff_attendance_events）の月合計が 0 未満にならないことを、更新側（RPC）で保証する
-- 対象：Supabase プロジェクト arahjxdrmqqvzzmyxuot
-- 背景：2026-11-01 に、管理画面の従業員カードで前月から繰り越した表示を「-1」で消したため、
--       11月の出勤履歴に -1 が入り、Bambi01 の 11/15 の出勤が相殺された（docs/PROJECT-HANDOVER.md の 11.）。
--
-- 方針
--   * 出勤履歴を書き込むのは public.record_staff_attendance_event だけ（2026-11-15 に全関数・全コードで確認）。
--     staff_clock_in、staff_fix_work_session(_with_details) はこの RPC に +1 を渡す。管理画面の +1 / -1 / リセット（0）もこの RPC。
--   * 負の amount のときだけ、work_date の暦月（カードの表示数・Discord の数え方と同じ）の合計を確認し、
--     合計 + amount が 0 未満なら例外にする。正の amount と 0 は従来どおり。
--   * 同時の減算で確認と書き込みが食い違わないよう、従業員×月ごとの advisory lock（トランザクション終了まで）を取る。
--     正の書き込みは合計を増やすだけなので、ロックしない（減算の確認が古い合計を見ても、安全側にしか外れない）。
--   * 引数・戻り値・権限は変えない（CREATE OR REPLACE は既存の権限を保つ）。
--   * 回帰テスト：tools/tests/staff-attendance-guard/（PGlite、合成データ）

create or replace function public.record_staff_attendance_event(
  p_user_id bigint,
  p_work_date date default current_date,
  p_amount integer default 1,
  p_event_type text default 'work'::text,
  p_source text default 'admin_ui'::text,
  p_note text default null::text,
  p_acted_by text default null::text
)
returns table(attendance_event_id bigint, store_id bigint, user_id bigint, staff_code text, work_date date, amount integer, event_type text)
language plpgsql
as $function$
declare
  v_store_id bigint;
  v_staff_code text;
  v_attendance_event_id bigint;
  v_month_start date;
  v_month_total bigint;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_work_date is null then
    raise exception 'work_date is required';
  end if;

  select
    u.store_id,
    ep.staff_code
  into
    v_store_id,
    v_staff_code
  from public.users u
  join public.employee_profiles ep
    on ep.user_id = u.user_id
  where u.user_id = p_user_id;

  if v_store_id is null then
    raise exception 'store not found for user_id: %', p_user_id;
  end if;

  if v_staff_code is null then
    raise exception 'staff_code not found for user_id: %', p_user_id;
  end if;

  -- 減算は、その月の出勤履歴の合計が 0 未満にならない範囲だけ認める
  if coalesce(p_amount, 0) < 0 then
    v_month_start := date_trunc('month', p_work_date)::date;
    perform pg_advisory_xact_lock(
      hashtext('staff_attendance_month'),
      hashtext(p_user_id::text || ':' || v_month_start::text)
    );
    select coalesce(sum(e.amount), 0)
      into v_month_total
      from public.staff_attendance_events e
     where e.user_id = p_user_id
       and e.work_date >= v_month_start
       and e.work_date < (v_month_start + interval '1 month')::date;
    if v_month_total + p_amount < 0 then
      raise exception '出勤履歴の合計が0未満になるため減算できません（%年%月の合計: %回）',
        extract(year from v_month_start)::int, extract(month from v_month_start)::int, v_month_total;
    end if;
  end if;

  insert into public.staff_attendance_events (
    store_id,
    user_id,
    staff_code,
    work_date,
    amount,
    event_type,
    source,
    note,
    acted_by,
    created_at,
    updated_at
  )
  values (
    v_store_id,
    p_user_id,
    v_staff_code,
    p_work_date,
    p_amount,
    p_event_type,
    p_source,
    p_note,
    p_acted_by,
    now(),
    now()
  )
  returning public.staff_attendance_events.attendance_event_id
  into v_attendance_event_id;

  return query
  select
    v_attendance_event_id,
    v_store_id,
    p_user_id,
    v_staff_code,
    p_work_date,
    p_amount,
    p_event_type;
end;
$function$;

------------------------------------------------------------------------------
-- 確認用（読み取りのみ）：月合計が 0 未満の従業員×月が無いこと
------------------------------------------------------------------------------
-- select user_id, date_trunc('month', work_date)::date as month, sum(amount)
-- from public.staff_attendance_events group by 1, 2 having sum(amount) < 0;

------------------------------------------------------------------------------
-- 戻し方：上の関数から「減算は、その月の…」の if ブロックと、変数 v_month_start・v_month_total を
-- 取り除いた定義で create or replace する（= 2026-11-15 以前の定義。git の履歴にある本ファイルの初版の差分を参照）。
------------------------------------------------------------------------------
