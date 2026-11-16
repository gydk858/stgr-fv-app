-- 戻し用：close-old-work-sessions-20261117.sql を取り消し、5件を元の「退勤なし（open）」に戻す。
-- 元の値（2026-11-17 実行前に取得）：clock_out_at=null、worked_minutes=0、bonus_eligible_minutes=0、status='open'、
-- note='Discordから出勤'、acted_by は下のとおり。

update public.staff_work_sessions s
set clock_out_at = null, worked_minutes = 0, bonus_eligible_minutes = 0, status = 'open',
    note = 'Discordから出勤', acted_by = v.acted_by
from (values
  (2::bigint,  '綺羅木らめ'),
  (9::bigint,  'アウストラロピテクス/藤獲'),
  (53::bigint, 'ゆずりは　けむ'),
  (89::bigint, 'ルイスターナー'),
  (135::bigint,'ゆずりは　けむ')
) as v(id, acted_by)
where s.work_session_id = v.id and s.acted_by = 'admin_cleanup_20261117';

delete from public.staff_work_session_adjustments
where acted_by = 'admin_cleanup_20261117' and adjustment_type = 'manual_fix'
  and work_session_id in (2, 9, 53, 89, 135);
