# RLS 対応 段階1：管理画面の DB アクセスをサーバー側へ移す（設計案・実装計画）

作成日：2026-11-15
状態：**設計案**（アプリのコード変更・本番 DB の変更・push・デプロイはしていない）

関連資料

- `docs/PROJECT-HANDOVER.md`：「9. 未解決事項」の 2、「11. 移行記録」の「Supabase の権限（RLS）調査と段階0の適用」
- `docs/ops/rls-stage0.sql`：段階0の SQL と戻し方
- 手本となる既存実装：`app/api/admin-events/route.js`、`lib/event-server.js`、`lib/event-access.js`

記号は引き継ぎ資料と同じ（**[コード]** リポジトリで確認、**[確認済]** このセッションで DB のカタログを読み取って確認、**[未確認]** 確認できていない）。

## 決定事項（2026-11-15、ユーザーの回答）

- **前提**：このシステムは、GTA5 のロールプレイサーバー「ストグラ」の中で飲食店を経営するための管理サイト。扱う情報はすべてゲーム内の情報で、問題があっても影響は小さい。
- **給与画面の表示（3章）**：移行後に、保存済みのデータが表示されるように変わってよい。
- **書き込みの確認（5章の確認項目5）**：検証用の DB は用意しない。本番で直接確認してよい。ただし本番の変更は、これまでどおり手順ごとに内容を示してから行う。
- **`ito_issue_log`・`ito_issue_state`・`ito_topics`（7章の条件4）**：別のプロジェクトで使っていたテーブル。このアプリでは不要で、削除してよい。
  - 3テーブルは互いの外部キーと、自分の連番（シーケンス）だけを持つ。ほかのテーブル・ビュー・関数・トリガー・cron からの参照はない（2026-11-15、カタログの読み取りで確認）。
  - **[確認済]** ユーザーの承認を得て、2026-11-15 に削除した（マイグレーション `drop_unused_ito_tables`）。連番も一緒に消え、`ito_` で始まるオブジェクトは0件になった。これで7章の条件4のうち、`ito_*` の項は解消した。
- この設計資料は、`main` に取り込んだ。

---

## 進捗（2026-11-15 時点）

| 手順 | 状態 | コミット |
| --- | --- | --- |
| 1 給与履歴＋共通部品 | 本番反映・新旧 URL で表示確認済み | c344c65 |
| 2 月次給与・単価ルール | 本番反映・新旧 URL で表示確認済み。単価ルールの作成・削除を本番で確認（承認済み） | e4286bd |
| 2' 問い合わせ回数の削減・sin1 | 本番反映・新旧 URL で確認（DB と一致、単価ルール約3秒→303ms） | 99309d0, f9b1d00 |
| 3 月次リセット・従業員 | 本番反映・新旧 URL で表示確認。従業員の保存を現在値で1件確認（承認済み）。月次リセットの実行は未確認（テスト目的では実行しない） | a3a91d9 |
| 4 従業員カード | 本番反映（12833d0、RPC 適用済み）。新 URL で表示と拒否を確認、旧 URL はログイン期限切れで未確認。+1 / -1 / リセットは新しい RPC `staff_card_adjust_admin`（出勤履歴とカード表示を1トランザクション、service_role のみ）を使うため、RPC の適用後に本番で確認する。画像は DB 更新の後に作り、失敗時は画像だけ「検索」で作り直せる | bb0d110 |
| 5 牧場 | 本番反映（12833d0）。新 URL で表示を確認、旧 URL はログイン期限切れで未確認。書き込みの実行は未確認（通常操作時に確認） | 88fc228 |
| 6 給与 | 本番反映（6c5601a、牧場利益の保存の修正は b886e77）。ローカルで実装・確認（9月・10月の6期間で、明細・入力・集計・牧場の反映・お世話・月末ボーナス・前回金庫額・加算時間が DB と一致。他店舗の期間・ルール・明細と不正な入力は拒否）。書き込みの実行は未確認。表示が変わる点（下記）は反映前にユーザー確認 | 6c5601a |
| 7 スタンプ（管理・顧客・manage） | 本番反映（2026-11-15 20:39 JST に push、デプロイ成功）。ローカルで実装・確認（顧客51人・カード19枚・カード表示・アーカイブ一覧が DB と一致。他店舗・別種類のカード・不正な入力は拒否）。書き込みの実行は未確認。カードの検索・更新を現在の店舗のお客様に限定した（従来は user_id だけで検索） | 8e3e8df |
| 8 ビンゴ（管理・顧客・manage） | 本番反映（同上）。ローカルで実装・確認（カード3枚・マス25・商品番号1件・アーカイブ一覧が DB と一致。他店舗・不正な入力は拒否）。書き込みの実行は未確認。ビンゴは使用予定がないため、利用者の動作確認は省略（ユーザー判断） | 262ce08 |
| 9 後片付け | 本番反映（同上）。`lib/supabase.js` を削除。`app/`・`components/`・`lib/` から `NEXT_PUBLIC_SUPABASE_ANON_KEY` の参照が無くなり、ビルド成果物（`.next/static`）に anon キー・service role キー・Discord のボットトークンが含まれないことを確認（移行完了の確認。安全性の合格基準は「7.」の実効権限と API の認可） | 16e901b |

**手順7〜9の確認（2026-11-15、ローカル）**：移行した14画面をすべて開き、Supabase の REST への直接通信がないことを確認。`/admin/bingo`（ビンゴ管理）だけは「読み込み中です...」のまま表示されなかった。

**ビンゴ管理の読み込み停止（2026-11-15 調査）**：確認用の非表示ブラウザ（Claude のブラウザ枠）に起因する**可能性が高い**。
- ビンゴ管理は画面が大きく、Next.js がサーバーで作った本体を「読み込み中です...」の後から送る（ストリーミング）。React はこの差し替えを次の描画フレーム（`requestAnimationFrame`）で行う。確認用のブラウザ枠は非表示で、このフレームが進まない。従業員カードなど他の画面は、本体が最初の HTML に含まれるため影響を受けない（と考えられる）。
- 確認したこと：同じ部品を認証の外の一時ページ（確認後に削除、コミットなし）で表示し、ブラウザ枠では `requestAnimationFrame` が3秒以内に一度も動かないこと、差し替えを手動で行うと画面が表示されることを確認。同じページをこの PC のヘッドレス Edge で開くと、画面の初期化（商品番号の取得）まで進み、未ログインのため API が 401 を返してログイン画面へ移った。
- 確認できていないこと：**未ログインで初期化まで進んだことは、ログイン後の画面が正常に動くことの確認にはならない**。ログインした状態での本番のビンゴ管理の表示・データ取得は未確認。コードは変更していない。ビンゴの利用者による確認は省略（ユーザー判断）で、機能が正常であることの確認には含めない。

**手順6で表示・保存が変わる点（2026-11-15 確認）**：anon は `ranch_payroll_links`・`payroll_monthly_bonus_runs`・`_items` を SELECT できるが RLS のポリシーがなく、これまで画面には常に0件だった。移行後は保存済みの値が見える。
- 牧場利益（読み取り専用の欄「牧場管理から反映」）：反映済みの値を表示し、「入力内容を保存」でもその値を保存する（コードの本来の動作）。9月・10月の開いている期間は、反映値と保存済みの入力値が同じ。違うのは確定済みの 2026年9月後半（期間39：反映 126,388,856、入力 134,744,161）だけで、ロック解除して保存し直した場合にだけ保存値が変わる。
- 月末ボーナス：保存済みの原資・配分明細・備考が表示され（例：2026年10月 原資 11,000,000、明細9件）、保存済みなら再読み込み後も「確定」できる。これまでは再読み込みすると原資 0・明細なしの表示だった。
- 従業員・加算時間（勤務セッション）は、現在の店舗に限定した（店舗は1つのため、結果は同じ）。

