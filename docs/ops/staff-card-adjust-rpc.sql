-- 従業員カードの +1 / -1 / リセットを、出勤履歴とカード表示の更新をまとめた1トランザクションで行う RPC
-- 対象：Supabase プロジェクト arahjxdrmqqvzzmyxuot
-- 呼び出し元：/api/admin-staff の adjust_card（service role、管理ログイン必須）。画像の生成はこの RPC の後に API が行う。
--
-- 背景：これまで管理画面は、出勤履歴（record_staff_attendance_event）とカード表示（increment_stamp_card / reset_stamp_card）を
--       ブラウザから別々に呼んでいたため、途中で失敗すると片方だけ更新される余地があった。
-- 方針
--   * 既存の RPC をこの順で呼ぶ：出勤履歴 → カード表示。PostgREST の1回の RPC 呼び出しは1トランザクションなので、
--     どちらかが失敗すれば両方とも取り消される。
--   * 出勤履歴の月合計が 0 未満になる減算は、record_staff_attendance_event が拒否する（staff-attendance-negative-guard.sql）。
--   * 対象は「指定した店舗の在籍中の従業員」の、有効な従業員カードだけ。店舗はサーバー（API）が決めて渡す。
--   * work_date は DB の bambi_current_work_date_jst()（JST、4時前は前日）。Discord の出退勤と同じ。
--   * 実行できるのは service_role だけ（anon・authenticated・PUBLIC には付与しない）。
--   * 回帰テスト：tools/tests/staff-attendance-guard/（PGlite、合成データ）

create or replace function public.staff_card_adjust_admin(
  p_store_id bigint,
  p_user_id bigint,
  p_action text,
  p_acted_by text default 'admin_staff_ui'
)
returns table(card_id bigint, current_count integer, max_count integer, attendance_event_id bigint, work_date date)
language plpgsql
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_status text;
  v_card_id bigint;
  v_work_date date;
  v_amount integer;
  v_type text;
  v_note text;
  v_event_id bigint;
begin
  if p_action is null or p_action not in ('add', 'remove', 'reset') then
    raise exception '操作の指定が正しくありません';
  end if;

  select ep.employment_status into v_status
    from public.employee_profiles ep
   where ep.user_id = p_user_id and ep.store_id = p_store_id;
  if not found then
    raise exception '対象の従業員が見つかりません';
  end if;
  if v_status is distinct from 'active' then
    raise exception 'この従業員は退職済みのため、出勤数を操作できません。';
  end if;

  select v.card_id into v_card_id
    from public.v_staff_stamp_cards_current v
   where v.user_id = p_user_id
     and v.program_code = 'stamp_staff_attendance'
     and v.card_status = 'active';
  if v_card_id is null then
    raise exception 'この従業員カードは見つかりません';
  end if;

  v_work_date := public.bambi_current_work_date_jst();
  v_amount := case p_action when 'add' then 1 when 'remove' then -1 else 0 end;
  v_type := case p_action when 'add' then 'work' when 'remove' then 'adjust_minus' else 'reset_adjust' end;
  v_note := case p_action
    when 'add' then '管理画面から出勤数追加'
    when 'remove' then '管理画面から出勤数減算'
    else '管理画面から従業員カードリセット' end;

  -- 1. 出勤履歴（給与の出勤数の元）
  select e.attendance_event_id into v_event_id
    from public.record_staff_attendance_event(
      p_user_id => p_user_id, p_work_date => v_work_date, p_amount => v_amount,
      p_event_type => v_type, p_source => 'admin_staff_ui', p_note => v_note, p_acted_by => p_acted_by) e;

  -- 2. カードの表示数（リセットは表示数だけを 0 にする。出勤履歴には 0 を記録済み）
  if p_action = 'reset' then
    perform 1 from public.reset_stamp_card(p_card_id => v_card_id, p_acted_by => p_acted_by, p_reason => v_note);
  else
    perform 1 from public.increment_stamp_card(p_card_id => v_card_id, p_amount => v_amount, p_acted_by => p_acted_by, p_reason => v_note);
  end if;

  return query
    select sc.card_id, sc.current_count, sc.max_count, v_event_id, v_work_date
      from public.stamp_cards sc
     where sc.card_id = v_card_id;
end;
$function$;

revoke all on function public.staff_card_adjust_admin(bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.staff_card_adjust_admin(bigint, bigint, text, text) to service_role;

------------------------------------------------------------------------------
-- 戻し方（画面は旧コードに戻してから）：
-- drop function if exists public.staff_card_adjust_admin(bigint, bigint, text, text);
------------------------------------------------------------------------------
