# RLS 対応 段階1：管理画面の DB アクセスをサーバー側へ移す（設計案・実装計画）

作成日：2026-11-15
状態：**設計案**（アプリのコード変更・本番 DB の変更・push・デプロイはしていない）

関連資料

- `docs/PROJECT-HANDOVER.md`：「9. 未解決事項」の 2、「11. 移行記録」の「Supabase の権限（RLS）調査と段階0の適用」
- `docs/ops/rls-stage0.sql`：段階0の SQL と戻し方
- 手本となる既存実装：`app/api/admin-events/route.js`、`lib/event-server.js`、`lib/event-access.js`

記号は引き継ぎ資料と同じ（**[コード]** リポジトリで確認、**[確認済]** このセッションで DB のカタログを読み取って確認、**[未確認]** 確認できていない）。

---

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
| 9 | 後片付け | `lib/supabase.js` の import が0件であることを確認し、ファイルを削除する。ビルド成果物（`.next/static`）に anon キーの形式の文字列が含まれないことを確認する | — |

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

## 7. 段階2へ進む条件

次をすべて満たしたら、段階2の SQL 案を作り、ユーザーの承認を得て適用する。

1. **コード**：`app/`・`components/`・`lib/` に `lib/supabase.js` の import と `NEXT_PUBLIC_SUPABASE_ANON_KEY` の参照が残っていない（サーバー側の `NEXT_PUBLIC_SUPABASE_URL` は残ってよい）。
2. **本番反映**：手順1〜9が本番にデプロイ済みで、14画面すべてを新旧両方の URL で表示確認済み。書き込みは、少なくとも各 API のアクションを1回ずつ（ユーザーの承認のもとで）確認済み。
3. **ログ**：段階1の完了後、一定期間（目安7日）、Supabase の API ログに anon キーでの `public` テーブル・RPC へのアクセスがないこと。**[未確認]**：Supabase のログで anon と service role のリクエストを区別できるか。区別できない場合は、確認方法を別に決める。
4. **他の利用者**：同じ Supabase プロジェクトを、このアプリ以外（別のアプリ、スプレッドシート、手元のスクリプトなど）が anon キーで使っていないこと。特に `ito_issue_log`・`ito_issue_state`・`ito_topics` は、このリポジトリのコードから参照されていない（**[コード]**）が、行がある（5件・2件）。誰が使っているかは**未確認**。ユーザーに確認する。
5. **サーバー側の経路**：Discord（スタンプ・ビンゴ）、`/api/sync-*`、ハンター、イベント、`/api/admin-reset-*` が service role を使っていること（**[コード]** で確認済み。段階2の直前にもう一度確認する）。
6. **戻し方**：段階0と同じく、変更前の ACL・RLS・ポリシー定義を `ops` スキーマに保存し、復元の SQL を用意してあること。
7. **時間帯**：店舗の営業時間外、かつ 19:50（日本時間）の画像更新と重ならない時間に適用すること。

### 段階2で行う予定の内容（案。SQL はまだ作らない）

- 変更前の状態を `ops.acl_snapshot_stage2` に保存（テーブル・ビュー・関数の ACL、RLS の有無、ポリシーの定義）。
- `public` の全テーブル・ビュー・シーケンスから、anon・authenticated の権限を外す。
- `public` の関数（`bambi_*` を含む全部）から、PUBLIC・anon・authenticated の実行権限を外す。service_role の権限は残す。トリガー用の関数は、トリガーの実行時には実行権限を確認しない（作成時だけ）ため、外しても動く見込み（**[未確認]**：実際の挙動は、段階2の適用前に検証用の環境か、トリガーのある1テーブルで確認する）。
- RLS が無効な10テーブル（「2-5」）で RLS を有効にする。service role は RLS を通らない（BYPASSRLS）ため、サーバー側は影響を受けない。
- `true` の条件を持つポリシーを削除する。代わりのポリシーは作らない（anon・authenticated からの利用がなくなるため）。
- ビュー3つに `security_invoker = true` を設定する（権限を外したうえでの多重防御）。
- 新しく作るテーブル・関数に anon の権限が自動で付かないよう、`alter default privileges` を設定する。**[未確認]**：Supabase の既定の権限付与の設定と、マイグレーションを作るロール。
- `net` スキーマ（pg_net）の anon・authenticated の権限を外すかを、あわせて判断する（引き継ぎ資料の「対応保留」）。
- **[未確認]**：anon キー（publishable キー・legacy の anon キー）の再発行が必要か。段階2の後は anon の権限がなくなるため必須ではないが、Supabase の機能と影響（Vercel の環境変数の更新）を確認してから判断する。

---

## 8. 段階1の範囲外で見つけたこと（今回は変更しない）

- **[コード]** `/api/sync-card/*`、`/api/sync-bingo-card/*`、`/api/sync-staff-card/*` は `/api/admin-*` ではないため、`proxy.js` の管理ログインの対象外。ログインなしで呼ぶと、service role でカード画像を作り直して Storage に上書きする（`sync-staff-card` は GET も受け付ける）。Discord からも呼ばれているため、保護する場合は Discord の呼び出し方とあわせて設計する必要がある。
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