## 1. 目的と範囲

- 目的：ブラウザに配られている公開キー（anon）で、顧客・従業員・給与・牧場のデータを読み書きできる状態をなくす。
- 段階1：管理画面14画面が `lib/supabase.js`（anon キー）で行っている DB 操作を、サーバー側の `/api/admin-*` ルート（service role、`proxy.js` で管理ログイン必須）に移す。**DB の権限は変えない**（anon の権限は段階2で外す）。
- 段階2：段階1の完了後に、anon・authenticated の権限削除、RLS の全面有効化、`true` ポリシーの削除を行う（この資料の「7. 段階2へ進む条件」を参照）。

### 変えないもの（必須）

- GTA 印刷用の固定 URL（`/hunter-print/`、`/event-card/` ほか）、Storage のバケット名・パス（`stamp-images/live/…` ほか）、既存トークン（`print_token`・`owner_token` など）。
- 新 URL（`stgr-fv-app.vercel.app`）と旧 URL（`bistro-bambi-stamp.vercel.app`）の両方。Discord と GitHub Actions は旧 URL を使っている。
- 画像の再生成 API（`/api/sync-card/*`、`/api/sync-bingo-card/*`、`/api/sync-staff-card/*`）のパス。Discord からも呼ばれている **[コード]**。
- 既存の RPC の名前・引数・戻り値。段階1は「呼び出す場所」をブラウザからサーバーに移すだけで、DB 側の関数は変えない。

---

## 2. 現状：14画面が使っている DB オブジェクト

**[コード]** `lib/supabase.js` を import しているのは、次の14ファイルだけ（`app/`・`components/`・`lib/` を検索）。管理メニュー（`StaffMenuClient.js`）、勤怠、システムの画面は anon キーを使っていない。

凡例：R = 読み取り（select）、I = 追加、U = 更新、UPS = upsert、D = 削除、RPC = 関数の実行。
「SD」は security definer（関数の所有者の権限で動く）、「INV」は呼び出し元の権限で動く関数 **[確認済]**。

### 2-1. スタンプ（`app/admin/stamp/**`）

| 画面（ファイル） | 対象 | 種類 | 内容 |
| --- | --- | --- | --- |
| スタンプ管理 `StampClient.js` | `app_settings` | R | `current_store_code` |
| | `stores` | R | 現在の店舗（`status = active`） |
| | `v_stamp_cards_current` | R | user_id 指定、`stamp_regular`・active |
| | `users` | I | 新規顧客（`display_name='未登録'`） |
| | `users` | U | 表示名の変更 |
| | `create_stamp_card_for_user` | RPC（INV） | 新規カード発行 |
| | `increment_stamp_card` | RPC（INV） | スタンプの加算・減算 |
| | `reset_stamp_card` | RPC（INV） | カードのリセット |
| 顧客一覧 `customers/StampCustomersClient.js` | `app_settings`、`stores` | R | 同上 |
| | `users` | R | 店舗の顧客一覧 |
| | `v_stamp_cards_current` | R | 顧客のカード |
| | `users` | U | 表示名・顧客メモ |
| 管理 `manage/StampManageClient.js` | `list_archived_regular_customer_stamp_cards` | RPC（SD） | アーカイブ済みカード一覧 |
| | `archive_active_regular_customer_stamp_cards` | RPC（SD） | 通常スタンプイベントの終了 |
| | `restore_regular_customer_stamp_card` | RPC（SD） | カードの復元 |

補足：スタンプ管理・顧客一覧は、保存後に `/api/sync-card/{user_id}` を呼ぶ。管理画面の一括リセットは、既に `/api/admin-reset-stamps`（service role）を使っている。

### 2-2. ビンゴ（`app/admin/bingo/**`）

| 画面（ファイル） | 対象 | 種類 | 内容 |
| --- | --- | --- | --- |
| ビンゴ管理 `BingoClient.js` | `app_settings`、`stores` | R | 現在の店舗 |
| | `card_programs` | R | `bingo_regular` の program_id |
| | `bingo_product_mappings` | R / UPS / D | 商品と番号の対応（`onConflict: program_id,product_name`、削除は mapping_id 指定） |
| | `v_bingo_cards_current` | R | user_id 指定 |
| | `bingo_card_cells` | R | カードのマス |
| | `cards`（`card_types`・`card_programs` を結合） | R | アーカイブ済みカードの有無 |
| | `users` | I / U | 新規顧客、表示名の変更 |
| | `create_bingo_card_for_user` | RPC（INV） | 新規カード発行 |
| | `mark_bingo_number`、`unmark_bingo_number` | RPC（INV） | 番号の開放・取消 |
| 顧客一覧 `customers/BingoCustomersClient.js` | `app_settings`、`stores`、`users`、`v_bingo_cards_current` | R | 一覧 |
| | `users` | U | 表示名・顧客メモ |
| 管理 `manage/BingoManageClient.js` | `list_archived_regular_bingo_cards` | RPC（SD） | アーカイブ一覧 |
| | `reset_regular_bingo_cards` | RPC（SD） | 一括リセット |
| | `archive_active_regular_bingo_cards` | RPC（SD） | イベント終了 |
| | `restore_regular_bingo_card` | RPC（SD） | 復元 |

補足：保存後に `/api/sync-bingo-card/{user_id}` を呼ぶ。

### 2-3. スタッフ（`app/admin/staff/**`）

