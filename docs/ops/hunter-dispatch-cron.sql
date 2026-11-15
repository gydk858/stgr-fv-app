-- Supabase pg_cron で毎日 19:50（日本時間）に GitHub Actions「Daily hunter print refresh」を起動する
-- 対象：Supabase プロジェクト arahjxdrmqqvzzmyxuot / GitHub gydk858/stgr-fv-app
-- 方針：docs/PROJECT-HANDOVER.md の「11. 移行記録」と「9. 未解決事項」を参照
--
-- このファイルに秘密情報は書かない。GitHub のトークンは Supabase Vault にだけ保存する。
-- 各手順は、ユーザーの承認を得てから1つずつ実行する。

------------------------------------------------------------------------------
-- 手順2（ユーザーが Supabase の SQL Editor で実行）：GitHub トークンを Vault に保存
--   <TOKEN> は、ユーザーが自分で貼り付ける。チャット・Git・資料には書かない。
--   トークンの条件：fine-grained PAT、対象リポジトリは gydk858/stgr-fv-app だけ、
--   権限は「Actions: Read and write」だけ、有効期限あり。
------------------------------------------------------------------------------
-- select vault.create_secret('<TOKEN>', 'github_dispatch_token',
--   'GitHub fine-grained PAT: Actions write on gydk858/stgr-fv-app (hunter print dispatch)');

------------------------------------------------------------------------------
-- 手順3：拡張機能を有効にする
------------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

------------------------------------------------------------------------------
-- 起動用の関数（dry_run=true なら画像更新をせずに、起動経路だけを確認する）
--   トークンは実行時に Vault から読む。cron の登録内容には残らない。
--   API（PostgREST）に公開されない専用スキーマ ops に置く。
------------------------------------------------------------------------------
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create or replace function ops.dispatch_hunter_print_refresh(p_dry_run boolean default false)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://api.github.com/repos/gydk858/stgr-fv-app/actions/workflows/hunter-print-refresh.yml/dispatches',
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_dispatch_token'),
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'supabase-pg-cron-stgr-fv-app'
    ),
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('dry_run', p_dry_run)),
    timeout_milliseconds := 10000
  );
$$;
-- 念のため、関数の実行権限も anon / authenticated から外す
revoke all on function ops.dispatch_hunter_print_refresh(boolean) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 手順4a：起動経路のテスト（dry_run）。数分後の時刻（UTC）を指定して1回だけ使う
--   例：UTC 01:23 なら '23 1 * * *'。確認後に必ず unschedule する。
------------------------------------------------------------------------------
-- select cron.schedule('hunter-print-dispatch-test', '<MM> <HH> * * *',
--   $$select ops.dispatch_hunter_print_refresh(true)$$);
-- select cron.unschedule('hunter-print-dispatch-test');

------------------------------------------------------------------------------
-- 手順4b：本番登録。UTC 10:50 = 日本時間 19:50（pg_cron は UTC で動く）
------------------------------------------------------------------------------
-- select cron.schedule('hunter-print-dispatch', '50 10 * * *',
--   $$select ops.dispatch_hunter_print_refresh(false)$$);

