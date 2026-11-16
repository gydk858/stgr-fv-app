-- 10月以前の「退勤が押されていない勤務記録」を退勤扱いにする（2026-11-17、ユーザー依頼）
--
-- 背景：以前は退勤を押さない運用（出勤だけ）だったため、9〜10月の勤務記録が status='open' のまま残り、
--       ホームの「確認が必要なこと」に出続けていた。今から正しい退勤時刻はわからない。
-- 方針：勤務時間を作らないよう、退勤時刻＝出勤時刻（勤務時間0分・加算対象0分）で status='closed' にする。
--       給与の出勤数は staff_attendance_events から数えるので影響しない。月末ボーナスの加算対象時間も 0 のまま。
--       いつもの退勤（staff_clock_out）と同じく staff_work_session_adjustments に変更の記録を残す。
-- 対象：work_session_id 2, 9, 53, 89, 135（すべて status='open'、work_date が 2026-10-31 以前）。
--       11/5 の Bambi22（id 156）と当日出勤中の記録は対象外。
-- 戻し方：docs/ops/close-old-work-sessions-20261117-restore.sql

with targets as (
  select *
  from public.staff_work_sessions
  where work_session_id in (2, 9, 53, 89, 135)
    and status = 'open'
    and clock_out_at is null
    and work_date <= date '2026-10-31'
  for update
),
updated as (
  update public.staff_work_sessions s
  set
    clock_out_at = t.clock_in_at,
    worked_minutes = 0,
    bonus_eligible_minutes = 0,
    status = 'closed',
    note = coalesce(t.note, '') || ' ／ 退勤を押さない運用の時期のため退勤扱い（勤務時間0分、2026-11-17 管理者）',
    acted_by = 'admin_cleanup_20261117'
  from targets t
  where s.work_session_id = t.work_session_id
  returning s.*, t.clock_out_at as before_clock_out_at, t.worked_minutes as before_worked_minutes, t.bonus_eligible_minutes as before_bonus_eligible_minutes
)
insert into public.staff_work_session_adjustments (
  work_session_id, user_id, staff_code, work_date, adjustment_type,
  before_clock_in_at, after_clock_in_at, before_clock_out_at, after_clock_out_at,
  before_worked_minutes, after_worked_minutes, before_bonus_eligible_minutes, after_bonus_eligible_minutes,
  reason, source, acted_by
)
select
  u.work_session_id, u.user_id, u.staff_code, u.work_date, 'manual_fix',
  u.clock_in_at, u.clock_in_at, u.before_clock_out_at, u.clock_out_at,
  u.before_worked_minutes, u.worked_minutes, u.before_bonus_eligible_minutes, u.bonus_eligible_minutes,
  '退勤を押さない運用の時期のため退勤扱い（勤務時間0分）', 'admin', 'admin_cleanup_20261117'
from updated u;