| 画面（ファイル） | 対象 | 種類 | 内容 |
| --- | --- | --- | --- |
| 従業員カード `card/StaffCardClient.js` | `app_settings`、`stores` | R | 現在の店舗 |
| | `employee_profiles` | R / U | 従業員の一覧、氏名の更新 |
| | `v_staff_stamp_cards_current` | R | 従業員カード |
| | `users` | U | 表示名 |
| | `record_staff_attendance_event` | RPC（INV） | 出勤記録 |
| | `create_staff_card_for_store` | RPC（INV） | 従業員カード発行 |
| | `increment_stamp_card`、`reset_stamp_card` | RPC（INV） | 出勤数の加減算、リセット |
| 従業員 `employees/EmployeesClient.js` | `app_settings`、`stores`、`employee_profiles`、`v_staff_stamp_cards_current` | R | 一覧 |
| | `update_employee_profile_admin`、`update_employee_grade_admin` | RPC（SD） | 従業員情報・等級の更新 |
| 月次リセット `manage/StaffManageClient.js` | `check_staff_monthly_reset_status` | RPC（SD） | リセット状況の確認 |
| | `reset_active_staff_attendance_cards_for_month` | RPC（SD） | 月次リセット |
| 給与 `payroll/PayrollClient.js` | `app_settings`、`stores` | R | 現在の店舗（`status` の条件なし） |
| | `payroll_rate_rule_sets`、`payroll_rate_rules` | R | レート規則 |
| | `payroll_periods`、`payroll_run_items` | R | 給与期間と明細 |
| | `payroll_period_inputs`、`payroll_period_summaries` | R | 入力値・集計 |
| | `payroll_monthly_bonus_runs`、`payroll_monthly_bonus_run_items` | R | 月末ボーナス |
| | `ranch_payroll_links`、`ranch_month_settings`、`ranch_care_events` | R | 牧場の反映状況・単価・世話記録 |
| | `employee_profiles` | R | 従業員 |
| | `staff_work_sessions` | R | 勤務時間（ボーナス対象分） |
| | `get_previous_payroll_vault_after` | RPC（SD） | 前回の金庫残高 |
| | `create_payroll_periods_for_month` | RPC（SD） | 給与期間の作成 |
| | `save_payroll_period_rate_rule_selection` | RPC（SD） | レート規則の選択 |
| | `build_payroll_run_preview_from_history` | RPC（SD） | 明細の作成 |
| | `save_payroll_period_inputs_and_summary` | RPC（SD） | 入力値・集計の保存 |
| | `save_monthly_bonus_distribution` | RPC（SD） | 月末ボーナス |
| | `update_payroll_run_item_adjustment` | RPC（SD） | 調整額 |
| | `lock_payroll_period_admin`、`unlock_payroll_period_admin` | RPC（SD） | 締め・締め解除 |
| 給与履歴 `payroll/history/PayrollHistoryClient.js` | `get_payroll_history_matrix` | RPC（SD） | 期間指定の一覧 |
| 月次給与 `payroll/monthly/MonthlyPayrollClient.js` | `app_settings`、`stores`、`payroll_periods`、`payroll_run_items`、`payroll_period_summaries`、`payroll_period_inputs` | R | 読み取りのみ |
| レート規則 `payroll/rate-rules/RateRulesClient.js` | `app_settings`、`stores`、`payroll_rate_rule_sets`、`payroll_rate_rules` | R | 一覧 |
| | `save_payroll_rate_rule_set_basic`、`delete_payroll_rate_rule_set_basic` | RPC（SD） | 保存・削除 |
| 牧場 `ranch/RanchClient.js` | `app_settings`、`stores`、`employee_profiles`、`payroll_periods` | R | 一覧 |
| | `ranch_month_settings`、`ranch_profit_entries` | R | 単価・利益 |
| | `ranch_care_events` | R / UPS / D | 世話記録（store_id・user_id・care_date 指定で削除） |
| | `get_ranch_month_summary` | RPC（SD） | 月の集計 |
| | `upsert_ranch_month_setting` | RPC（SD） | 月の単価 |
| | `update_employee_ranch_visible_admin` | RPC（SD） | 牧場画面の表示対象 |
| | `add_ranch_profit_entry`、`update_ranch_profit_entry`、`delete_ranch_profit_entry` | RPC（SD） | 利益の登録・更新・削除 |
| | `apply_ranch_profit_to_payroll_period` | RPC（SD） | 給与への反映 |

補足：従業員カードは保存後に `/api/sync-staff-card/{user_id}` を呼ぶ。

### 2-4. 集計

- テーブル・ビュー：25（ビュー3つ、結合で読む `card_types` を含む）。RPC：38。
- 複数の画面で共有しているもの（段階2で権限を外すには、使っている画面すべての移行が必要）

| 対象 | 使っている画面 |
| --- | --- |
| `app_settings`、`stores` | 12画面（manage 系3画面と給与履歴以外すべて） |
| `users` | スタンプ管理、スタンプ顧客、ビンゴ管理、ビンゴ顧客、従業員カード |
| `employee_profiles` | 従業員カード、従業員、給与、牧場 |
| `v_staff_stamp_cards_current` | 従業員カード、従業員 |
| `payroll_periods` | 給与、月次給与、牧場 |
| `payroll_run_items`、`payroll_period_inputs`、`payroll_period_summaries` | 給与、月次給与 |
| `payroll_rate_rule_sets`、`payroll_rate_rules` | 給与、レート規則 |
| `ranch_care_events`、`ranch_month_settings` | 給与、牧場 |
| `increment_stamp_card`、`reset_stamp_card` | スタンプ管理、従業員カード |

### 2-5. 現在の DB 権限（2026-11-15、カタログの読み取りで確認）

- **[確認済]** anon が実行できる `public` の関数（`bambi_*` 以外）は45個。画面から呼ぶ RPC 38個がすべて含まれる。残りの7個はトリガー用・内部用の関数（`check_bingo_cards_type`、`check_cards_type_program_match`、`check_stamp_cards_type`、`recalculate_bingo_card_status`、`set_payroll_monthly_bonus_updated_at`、`set_staff_work_sessions_updated_at`、`set_updated_at`）。
- **[確認済]** service_role は、45個すべてと段階0で外した関数を実行できる。
- **[確認済]** anon に SELECT・INSERT・UPDATE・DELETE があり、RLS が無効なもの：`bingo_card_cells`、`bingo_cards`、`bingo_mark_histories`、`bingo_product_mappings`、`card_programs`、`card_types`、`cards`、`staff_work_sessions`、`stamp_cards`、`stamp_histories`、ビュー3つ。
- **[確認済]** RLS は有効で、ポリシーの条件が `true` のもの：`users`（public ロールの SELECT・INSERT・UPDATE）、`employee_profiles`、`payroll_period_inputs`、`payroll_period_summaries`、`ranch_care_events`、`ranch_profit_entries`、`staff_attendance_events`（SELECT・INSERT）、SELECT だけのもの（`app_settings`、`stores`、`payroll_periods`、`payroll_rate_rule_sets`、`payroll_rate_rules`、`payroll_run_items`、`staff_stamp_snapshots`）。
- **[確認済]** RLS は有効で、ポリシーがないもの（anon が読むと0件になる）：`payroll_monthly_bonus_runs`、`payroll_monthly_bonus_run_items`、`ranch_month_settings`、`ranch_payroll_links`、`staff_work_session_adjustments`、`ito_issue_log`、`ito_issue_state`、`ito_topics`。

---

## 3. 移行で表示が変わる可能性がある箇所（要判断）

**[確認済]** 次のテーブルは「RLS 有効・ポリシーなし」なので、今の画面（anon）では常に0件が返っている。service role に移すと、実データが返るようになる（行数は2026-11-15時点）。

| テーブル | 行数 | 読んでいる画面 | 今の表示（推定） | 移行後 |
| --- | --- | --- | --- | --- |
| `ranch_payroll_links` | 12 | 給与 | 牧場利益の反映情報がない扱い | 反映済みの情報が表示される |
| `payroll_monthly_bonus_runs` | 2 | 給与 | 月末ボーナスの保存情報がない扱い（プール額 0） | 保存済みの値が表示される |
| `payroll_monthly_bonus_run_items` | 9 | 給与 | 上に連動して空 | 明細が表示される |
| `ranch_month_settings` | 0 | 給与、牧場 | 既定の単価 | 行がないため変わらない |

- 保存は security definer の RPC で行われているため、データ自体は保存されている。移行後の表示が「本来の姿」になると考えられるが、**今の画面がこの0件を前提にした運用（例：毎回入力し直す）になっていないかは未確認**。
- 給与画面の移行（手順6）の前に、ユーザーに「移行後はこの3テーブルの保存値が表示される」ことを確認してもらう。表示を変えたくない場合は、API で同じ結果（空）を返すこともできるが、推奨しない。
- **[未確認]** 今の画面で、上のデータが実際に表示されていないこと（画面での確認はしていない。カタログと件数からの推定）。

---

## 4. 設計

### 4-1. 方式の比較と採用案

| 案 | 内容 | 判断 |
| --- | --- | --- |
| A：汎用の DB 中継 API | `/api/admin-db` が、テーブル名・操作をそのまま受けて service role で実行する | **採用しない**。ログイン後とはいえ、ブラウザから任意の操作を組み立てられる状態が残り、段階2の意味が薄れる |
| **B：機能ごとの API（採用）** | 機能ごとにルートを分け、読み取りは「ビュー名」、書き込みは「アクション名」の許可リストで受ける。RPC の名前と `p_acted_by` などはサーバー側で固定する | `admin-events` と同じ形。画面のコードは「`supabase.from(...)` を API 呼び出しに置き換える」範囲で済む |
| C：Server Actions | Next.js 16 の Server Actions で直接呼ぶ | 既存の `/api/admin-*` と保護の仕組み（`proxy.js`）が異なるため、今回は採用しない |