------------------------------------------------------------------------------
-- 確認用の SQL（読み取りのみ）
--   毎日の更新は、次の4段階を別々に確認する。どれかが成功しても、後ろの段階の成功にはならない。
--   19:50 は「開始の予定時刻」。dry_run の成功は起動経路の確認で、毎日の定刻開始の保証ではない。
------------------------------------------------------------------------------
-- (1) cron がジョブを実行したか（＝SQL が動いたか。HTTP の結果ではない）
-- select jobid, jobname, schedule, active from cron.job where jobname like 'hunter-print-dispatch%';
-- select runid, status, return_message, start_time, end_time from cron.job_run_details
--   where jobid in (select jobid from cron.job where jobname like 'hunter-print-dispatch%')
--   order by start_time desc limit 10;
--   status = succeeded は SQL が動いたことだけを示す（return_message は '1 row' で、request id は出ない）。
--
-- (2) GitHub が受け付けたか（HTTP 204 ＝ workflow_dispatch の受付。ジョブの開始・完了ではない）
--   pg_net の応答は非同期に記録される。(1) の start_time の直後（数秒以内）の created の行で対応付ける。
--   応答は一定時間（既定 6 時間）で自動削除されるため、当日中に確認する。
-- select r.id, r.status_code, r.timed_out, r.error_msg, r.created, d.start_time as cron_start
-- from cron.job_run_details d
-- join net._http_response r on r.created between d.start_time and d.start_time + interval '1 minute'
-- where d.jobid in (select jobid from cron.job where jobname = 'hunter-print-dispatch')
-- order by d.start_time desc limit 5;
--   401 / 403：PAT の失効・期限切れ・権限不足（PAT の期限は 2027-11-15）。404：URL・リポジトリ名の誤り。
--   ここで失敗すると dispatch の実行は作られず、GitHub の schedule（予備）が遅れて更新する。
--   予備が動いた日は、ワークフローの実行画面に警告（Hunter print fallback is refreshing ...）が出る。
--
-- (3) ジョブが開始したか、(4) 全カードの更新が完了したか（GitHub 側。読み取りのみ）
--   GET https://api.github.com/repos/gydk858/stgr-fv-app/actions/workflows/hunter-print-refresh.yml/runs?per_page=5
--   (3) event = workflow_dispatch、display_title = 'Daily hunter print refresh' の run の run_started_at
--   (4) 同じ run の conclusion = success。一部のカードでも失敗すると tools/refresh-hunter-cards.mjs が
--       終了コード 1 で終わるため、success は「全カード更新済み」を意味する。件数は run の Summary
--       （Hunter print refresh: N updated, M failed.）で確認する。
--
-- 予備（schedule）の判定：tools/hunter-refresh-guard.mjs。対象の更新日（その日の JST 19:50 の枠）以降に
-- 開始して成功した本番更新（dry_run 以外。dispatch・手動・schedule を問わない）があれば何もしない。
-- 朝の手動更新は夜の枠の代わりにならない。同時に起動した場合はワークフローの concurrency で1つずつ動く。
--
-- 判定の限界（現実的な境界ケース。2026-11-15 に整理。問題が再現しない限り仕組みは増やさない）
--   * 予備が 24 時間以上遅れた場合：翌日の枠で判定される。翌日の更新が成功済みならスキップ（新しい更新で代替され、実害はない）。
--   * 19:50 より前に手動更新した日：その手動更新は数えない。dispatch が失敗した日は、予備が遅れて二重に更新する（上書きのため実害はない）。
--   * 予備（schedule）が dispatch より先に作られた場合：concurrency で予備が先に動き、成功 run がまだないため更新する。
--     その後 dispatch も更新し、二重の更新になる（上書きのため実害はない）。
--   * 待機中の run が2つ以上あると、GitHub は古い待機中の run を取り消す（concurrency の仕様）。予備や手動実行が取り消されても、
--     その時点で実行中の更新が成功すれば枠は満たされる。
--   * 失敗した run を「Re-run」した場合：run_started_at は再実行の開始時刻になり、成功すれば枠を満たす。
--     予備の run 自体を再実行すると、自分自身は数えないため、もう一度更新する。
--   * 区別は run 名（dry_run は「Dry run (dispatch check)」）と、成功・開始時刻だけで行う。dispatch・手動・予備のどれによる更新かは区別しない。

------------------------------------------------------------------------------
-- 戻し方
------------------------------------------------------------------------------
-- select cron.unschedule('hunter-print-dispatch');
-- drop function if exists ops.dispatch_hunter_print_refresh(boolean);
-- ops スキーマは消さない（RLS 段階0のスナップショット ops.acl_snapshot_stage0 も置いている）。
-- delete from vault.secrets where name = 'github_dispatch_token';
-- GitHub 側でトークンを失効させる。ワークフローの変更は git revert で戻す。
-- 拡張機能（pg_cron / pg_net）は、ほかで使っていなければ drop extension で外せる。
