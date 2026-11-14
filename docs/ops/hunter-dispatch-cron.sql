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
------------------------------------------------------------------------------
-- select jobid, jobname, schedule, active from cron.job where jobname like 'hunter-print-dispatch%';
-- select jobid, status, return_message, start_time, end_time from cron.job_run_details
--   where jobid in (select jobid from cron.job where jobname like 'hunter-print-dispatch%')
--   order by start_time desc limit 10;
-- GitHub の成功応答は 204。応答は pg_net が一定時間で自動削除する
-- select id, status_code, created from net._http_response order by created desc limit 5;

------------------------------------------------------------------------------
-- 戻し方
------------------------------------------------------------------------------
-- select cron.unschedule('hunter-print-dispatch');
-- drop function if exists ops.dispatch_hunter_print_refresh(boolean);
-- drop schema if exists ops;
-- delete from vault.secrets where name = 'github_dispatch_token';
-- GitHub 側でトークンを失効させる。ワークフローの変更は git revert で戻す。
-- 拡張機能（pg_cron / pg_net）は、ほかで使っていなければ drop extension で外せる。