### 4-2. 共通部品（新規ファイル）

| ファイル | 内容 |
| --- | --- |
| `lib/admin-server.js` | サーバー専用。`adminDB()`（`lib/event-server.js` の `eventDB()` と同じ service role クライアント。中身は `eventDB` を再利用する）、`currentStore(db, { activeOnly })`（`app_settings.current_store_code` → `stores`）、`requireAdmin(request, { write })`（`isEventAdmin()` と、書き込み時の `sameOrigin()`）、`reply()`（`eventReply` と同じく `Cache-Control: no-store`）、入力の検証関数（整数 ID、日付、金額、文字列の長さ） |
| `lib/admin-api.js` | ブラウザ用。`adminGet(path, params)`、`adminPost(path, body)`。401 のときは `/admin/login` に移動、エラーは `{ error }` を `Error` にして投げる（画面の既存のエラー表示をそのまま使えるようにする） |

- `lib/supabase.js` は、全画面の移行が終わるまで残す。最後の手順で import がなくなったことを確認してから削除する（「5. 移行順」の手順9）。
- service role キーは、サーバー側のファイル（`route.js` と `lib/admin-server.js`）からだけ読む。`lib/admin-server.js` の先頭に `import 'server-only'` を付けるかは、パッケージの有無を実装時に確認する（**[未確認]**。依存パッケージは追加しない方針のため、無ければ付けない）。

### 4-3. API の共通ルール

- 置き場所：`app/api/admin-*/route.js`。`proxy.js` が `/api/admin-*` に管理セッション（HMAC 署名付き Cookie `bambi_event_session`）を必須にしているので、**`proxy.js` は変更しない**。ルート内でも `isEventAdmin()` を確認する（`admin-events` と同じ二重チェック）。
- 読み取り：`GET /api/admin-xxx?view=<名前>&…`。`view` は許可リストで、未知の値は 400。
- 書き込み：`POST /api/admin-xxx`、本文は `{ action: '<名前>', …引数 }`。`sameOrigin()` が false なら 403。未知の `action` は 400。
- 応答：成功は `{ data }`（または画面が必要な形のオブジェクト）、失敗は `{ error: '<日本語のメッセージ>' }` と 4xx/5xx。DB のエラーメッセージは今の画面と同じく表示用にそのまま返す（今も anon で同じ内容が見えているため、情報量は増えない）。
- 店舗：`store_id` はブラウザから受け取らず、サーバーで `currentStore()` から決める。ID 指定の操作（カード・給与期間・利益エントリなど）は、可能なものは「現在の店舗のものか」をサーバーで確認する。確認のための追加の読み取りが重い場合は、段階1では今と同じ動作（確認なし）にとどめ、「既知の制限」として残す。
- 実行者の記録：`p_acted_by`・`p_updated_by`・`p_locked_by` などは、今の値（`admin_ui`、`admin_staff_ui`、`admin_payroll_ui`、`admin_ranch_ui` など）をサーバー側に固定して渡す。DB に残る記録は変わらない。
- 画像の再生成（`/api/sync-*`）は、段階1では今と同じく画面から呼ぶ（Discord と共通のルートを変えないため）。
- `export const dynamic = 'force-dynamic'` を付ける。実装前に `node_modules/next/dist/docs/` の Route Handlers の記述を確認する（`AGENTS.md` の指示）。

### 4-4. API の一覧（案）

ルートは機能ごとに6つと、共通の1つ。

#### `/api/admin-context`（共通）

| 種類 | 名前 | 中身 |
| --- | --- | --- |
| GET | （なし） | `{ store_code, store: { store_id, store_code, store_name, status } }`。`status = active` の条件を付けるかは画面ごとに今と同じにするため、`?active=1` で切り替える |

#### `/api/admin-stamp`（スタンプ3画面）

| 種類 | 名前 | 中身 |
| --- | --- | --- |
| GET | `card`（`user_id`） | `v_stamp_cards_current`（`stamp_regular`・active） |
| GET | `customers` | 店舗の `users` 一覧と、`v_stamp_cards_current` の一覧 |
| GET | `archived` | `list_archived_regular_customer_stamp_cards` |
| POST | `create_card` | `users` に追加 → `create_stamp_card_for_user`（`p_program_code='stamp_regular'`、`p_max_count=12` はサーバー側で固定）。今と同じ順番で2回呼ぶ（1つのトランザクションにはならない点も今と同じ） |
| POST | `rename`（`user_id`, `display_name`） | `users` の表示名を更新 |
| POST | `update_customer`（`user_id`, `display_name`, `customer_note`） | `users` を更新 |
| POST | `increment`（`card_id`, `amount`） | `increment_stamp_card`。理由の文言はサーバーで決める |
| POST | `reset`（`card_id`） | `reset_stamp_card` |
| POST | `archive_all` | `archive_active_regular_customer_stamp_cards` |
| POST | `restore`（`card_id`） | `restore_regular_customer_stamp_card` |

全スタンプの一括リセットは、既存の `/api/admin-reset-stamps` をそのまま使う。

#### `/api/admin-bingo`（ビンゴ3画面）

| 種類 | 名前 | 中身 |
| --- | --- | --- |
| GET | `mappings` | `bingo_product_mappings`（`bingo_regular` の program） |
| GET | `card`（`user_id`） | `v_bingo_cards_current` と `bingo_card_cells` |
| GET | `has_archived`（`user_id`） | `cards` の結合クエリ |
| GET | `customers` | `users` と `v_bingo_cards_current` |
| GET | `archived` | `list_archived_regular_bingo_cards` |
| POST | `create_card`、`rename`、`update_customer` | スタンプと同じ（RPC は `create_bingo_card_for_user`、`p_grid_size=5`、`p_has_free_center=false` を固定） |
| POST | `mark`、`unmark`（`card_id`, `number`, `product_name`） | `mark_bingo_number`、`unmark_bingo_number` |
| POST | `save_mapping`、`delete_mapping` | `bingo_product_mappings` の upsert・削除 |
| POST | `reset_all`、`archive_all`、`restore` | 管理画面の RPC 3つ |

#### `/api/admin-staff`（従業員カード・従業員・月次リセット）

| 種類 | 名前 | 中身 |
| --- | --- | --- |
| GET | `employees` | `employee_profiles` と `v_staff_stamp_cards_current` |
| GET | `card`（`user_id`） | `v_staff_stamp_cards_current` |
| GET | `reset_status`（`year`, `month`） | `check_staff_monthly_reset_status` |
| POST | `create_card` | `create_staff_card_for_store`（店舗はサーバーで決める） |
| POST | `rename` | `users` と `employee_profiles` の更新（今と同じ2回の更新） |
| POST | `attendance` | `record_staff_attendance_event` |
| POST | `increment`、`reset` | `increment_stamp_card`、`reset_stamp_card`（`p_acted_by='admin_staff_ui'`） |
| POST | `update_profile`、`update_grade` | `update_employee_profile_admin`、`update_employee_grade_admin` |
| POST | `monthly_reset`（`year`, `month`） | `reset_active_staff_attendance_cards_for_month` |

#### `/api/admin-payroll`（給与・給与履歴・月次給与・レート規則）

| 種類 | 名前 | 中身 |
| --- | --- | --- |
| GET | `rate_rules` | `payroll_rate_rule_sets` と `payroll_rate_rules` |
| GET | `periods`（年月など） | `payroll_periods` |
| GET | `period`（`payroll_period_id`） | `payroll_run_items`、`payroll_period_inputs`、`payroll_period_summaries`、`ranch_payroll_links`、`payroll_monthly_bonus_runs`・`_items`、`get_previous_payroll_vault_after` |
| GET | `period_ranch`（`payroll_period_id`） | `ranch_month_settings`、`ranch_care_events` |
| GET | `work_sessions`（期間） | `employee_profiles`、`staff_work_sessions` |
| GET | `history`（期間、退職者を含むか） | `get_payroll_history_matrix` |
| POST | `create_periods`、`select_rate_rule`、`build_preview`、`save_inputs`、`save_bonus`、`adjust_item`、`lock`、`unlock` | 給与画面の RPC 8つ |
| POST | `save_rate_rule_set`、`delete_rate_rule_set` | レート規則の RPC 2つ |

画面ごとの細かい読み取り（列・並び順）は、今のクエリをそのままサーバーに移す。読み取りの単位をまとめすぎると画面の再読み込みの動きが変わるため、**最初は今の関数1つにつき view 1つ**を基本にし、まとめるのは後で行う。

#### `/api/admin-ranch`（牧場）

| 種類 | 名前 | 中身 |
| --- | --- | --- |
| GET | `month`（年月） | `employee_profiles`、`ranch_month_settings`、`ranch_care_events`、`ranch_profit_entries`、`get_ranch_month_summary`、`payroll_periods` |
| POST | `save_month_setting` | `upsert_ranch_month_setting` |
| POST | `set_care`（`user_id`, `care_date`, `count`） | 0以下なら `ranch_care_events` を削除、それ以外は upsert（今と同じ） |
| POST | `set_visible` | `update_employee_ranch_visible_admin` |
| POST | `add_profit`、`update_profit`、`delete_profit` | 利益の RPC 3つ |
| POST | `apply_to_payroll` | `apply_ranch_profit_to_payroll_period` |

---

## 5. 移行順（画面単位）

各手順は、1つのコミット（または PR）にまとめる。手順ごとに「ビルド → ローカル確認 → ユーザーの承認 → push（本番の自動デプロイ）→ 本番確認」を行う。**DB の権限は段階1の間は変えない**ので、移行していない画面は今までどおり動き、どの手順でも、そのコミットを戻すだけで元に戻せる。

| 順 | 対象 | 理由 | 書き込み |
| --- | --- | --- | --- |
| 1 | 共通部品（`lib/admin-server.js`、`lib/admin-api.js`、`/api/admin-context`）＋ **給与履歴** | RPC 1つ・読み取りだけ。共通部品の試験に向く | なし |
| 2 | **月次給与**、**レート規則** | 読み取りが中心。レート規則の保存・削除は RPC 2つだけ | 少 |
| 3 | **月次リセット**（staff/manage）、**従業員** | RPC 中心で小さい | 中 |
| 4 | **従業員カード** | `users`・`employee_profiles`・`increment_stamp_card` を使う。Discord の出退勤と同じカードを扱う | 中 |
| 5 | **牧場** | テーブルへの直接の upsert・delete がある | 中 |
| 6 | **給与** | 最大（約2,800行、24か所）。「3. 表示が変わる可能性」の確認後に行う | 多 |
| 7 | **スタンプ**（管理・顧客・manage） | 店舗営業中に使う画面。営業時間外に反映する | 多 |
| 8 | **ビンゴ**（管理・顧客・manage） | 同上 | 多 |
| 9 | 後片付け | `lib/supabase.js` の import が0件であることを確認し、ファイルを削除する（移行完了の確認。安全性の合格基準は「7.」の実効権限と API の認可で判断する） | — |

- 共有している対象（「2-4」）は、使っている画面がすべて移行されるまで、段階2で権限を外せない。順番は「段階2の前提が早く揃う順」ではなく「小さく・壊れにくい順」にした。段階2は手順9の後にまとめて行う。
- スタンプとビンゴは、`users` を通じて同じ顧客を扱うので、手順7と8は続けて行う。

### 各手順の確認項目

1. `npm run build` が成功すること。
2. ローカル（`npm run dev`）で管理ログインし、移行した画面の**読み取り**が今と同じ件数・内容で表示されること。
3. ブラウザの開発者ツールのネットワーク欄で、その画面から `*.supabase.co/rest/v1/` への通信がなくなり、`/api/admin-*` だけになっていること。
4. 未ログインで `/api/admin-xxx` を呼ぶと 401、別のオリジンからの POST が 403 になること。
5. **書き込みの確認**：ローカルの `.env.local` は本番の Supabase を指している可能性が高い（**[未確認]**）。書き込みの確認は本番データの変更になるため、手順ごとにユーザーの承認を得て、影響の小さい操作（テスト用の顧客を1件作るなど）だけを行う。検証用の DB（Supabase のブランチなど）を使うかは、費用も含めてユーザーが判断する（**[未確認]**：検証用 DB の有無）。
6. 本番反映後、新旧両方の URL で、移行した画面を開いて表示を確認すること。

---

## 6. 移行後に残る、ブラウザから DB への経路

段階1が終わった時点で、anon キーでの DB 操作はアプリから無くなる見込み。ただし次の点は残る。

- anon キー自体は公開済みで、段階2で権限を外すまでは、第三者が直接使える状態が続く（段階1は「アプリが使わなくなる」だけで、危険そのものは段階2で取り除く）。
- Storage の公開 URL（`stamp-images/...`）は、ブラウザと GTA から直接読む。これは `public` スキーマの権限とは別で、段階2でも変えない。

---

## 7. 段階2へ進む条件と合格基準（2026-11-15 改訂）

前提：anon キーは公開して使う前提のキーで、既に第三者が持っているものとして扱う。
「ビルド成果物から anon キーが消えた」ことは、クライアントの移行が終わった確認にはなるが、安全性の証明にはならない。
合格の基準は、**DB の実効権限**と **service role を使う API の認可**で判断する。
公開されているという理由だけで、anon キーの再発行を必須にはしない。

### 段階2を適用する前の条件

1. **コードの移行**：`app/`・`components/`・`lib/` に `lib/supabase.js` の import と `NEXT_PUBLIC_SUPABASE_ANON_KEY` の参照が残っていない（移行完了の確認。安全性の根拠にはしない）。
2. **本番反映**：手順1〜9が本番にデプロイ済みで、14画面を新旧両方の URL で表示確認済み。書き込みは、各 API のアクションを1回ずつ、ユーザーの承認のもとで確認済み。
3. **service role の API の認可**：service role を使う各 API に、認証（管理セッション、Discord の署名、ハンター・イベントのトークン、`HUNTER_REFRESH_SECRET` など）と、必要な対象範囲の確認（現在の店舗の行か、など）がある。一覧と確認結果を記録する。
4. **他の利用者**：同じ Supabase プロジェクトを、このアプリ以外（別アプリ、スプレッドシート、手元のスクリプト）が anon キーで使っていない。
5. **戻し方**：変更前の ACL・RLS・ポリシーを `ops` に保存し、復元の SQL を、段階0と同じく合成データの回帰テストで検証してある（`tools/tests/rls-stage0-restore/` と同じ方式）。
6. **時間帯**：店舗の営業時間外、かつ 19:50（日本時間）の画像更新と重ならない時間に適用する。

### 段階2の合格基準（適用後に確認する）

1. **anon・authenticated で禁止した操作ができない**：`public` のテーブル・ビューの SELECT・INSERT・UPDATE・DELETE、`public` の関数の実行が、anon キーで PostgREST（`/rest/v1/`、`/rest/v1/rpc/`）から拒否される。実際の API 呼び出しで、読み取り（件数0またはエラー）を確認する。書き込みは、存在しない行への操作など副作用のない形で確認する。
2. **PUBLIC 経由の権限**：`has_table_privilege`・`has_function_privilege` で、anon・authenticated に PUBLIC 経由の権限も残っていないことを確認する（関数の ACL が NULL ＝ 既定で PUBLIC に実行権限、に注意）。
3. **秘密の鍵がクライアントに含まれない**：`.next/static` に service role キー・`HUNTER_REFRESH_SECRET` などの秘密の値が含まれない。
4. **動作の確認**：Discord（スタンプ・ビンゴの出退勤・スタンプ・画像更新）、固定画像 URL、ハンター、イベント、19:50 の定期更新が動く。
5. **他への影響がない**：既存の他アプリや運用スクリプトへの影響がない。
6. **復元手順**：段階2の復元 SQL が、合成データの回帰テストで検証済み。

### 段階2で行う予定の内容（2026-11-15 に SQL を作成。下の「段階2の準備」を参照）

- 変更前の状態を `ops.acl_snapshot_stage2` に保存（テーブル・ビュー・関数の ACL、RLS の有無、ポリシーの定義）。
- `public` の全テーブル・ビュー・シーケンスから、anon・authenticated の権限を外す。
- `public` の関数（`bambi_*` を含む全部）から、PUBLIC・anon・authenticated の実行権限を外す。service_role の権限は残す。トリガー用の関数は、トリガーの実行時には実行権限を確認しない（作成時だけ）ため、外しても動く見込み（**[未確認]**：実際の挙動は、段階2の適用前に検証用の環境か、トリガーのある1テーブルで確認する）。
- RLS が無効な10テーブル（「2-5」）で RLS を有効にする。service role は RLS を通らない（BYPASSRLS）ため、サーバー側は影響を受けない。
- `true` の条件を持つポリシーを削除する。代わりのポリシーは作らない（anon・authenticated からの利用がなくなるため）。
- ビュー3つに `security_invoker = true` を設定する（権限を外したうえでの多重防御）。
- 新しく作るテーブル・関数に anon の権限が自動で付かないよう、`alter default privileges` を設定する。**[未確認]**：Supabase の既定の権限付与の設定と、マイグレーションを作るロール。
- `net` スキーマ（pg_net）：所有者が `supabase_admin` で、postgres では権限を外せない（2026-11-15 確認）。API に公開されていない（公開スキーマは `public`・`graphql_public` だけ）ため、`net` を公開スキーマに加えない・`public` に `net` を呼ぶ関数を作らない、を条件として維持する。
- anon キーの再発行は必須にしない（公開して使う前提のキーのため）。合格基準は実効権限で判断する。

---

### 段階2の準備（2026-11-15。本番の権限変更は未実行。適用はログイン後の本番確認の後、ユーザーの承認後）

**作成したもの**
- `docs/ops/rls-stage2.sql`：前進（1つのマイグレーションで適用）。変更前の ACL・RLS・ポリシー・ビューのオプション・postgres の既定の権限を `ops.acl_snapshot_stage2` に保存し、最後に結果（anon・authenticated に権限が残っていないこと、service_role が変更前の権限を失っていないこと）を確かめ、想定と違えば全体を取り消す。
- `docs/ops/rls-stage2-restore.sql`：戻し方。計画の表示（変更なし）→ captured_at と plan_hash を指定して復元 → 復元後に差が残れば全体を取り消す。
- `docs/ops/rls-stage2-checks.sql`：適用前後に同じものを実行して比べる確認クエリ（読み取りのみ）。
- `tools/tests/rls-stage2/`：PGlite の合成データでの回帰テスト（16ケース、16/16 PASS）。
- `tools/rls-stage2-anon-check.mjs`：anon キーで PostgREST を呼び、拒否されるかを確かめる。既定は読み取り（GET）と、日付を計算するだけの関数1つ。0行の PATCH・DELETE は `--with-write-probes` を付けたときだけ行う。キーの値は表示しない。

**変える内容**（本番の 2026-11-15 時点の件数）
| 対象 | 変更 |
| --- | --- |
| テーブル29・ビュー3・シーケンス28 | anon・authenticated・PUBLIC の権限をすべて外す（`bambi_*` などは既に権限なし） |
| 関数48（public の77個のうち PUBLIC・anon・authenticated が実行できるもの） | PUBLIC・anon・authenticated の実行権限を外す |
| RLS が無効な10テーブル | RLS を有効にする |
| 条件が true のポリシー34個 | 削除する（代わりは作らない） |
| ビュー3つ | `security_invoker = true` |
| postgres の既定の権限（public スキーマ） | 今後 public に作るテーブル・シーケンス・関数に、anon・authenticated の権限を付けない |

**変えないもの**
- service_role・postgres の権限。`storage`・`extensions`・`ops`・`cron`・`net` スキーマ。公開バケットと Storage のポリシー。
- **用語の整理（2026-11-15）**：2つは別のもの。
  - 既存の public の関数の `REVOKE`（`revoke execute on all functions in schema public from public, anon, authenticated;`）は**残している**。今ある77個のうち PUBLIC・anon・authenticated が実行できる48個は、段階2で実行できなくなる（回帰テスト 1a・1b、前進 SQL の最後の確認で、PUBLIC 経由を含めて anon・authenticated の実行権限が0であることを確かめる）。
  - やめたのは、**これから作る関数**の既定を変える `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`（スキーマ指定なし＝全体）だけ。
- **関数の PUBLIC 実行権限の全体の既定（ALTER DEFAULT PRIVILEGES）**：当初は外す案だったが、やめた。スキーマを限定して外す方法がなく、全体で外すと、postgres が所有する `extensions` の関数（pgcrypto・uuid-ossp・pg_stat_statements の54個）を今後の拡張機能の追加・更新で作り直したときに、PUBLIC が実行できなくなるため。
  → **運用ルール**：public に関数を新しく作るときは、同じマイグレーションで `revoke execute on function public.<名前>(<引数の型>) from public, anon, authenticated;` を書く。書き忘れると、その関数は anon が PUBLIC 経由で実行できる（`docs/ops/rls-stage2-checks.sql` の B で検出できる）。

**service_role 側の実効権限（2026-11-15、本番で読み取り。`rls-stage2-checks.sql` の A）**
| 項目 | 結果 |
| --- | --- |
| public のテーブル・ビュー54 | service_role が54すべてで SELECT・INSERT・UPDATE・DELETE できる（すべて明示の付与） |
| public のシーケンス28 | service_role が28すべてで USAGE・SELECT・UPDATE できる（明示の付与） |
| public の関数77 | service_role が77すべてを実行できる |
| PUBLIC から EXECUTE を外す関数48 | 48すべてに service_role への明示の EXECUTE がある（PUBLIC 経由だけで実行できていた関数は0） |
| その他 | service_role は BYPASSRLS。public スキーマの USAGE あり。FORCE RLS のテーブルは0 |
| 関数を呼ぶほかの経路 | 列の既定値・CHECK 制約で public の関数を使うものは0。`ops` の関数は public を参照しない。pg_cron のジョブは1つ（postgres が `ops.dispatch_hunter_print_refresh` を実行）。トリガー関数7個は、トリガーの実行時に EXECUTE を確認しない（回帰テストで確認） |
| SECURITY DEFINER の関数40個 | 所有者は postgres で、中の処理は所有者の権限で動く（RLS も所有者のため影響なし） |

前進 SQL の最後の確認で、service_role が変更前に持っていたテーブル・シーケンスの権限と、関数77個の実行権限が残っていることを確かめ、欠けていれば全体を取り消す。

**Storage の公開画像**：段階2は `storage` スキーマ・バケット・Storage のポリシーに触れない。`storage` の関数・テーブルの所有者は `supabase_storage_admin`。公開画像（`stamp-images/live-staff/36.png`）をキーなしで取得し、HTTP 200・image/png を確認（2026-11-15 適用前）。適用後に同じ URL で再確認する。

**影響の確認（2026-11-15、本番は読み取りだけ）**
| 対象 | 確認内容 | 結果 |
| --- | --- | --- |
| 管理画面14画面 | ブラウザから DB への直接通信なし（手順9）。すべて `/api/admin-*` → service role | 上記の service_role の実効権限が残るため、影響しない見込み（ログイン後の本番表示は確認中） |
| 書き込み経路 | DB に接続するのは `lib/event-server.js` の `eventDB`（= `adminDB`）、Discord の2ルート、`lib/card-images/*`、`/api/admin-reset-*` だけで、すべて service role キー。ページ側（`/event-card`、`/hunter-access`、`/hunter-print`）も `eventDB` | 同上 |
| Discord・イベント・ハンター | service role（`bambi_*` テーブルは既に anon の権限なし） | 同上 |
| 19:50 の定期更新 | pg_cron（postgres）→ `ops` の SECURITY DEFINER 関数 → GitHub Actions → `/api/hunter-refresh`（service role） | 同上 |
| 認証ユーザー | `auth.users` は0人 | authenticated を使う利用者はいない |

**他の利用元（2026-11-15 調査。「利用していない」とは判断していない）**
- **リポジトリ**：公開キーを使うのは削除した `lib/supabase.js`（手順9）と、確認用の `tools/rls-stage2-anon-check.mjs` だけ。GitHub Actions が使うのは `BAMBI_APP_URL` と `HUNTER_REFRESH_SECRET` だけ。
- **同じ PC の別プロジェクト（詳細は下の「別プロジェクト play」）**：`C:\Users\gydk8\GTA5\play`（GitHub `gydk858/play`）が同じ Supabase プロジェクトを参照している。コード上はサーバー側の秘密キー（service role 相当）だけを使い、公開キーの設定はない。使う表は `ito_*`（2026-11-15 に削除済み）と Storage（`play-images` と思われる）。段階2の対象は public の権限だけなので、この構成なら影響しない見込みだが、デプロイ先の設定は未確認。`stamp-card-app-backup-before-claude` は移行前のバックアップ。
- **API ログ（2026-11-01〜11-15、日ごとに確認）**：公開キーでの `/rest/v1/` の利用は、すべてブラウザ（supabase-js-web）から、このアプリの画面（参照元 `bistro-bambi-stamp.vercel.app`）経由だった。回線はユーザーの回線と、11/3 に別の回線（1回、同じ参照元）。サーバー・スクリプトからの公開キーの利用は、確認用スクリプトだけ。GraphQL は 11/15 の到達確認1回だけ。
- **限界**：ログは 2026-11-01 より前を見ていない。2週間に1回より少ない利用や、ログに残らない利用は分からない。**ログにないことは、使っていないことの証明にならない。**

**別プロジェクト play（2026-11-15。ユーザー判断で使用終了・削除済み）**
- 調査結果：`C:\Users\gydk8\GTA5\play`（GitHub `gydk858/play`）は、このアプリと同じ Supabase プロジェクトを参照していた。設定はサーバー用の秘密キー（このアプリのローカル設定と同じ値）と Storage のバケット名だけで、公開キーは設定されていなかった。コードが参照する `ito_*` テーブルは 2026-11-15 に削除済み。API ログ（2026-10-31〜11-15）に `ito_*`・`play-images` への通信は0件。
- ユーザーの判断（2026-11-15）：play は現在使っておらず、今後も使わない。play 専用の資産は削除してよい。
- **削除したもの**（2026-11-15、削除前に参照がないことを確認）
  - Vercel のプロジェクト `play`（`gmp-service.vercel.app`、`play-game-stgrfv.vercel.app`、環境変数3つ：`NEXT_PUBLIC_SUPABASE_URL`・`SUPABASE_SERVICE_ROLE_KEY`・`SUPABASE_STORAGE_BUCKET`）。削除後、両ドメインは 404。stgr-fv-app の新旧 URL は 200。
  - Supabase Storage のバケット `play-images`（27ファイル、すべて `ito/` の下）。削除前の確認：stgr-fv-app のコード・public と ops の全テキスト列・関数・Storage のポリシーに参照0件、play の設定のバケット名と一致（値は表示せず真偽で確認）。削除後のバケットは8個（他のバケットはそのまま）。
  - ローカルの `C:\Users\gydk8\GTA5\play` フォルダ（削除前に、未 push のコミット0・未コミットの変更0・stash 0 を確認）。
- **残したもの**：GitHub リポジトリ `gydk858/play`（削除対象外）、Supabase プロジェクト（stgr-fv-app と共有）、共有 DB、他のバケット、移行前のバックアップフォルダ全体（削除対象外）。

**ユーザーに確認してほしいこと（他の利用元。未回答のため未確認）**
1. Vercel：このアプリ以外のプロジェクトの環境変数に、このプロジェクトの公開キー（anon）を設定していないか（2026-11-15 時点で Vercel のプロジェクトは stgr-fv-app だけ）。
2. Google スプレッドシート・Apps Script・Discord の別 Bot・ノーコードツールなど、Supabase に直接つないでいるものがないか。
3. Supabase の管理画面の API キーの画面で、公開キー（anon・publishable）を別の用途に配っていないか。
4. 配布済みの URL・ゲーム内の印刷物は、Storage の公開画像かアプリの URL で、公開キーを含まないこと（含む URL を配っていないか）。

**未確認（影響する対象を分けて記載）**
- **他の利用元**：上の確認が終わるまで未確認。使っていれば、段階2の後にその利用元が失敗する。
- **本番の PostgreSQL 17.6 での実行**：前進・復元とも PGlite（18.6）の合成データで検証。本番での実行は承認後の適用時が初めて（前進は失敗すれば全体が取り消される）。
- **書き込みの実行**：スタンプ・ビンゴ・従業員カード・牧場・給与の書き込みは本番で実行していない。service_role の実効権限は残ることを確認したが、実際の書き込みは通常操作で確認する。
- **supabase_admin の既定の権限**：postgres からは変えられない。今は public の所有者はすべて postgres。
- **anon キーの再発行**：必須にしない（方針どおり）。

**確認スクリプトの書き込み確認の前提（2026-11-15 確認）**：28表すべてで主キー -1 の行は0件、`app_settings` の確認用キーの行も0件。public の表に文単位のトリガーはない（行単位のトリガー14個は、対象0行では動かない）。主キーはすべて連番の正の値。スクリプトは更新・削除の件数が0以外なら「要確認」として止める。主キーが自動採番（identity）の9表は PATCH が `428C9` になり判定できないため、DELETE とカタログで判断する。2026-11-15 の適用前の記録：読み取り33件すべて許可、0行の PATCH・DELETE も許可（82件許可・9件判定不能、影響0件）。

**適用の手順（承認後。時間帯は最後の承認時に決める）**
1. 店舗が利用中でないこと（出勤中の従業員がいないことだけでは判断しない）と、19:50 の定期更新と重ならないことを、承認時に確認する。
2. 適用前：`rls-stage2-checks.sql` の A・B・C を実行して記録。`node tools/rls-stage2-anon-check.mjs`。公開画像の取得。
3. 適用：`docs/ops/rls-stage2.sql` を1つのマイグレーションとして適用する（途中の失敗・最後の確認の不一致は全体を取り消す）。
4. 適用後：`rls-stage2-checks.sql`（A と C が適用前と同じ、B がすべて0）、`node tools/rls-stage2-anon-check.mjs --expect-denied`（前提を確かめたうえで `--with-write-probes` も）、公開画像の取得、管理画面14画面・Discord・ハンター・イベントの表示、次の 19:50 の定期更新。
5. 問題があれば：`docs/ops/rls-stage2-restore.sql` をそのまま実行して計画を表示し、block 0件を確認して、captured_at と plan_hash を指定して復元する。もう一度実行して restore・block が0件であることを確認する。

### 秘密キーの露出（2026-11-15。是正対象。キーの変更・失効はまだしていない）

- **何が起きたか**：play の調査で、検索が `play/.env.local` にも当たり、秘密キーの値が1つ、Claude Code のツール出力に表示された。値は資料・Git・報告には書いていない（スキャンで0件を確認）。ただし、このセッションの記録には残っている。play のファイルを削除しても、記録に出たキーは無効にならない。
- **露出したキーの種類と利用先**（値は表示せず、形式・一致だけを確認）
  - 種類：Supabase の新しい形式の**秘密キー（`sb_secret_`）**。service role と同じく RLS を通らず、DB・Storage を全権で操作できる。
  - **ローカルで使用中**：このアプリの `.env.local` の `SUPABASE_SERVICE_ROLE_KEY` と同じ値。移行前のバックアップ `stamp-card-app-backup-before-claude/.env.local` にも同じ値がある。play の設定にもあったが、play は削除済み。
  - **本番も同じキーの可能性が高いが、Vercel の設定値との一致は未確認**。根拠：Supabase の API ログの「キーの識別子」（キーそのものではない）が、本番（Vercel）からの通信と、ローカルの開発サーバー（`.env.local` のキーを使う）からの通信で一致した（2026-11-01〜15、本番の通信はこの1種類だけ）。Vercel の `SUPABASE_SERVICE_ROLE_KEY` は1つで「All Environments」、最終更新は Apr 13（値は見ていない）。
  - 使っていない場所：GitHub Actions（`HUNTER_REFRESH_SECRET` と `BAMBI_APP_URL` だけ）、Supabase Vault（GitHub のトークンだけ）、pg_cron。
  - 公開キーは `sb_publishable_` 形式。旧形式の JWT キー（anon・service_role）の利用は、API ログ（2026-11-01〜15）に見つからなかった。
- **段階2との関係**：段階2は anon・authenticated の権限を外すもので、**露出した秘密キー（service role 相当）への対策にはならない**。秘密キーは段階2の後も全権で使えるため、交換が必要。段階2より先に交換する（ユーザー判断、2026-11-15）。
- **交換の手順**（新しいキーへの切り替えと確認を先に行い、旧キーの無効化は後）
  1. **[ユーザー]** Supabase の管理画面 → Project Settings → API Keys → Secret keys で、新しい秘密キーを作る。旧キーはまだ削除しない（新形式の秘密キーは複数を同時に有効にできる）。
  2. **[ユーザー]** Vercel（stgr-fv-app）→ Settings → Environment Variables の `SUPABASE_SERVICE_ROLE_KEY`（All Environments）を新しい値に変える。値をチャット・資料に貼らない。
  3. **[ユーザー]** Vercel で本番を再デプロイする（環境変数は再デプロイ後に反映。新旧 URL は同じプロジェクトなので両方が切り替わる）。
  4. **[Claude]** 確認：API ログで、本番の通信のキーの識別子が新しいものに変わったこと（旧キーの識別子が本番から消えたこと）。管理画面の読み取り、未ログインの拒否、公開画像。次の 19:50 の定期更新。Discord・ハンター・イベントは通常操作のときに確認（書き込みを伴うため、確認目的では実行しない）。
  5. **[ユーザー]** 手元の `.env.local`（このアプリ）を新しい値にする（開発サーバーを使う場合）。**バックアップフォルダには新しいキーをコピーしない。**
  6. **[ユーザー]** 旧キーを Supabase の管理画面で削除する（削除した時点で無効になる）。
- **旧キーを削除する条件**：本番の再デプロイの後、API ログで本番（Vercel）からの通信がすべて新しいキーの識別子になっていること。19:50 の定期更新が新しいキーで成功していること。手元の `.env.local` を新しい値にした（または開発サーバーを使わない）こと。ログで旧キーの利用が見つからないことは、未使用の証明ではない（ログに残らない利用や、ログの範囲外の利用はありうる）。旧キーを持つ場所として分かっているのは、手元の `.env.local` とバックアップフォルダだけで、旧キーを削除した後は、どちらも Supabase に接続できなくなる。
- **影響範囲**：手順2〜3の間は旧キーで動き続けるため、止まる時間は無い見込み。再デプロイが失敗した場合は、旧キーのまま動いている（旧キーを削除するまでは戻せる）。
- **段階2との順序**：鍵の交換を先に行い、段階2は別の作業として、別の時間に行う。
- **再発防止**：今後の検索では `.env*`・認証情報・鍵のファイルを対象から外す。設定の確認が必要なときは、変数名と、値の形式・一致（真偽）だけを出力する。

## 8. 段階1の範囲外で見つけたこと（今回は変更しない）

- **[対応済み・ローカル 2026-11-15]** `/api/sync-card/*`、`/api/sync-bingo-card/*`、`/api/sync-staff-card/*` は認証なしで service role の画像再生成ができた（`sync-staff-card` は GET も）。生成処理を `lib/card-images/` に移し、ルートは管理セッション＋同じオリジンを必須にし、GET を削除した。Discord は署名検証の後に生成関数を直接呼ぶ（HTTP を経由しない）。
- **[コード]** `/api/admin-reset-stamps` は、ルート内で `admin_auth` Cookie の値が `ok` であることだけを確認している。この Cookie は署名がなく、ブラウザで作れる値だが、`proxy.js` が署名付きの管理セッションを必須にしているため、今は守られている。新しい API では `isEventAdmin()` を使う。
- **[確認済]** `staff_work_session_adjustments`（419行）と `staff_attendance_events` は、14画面からは参照されていない。サーバー側の関数から使われていると考えられるが、どこから使われているかの詳細は**未確認**。

---

## 9. 未確認事項のまとめ

- 給与画面で、`ranch_payroll_links`・`payroll_monthly_bonus_runs`・`_items` が今は表示されていないこと（推定）と、移行後に表示されてよいか（ユーザー判断）
- ローカルの `.env.local` が本番の Supabase を指しているか、検証用の DB を用意できるか
- `ito_*` テーブルの利用者
- Supabase の API ログで、anon と service role の呼び出しを区別できるか
- 実行権限を外したトリガー用関数の挙動
- Supabase の既定の権限付与（`alter default privileges`）の現状
- `server-only` パッケージの有無
- anon キーの再発行の要否
- 第三者が anon キーでアクセスした形跡（引き継ぎ資料の時点から引き続き未確認）

## 10. この資料の作成で行ったこと

- コードの読み取り（14ファイルの Supabase 呼び出しをスクリプトで抽出し、書き込み箇所は目視で確認）。
- Supabase MCP で、本番 DB のカタログ（関数の実行権限、テーブルの権限・RLS・ポリシー）を読み取った。行データは取得していない。件数（`count(*)`）だけを、ポリシーのない8テーブルで取得した。
- 本番 DB・Storage・アプリのコードは変更していない。push・デプロイはしていない。
