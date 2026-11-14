# Bistro Bambi 引き継ぎ資料（Stgr-fv-app）

作成日：2026-11-14（ChatGPT から Claude Code への引き継ぎ時）
更新日：2026-11-15（Vercel 名称変更、各サービスの接続確認、移行の最終確認を反映。「11. 移行記録」と「12. 今後の開発手順」を参照）

**移行状況：完了**（2026-11-15）。Claude Code から main への push と、Vercel の自動デプロイまで確認済み。残っている課題は「9. 未解決事項・未確認事項」を参照。

この資料では情報源を次の3種類に分けて記載します。

| 記号 | 意味 |
| --- | --- |
| **[コード]** | 2026-11-14 時点のリポジトリ内のコード・設定ファイルで確認できた事実 |
| **[引継]** | ユーザーからの引き継ぎ情報（コードでは確認していない、または確認できない） |
| **[未確認]** | 現時点で確認できていない事項。推測で補わないこと |

既存資料（`docs/UPDATE-v3.md`・`README.md`）と現在のコードが異なる場合は、**現在のコードを優先**します。違いは「8. 既存資料との差異」に記載します。

秘密情報（`.env.local` の値、各種キー・トークン・パスワード）はこの資料に記載しません。

---

## 1. プロジェクトの場所と名称

- **[引継]** ローカルフォルダ名を `stamp-card-app` から `Stgr-fv-app` に変更済み。変更したのはフォルダ名だけ。
- **[引継]** GitHub リポジトリ名と Supabase は変更していない。既存のものを継続利用する。
- **[引継]** Vercel のプロジェクト名は 2026-11-15 に `stgr-fv-app` へ変更済み。プロジェクト自体は同じものを継続利用し、GitHub の接続先は `gydk858/bistro-bambi-stamp` のまま。
- **[引継]** フォルダ名変更前のローカルバックアップは取得済み。
- **[コード]** 作業ディレクトリ：`C:\Users\gydk8\GTA5\Stgr-fv-app`
- **[コード]** Git リモート：`https://github.com/gydk858/bistro-bambi-stamp`、ブランチ `main`（`origin/main` を追跡）
- **[コード]** 旧フォルダ名がコード内に残っている箇所（動作には影響しない。依頼がない限り変更しない）
  - `package.json` の `"name": "stamp-card-app"`
  - `tools/cleanup-legacy-tests.ps1` のエラーメッセージ文言
  - `docs/UPDATE-v3.md` の手順説明
- **[引継]** 本番 URL（同じ Vercel プロジェクトの Production に、両方のドメインが接続されている）

| 区分 | URL | 扱い |
| --- | --- | --- |
| 新 URL | `https://stgr-fv-app.vercel.app` | 今後の基本 URL |
| 旧 URL | `https://bistro-bambi-stamp.vercel.app` | 既存連携（GitHub Actions・Discord・配布済み URL など）のため**削除・リダイレクトしない** |

## 2. 技術構成と起動コマンド

**[コード]**（`package.json`）

| 項目 | 内容 |
| --- | --- |
| フレームワーク | Next.js 16.2.2（App Router）、React 19.2.4 |
| DB・Storage | Supabase（`@supabase/supabase-js` v2） |
| 画像生成 | `sharp`（SVG→PNG 合成） |
| Discord | `tweetnacl`（インタラクションの署名検証） |
| スタイル | Tailwind CSS v4、CSS Modules、`app/globals.css` |
| 言語 | JavaScript 主体、一部 TypeScript（`app/layout.tsx`、`app/page.tsx`、`components/site/SiteShell.tsx`） |
| ホスティング | Vercel プロジェクト `stgr-fv-app`（**[引継]** GitHub `gydk858/bistro-bambi-stamp` に接続）。**[確認済]** `main` への push で本番の自動デプロイが起動する（2026-11-15）。**[コード]** リポジトリ内に `.vercel/` と `vercel.json` はない |

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバー |
| `npm run register:discord:stamp` | Discord スタンプコマンド登録（`.env.local` を読み込む） |
| `npm run register:discord:staff` | stamp と同じスクリプトを実行 |
| `npm run register:discord:bingo` | Discord ビンゴコマンド登録 |

- **[コード]** Next.js 16 では Middleware のファイル名が `proxy.js`（関数名 `proxy`）。コードを書く前に `node_modules/next/dist/docs/` を参照すること（`AGENTS.md` の指示）。

## 3. ディレクトリ構成と主要機能

**[コード]**

| パス | 内容 |
| --- | --- |
| `app/page.tsx` | トップ（スタッフログインへの入口） |
| `app/admin/login` | 管理ログイン |
| `app/admin/stamp` | スタンプカード管理（顧客・管理） |
| `app/admin/bingo` | ビンゴカード管理（顧客・管理） |
| `app/admin/events` | イベントカード（レイアウト・パズル編集、印刷プレビュー） |
| `app/admin/hunters` | ハンティング受付（買取、サイズ記録、プロフィール、設定、買取台帳） |
| `app/admin/staff` | スタッフカード、従業員、給与（月次・履歴・レート規則）、牧場 |
| `app/admin/attendance` | 勤怠 |
| `app/admin/system` | システム管理 |
| `app/api/admin-*` | ログイン・ログアウト、イベント管理、スタンプリセット、システムリセット |
| `app/api/discord/{stamp,bingo}/interactions` | Discord スラッシュコマンドの受け口 |
| `app/api/sync-card` ほか | スタンプ・ビンゴ・スタッフのカード画像を生成し、Storage に上書きする |
| `app/api/event-*` | イベントの素材・プレビュー・パズル取込・操作 |
| `app/api/hunters`、`hunter-owner`、`hunter-refresh` | ハンター管理、本人ページ、定期画像更新 API |
| `components/events` | イベント編集部品 |
| `components/site/SiteShell.tsx` | 全画面共通のヘッダー・外枠 |
| `lib/` | Supabase クライアント、イベント・ハンターのサーバー処理、画像生成、パズル、配色 |
| `public/fonts` | Noto Serif JP、Rounded M+（印刷用 TTF と画面用 WOFF2、ライセンス） |
| `public/hunters`、`public/site` | ハンターカードの背景・紋章、トップ画像 |
| `scripts/` | Discord コマンド登録スクリプト（削除しない） |
| `tools/` | 定期画像更新スクリプト、旧テストファイル整理スクリプト |

### アクセス制御（`proxy.js`）

- **[コード]** `/admin/*`（`/admin/login` を除く）と `/api/admin-*`（login・logout を除く）は管理セッションが必要。ない場合、画面はログインへリダイレクトし、API は 401 を返す。
- **[コード]** ハンター・イベントの専用 URL と API には `Referrer-Policy: no-referrer`、`Cache-Control: no-store`、`X-Robots-Tag: noindex, nofollow` を付与する。

## 4. 固定 URL・Storage パス（変更厳禁）

GTA 内の印刷物や、配布済みの URL から参照されています。**バケット名・パス・トークン形式・ルートのパスを変更しないこと。**

### Storage バケットとパス

**[コード]**

| バケット | パス | 用途 |
| --- | --- | --- |
| `stamp-images` | `live/{userId}.png` | スタンプカード画像（upsert で上書き） |
| `stamp-images` | `live-bingo/{userId}.png` | ビンゴカード画像 |
| `stamp-images` | `live-staff/{user_id}.png` | スタッフカード画像 |
| `bambi-hunter-live` | `{print_token}{suffix}.png`（suffix は `-all`・空・`-records`・`-horizontal`） | ハンター印刷画像（`cacheControl: 0`、upsert）。旧別名（横・縦）も互換のため更新を続けている |
| `bambi-hunter-assets` | `{store}/{id}.png`、`{store_id}/{hunter_id}/{id}.png` | ハンター素材・写真 |
| `bambi-event-live` | `{print_token}.png` | イベントカード印刷画像（upsert） |
| `bambi-event-prints` | （`lib/event-print.js` 参照） | イベント印刷画像のキャッシュ（upsert なし） |
| `bambi-event-assets` | `{event_id}/{asset_id}.png` ほか | イベント素材 |

- **[コード]** スタンプ・ビンゴ・スタッフの公開 URL は、Supabase の公開 Storage URL（`https://<project>.supabase.co/storage/v1/object/public/stamp-images/...`）として次のファイルに直接書かれている。
  - `app/admin/stamp/StampClient.js`
  - `app/admin/bingo/BingoClient.js`
  - `app/admin/staff/card/StaffCardClient.js`
  - `app/api/discord/*/interactions/route.js`

### アプリ側の固定ルート

**[コード]**

| ルート | トークン形式 | 内容 |
| --- | --- | --- |
| `/hunter-print/{token}` | UUID | `bambi-hunter-live/{token}-all.png` を返す |
| `/hunter-access/{token}` | 64桁 hex | ハンター受付の専用入口 |
| `/hunter-user/{token}` | 64桁 hex | ハンター本人ページ |
| `/event-card/{token}` | UUID（`.png` 付きも可） | イベントカード画像 |
| `/event-access/{token}` | — | イベント操作の専用入口 |

- **[コード]** GTA 側の画像キャッシュ待ちは約60秒（`docs/UPDATE-v3.md` の記載）。

## 5. 定期処理（GitHub Actions）

- **[コード]** `.github/workflows/hunter-print-refresh.yml`（Daily hunter print refresh）
  - スケジュールは `cron: '50 10 * * *'`（UTC 10:50 = 日本時間 19:50）。手動実行（`workflow_dispatch`）にも対応。
  - Node 22 で `tools/refresh-hunter-cards.mjs` を実行する。
    - `/api/hunter-refresh` をカード1枚ずつ呼び出し、一時エラーは最大3回まで試行する。
    - 全体の上限は180分で、同時実行はしない。
  - 使う設定は GitHub の Variables `BAMBI_APP_URL` と Secrets `HUNTER_REFRESH_SECRET`。Vercel 側にも同じ `HUNTER_REFRESH_SECRET` が必要。
  - GitHub 側にサービスキーは不要。
- **[引継]** 毎日 19:50（日本時間）の画像更新が設定されている。
- **[確認済]** 2026-11-15 に GitHub の公開 API で実行履歴を取得した。直近5回（#2〜#6）は定期実行で、すべて成功していた。ただし開始時刻は予定の19:50より6〜8時間遅れていた（詳細は「11. 移行記録」）。遅れの原因は未調査。
- **[未確認]** 各実行のログの内容（更新件数・失敗件数）、実行 #1 の詳細、GitHub と Vercel への変数登録状況。
- **[引継]** 2026-11-15 の Vercel 名称変更時に、GitHub Actions の接続先 URL（`BAMBI_APP_URL`）は変更していない。
- **[未確認]** `BAMBI_APP_URL` に実際に登録されている値。旧 URL のままなら、旧ドメインを維持している限り引き続き動作する想定。新 URL への切り替えは、依頼があったときに別途行う。
- **[コード]** GitHub の予約実行は遅れることがあり、長期間活動がないと無効化される場合がある（`docs/UPDATE-v3.md` の記載）。

## 6. 環境変数

- **[コード]** `.env.local` があり、`.gitignore` で除外されている。値は確認・記載しない。
- **[コード]** コードが参照する変数名（値は記載しない）

| 区分 | 変数名 |
| --- | --- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` |
| 管理ログイン | `ADMIN_PASSWORD` |
| Discord | `DISCORD_STAMP_APPLICATION_ID`、`DISCORD_STAMP_BOT_TOKEN`、`DISCORD_STAMP_PUBLIC_KEY`、`DISCORD_BINGO_APPLICATION_ID`、`DISCORD_BINGO_BOT_TOKEN`、`DISCORD_BINGO_PUBLIC_KEY` |
| 定期更新 | `HUNTER_REFRESH_SECRET`、`BAMBI_APP_URL`（GitHub Actions 側） |

- **[未確認]** Vercel 本番環境に登録されている変数の一覧。

## 7. ハンティングの業務ルール

| 内容 | 区分 | 確認できたこと |
| --- | --- | --- |
| 皮・鳥素材1個を1頭として加算し、肉は買取のみ（頭数に含めない） | [引継] / [コード] | `lib/hunter-purchase.js` の `purchaseSummary` は `meat` 以外の数量を動物ごとの頭数（`animals`・`kills`）に加算する。肉（`meat`、1,000円）は金額にだけ計上される |
| イノシシの表示名と内部キー「猪」を区別する | [引継] / [コード] | `lib/hunter-animals.js` で、保存キーは `猪`、表示は `animalLabel()` で `イノシシ`、入力は `animalKey()` で `猪` に変換している。既存の買取・サイズ・ランキングの紐付けを保つため、**DB に `イノシシ` を保存しないこと** |
| スカンクは兎の次で、小サイズの皮 | [引継] / [コード] | `skinSizeByAnimal` で `スカンク: 2`（小）。`lib/hunter-image.js` の `HUNTER_ANIMALS` では `兎` の次が `スカンク` |

- **[コード]** 受付画面（`app/admin/hunters/HunterPurchase.js`）は皮の動物をサイズ順（大0 → 中1 → 小2）に並べ、未設定の動物を末尾に置く。同じサイズ内の順序は動物リストの順序に従う。
- **[未確認]** 本番 DB の設定で、同じサイズ内の動物の並びが「兎 → スカンク」になっていること。
- **[コード]** 買取単価の初期値と、コイン換算（`COIN_RATE = 10`）は `lib/hunter-purchase.js` にある。

### HR リセット SQL

- **[引継]** 全員の HR を 1 に戻す SQL が ChatGPT から提示済み。
- **[未確認]** 本番 DB で実行済みかどうか。リポジトリ内に該当 SQL はない。
- 再実行や確認は、ユーザーの明示的な依頼があるまで行わない。

## 8. 既存資料との差異

**[コード]** を優先します。

| 資料の記載 | 現在のコード | 違い |
| --- | --- | --- |
| `docs/UPDATE-v3.md`：皮の順序は「熊 → 猪 → 鹿 → ライオン → コヨーテ → 兎」 | サイズ順（`skinSizeByAnimal`）で並べ、スカンク（小）を含む。`HUNTER_ANIMALS` の初期一覧に `鹿` はなく、`馬`・`鶏`・`鵜`・`チキンホーク`・`カラス` などがある | スカンクが資料に未記載。実際の選択肢は DB 設定由来（**[未確認]**） |
| `docs/UPDATE-v3.md`：「既存の stamp-card-app に上書き」 | フォルダ名は `Stgr-fv-app` | フォルダ名の変更前に書かれた資料 |
| `README.md`：`tools`・`.github/workflows` などの説明 | 一致 | 差異なし |
| `next.config.ts`：`/card/:user_id.png` → `/card/:user_id` への書き換え | `app/card` ルートは存在しない | 使われていない設定か、外部参照があるかは **[未確認]**。互換性維持のため削除しない |

## 9. 未解決事項・未確認事項

### 未解決事項（移行完了時点で残っている課題）

1. **画像自動更新の開始時刻のずれ**：予定は19:50（日本時間）だが、実際の開始は6〜8時間遅れている。原因は未調査（「11. 移行記録」の GitHub の項を参照）。
2. **RLS 無効の報告**：Supabase から、15テーブルで RLS 無効と報告された。実際の anon 権限、API の公開範囲、アプリへの影響は未調査で、対応は保留中（「11. 移行記録」の Supabase の項を参照）。
3. **新 URL での専用ページの確認**：新 URL で、次のページと画像が動くか未確認。
   - ハンター・イベントの専用ページ（`/hunter-access/`、`/hunter-user/`、`/event-access/`）
   - 印刷用画像（`/hunter-print/`、`/event-card/`）
4. **Vercel 管理ツールが未接続**：Vercel を操作する MCP と CLI は、Claude Code に接続していない。ただし Git 経由の自動デプロイは動作を確認済み。デプロイ結果は、Vercel の管理画面でユーザーが確認する。

### その他の未確認事項

- GitHub Actions の `BAMBI_APP_URL` と、Discord Developer Portal の Interactions Endpoint URL に、新旧どちらの URL が登録されているか
- Vercel 本番環境の環境変数（`HUNTER_REFRESH_SECRET` を含む）の登録状況
- GitHub Actions の Variables・Secrets の登録状況
- GitHub の認証ユーザー名（push 権限があることは確認済み）
- 全員を HR 1 に戻す SQL を実行済みかどうか
- 本番 DB で、ハンター動物の並び（兎 → スカンク）とサイズ設定が想定どおりか
- `next.config.ts` の `/card/*.png` 書き換えが使われているか
- Git のユーザーメール設定（ドメインが `gmai.com` になっている）が意図どおりか

### 解決済み（2026-11-15）

- Vercel のプロジェクト名と本番 URL（引き継ぎ情報で判明）
- `main` への push で Vercel の自動デプロイが動くか → 動作を確認
- このリポジトリへの push 権限 → `git push` が成功したことで確認
- リモートに未取得の更新がないか → `git fetch` で確認

## 10. 関連資料

- `AGENTS.md`：Next.js 16 の注意点
- `CLAUDE.md`：Claude Code 向けの運用方針
- `docs/UPDATE-v3.md`：前回の UI 更新と定期実行の初回設定手順
- `README.md`：概要

## 11. 移行記録

### 2026-11-14：ChatGPT から Claude Code へ引き継ぎ

- **[引継]** ローカルフォルダ名を `stamp-card-app` から `Stgr-fv-app` に変更した。変更前のバックアップは取得済み。
- **[コード]** この資料と `CLAUDE.md` の運用方針を作成した。
- **[コード]** Claude Code の環境で次を確認した。
  - `npm run build` が成功（Node.js v24.14.1、npm 11.11.0、Next.js 16.2.2、警告・エラーなし）
  - `npm run start` で起動し、`/` と `/admin/login` が HTTP 200 を返した

### 2026-11-15：Vercel プロジェクト名の変更

- **[引継]** Vercel のプロジェクト名を `stgr-fv-app` に変更した。GitHub の接続先は `gydk858/bistro-bambi-stamp` のまま。
- **[引継]** 新 URL `https://stgr-fv-app.vercel.app` と旧 URL `https://bistro-bambi-stamp.vercel.app` は、どちらも同じプロジェクトの Production に接続されている。Vercel 上で両ドメインが Valid Configuration であることを確認済み。
- **[引継]** ユーザーが確認したこと
  - 新 URL：トップの表示と管理ログイン
  - 旧 URL：表示できること
  - ローカル：ビルドの成功、トップの表示、管理ログイン
- **[引継]** 旧 URL は既存連携のため、削除もリダイレクトもしない。
- **[引継]** 今回変更していないもの
  - GitHub Actions の接続先 URL
  - Discord の接続先 URL
  - Supabase と Storage（バケット・パス）
  - 配布済みトークン
- **[コード]** コード内に Vercel のドメインは直接書かれていない（`docs/UPDATE-v3.md` の例示を除く）。Supabase Storage の公開 URL はドメイン変更の影響を受けない。
- **[未確認]** 新 URL での、ハンター・イベントの専用 URL、`/hunter-print/`、`/event-card/` の表示。いずれも新旧両方のドメインで同じプロジェクトが応答する想定だが、実際の動作は未確認。

### 2026-11-15：Supabase MCP の接続確認

- **[確認済]** ユーザーが Claude の設定画面で Supabase コネクタを追加した。Claude Code のセッションから、Supabase MCP で対象プロジェクトに読み取り接続できることを確認した。使ったのは `get_project` と `list_tables` だけ。
  - プロジェクト `arahjxdrmqqvzzmyxuot`（Supabase 上の名前は `stamp-card`）は ACTIVE_HEALTHY（正常稼働）。リージョンは ap-southeast-1、PostgreSQL 17。
  - public スキーマのテーブル54個の名前を取得できた。`bambi_hunters` があり、RLS は有効。
  - 行データ、API キー、トークンは取得していない。DB と Storage は変更していない。
- **[要対応・保留]** Supabase のセキュリティ警告で、public スキーマの15テーブルが RLS 無効と報告された。対象テーブルは次のとおり。
  - `card_types`、`card_programs`、`card_templates`、`cards`
  - `stamp_cards`、`stamp_histories`
  - `bingo_cards`、`bingo_card_cells`、`bingo_product_mappings`、`bingo_mark_histories`
  - `users_backup_before_stamp_migration_20260413`、`users_backup_before_drop_stamp_count_20260413`、`users_backup_before_drop_legacy_columns_20260413`
  - `stamp_migration_map`、`staff_work_sessions`
- **[未確認]** RLS について確認していないこと
  - 実際の anon 権限（テーブルの GRANT）
  - API の公開範囲
  - アプリへの影響
- **[引継]** RLS の調査・修正は、ユーザーの判断で保留中。修正 SQL は実行していない。ポリシーを作らずに RLS だけを有効にすると、anon キーで直接アクセスしている画面が動かなくなるおそれがあるため、調査してから対応すること。
- **[未確認]** Storage のバケット設定、RLS のポリシー内容、RPC 関数、Supabase MCP の書き込み権限の有無。

### 2026-11-15：GitHub の接続確認

- **[確認済]** このセッションで使えた手段
  - Claude Code のセッションに GitHub の MCP コネクタはなかった。設定画面に登録済みの「GitHub 連携」は、このローカルセッションからはツールとして見えなかった。
  - `gh` コマンドはインストールされていない（インストールもしていない）。
  - 使えたのは、git（Windows の資格情報マネージャー経由）と、GitHub の公開 API（認証なし・読み取りのみ）。
- **[確認済]** リポジトリ `gydk858/bistro-bambi-stamp` は公開（public）で、既定ブランチは `main`。`git ls-remote` と公開 API の両方で読み取りできた。
- **[未確認]** 認証ユーザー名。認証付きの手段がないため確認できなかった。push 権限は、後の push 成功で確認済み（次の項を参照）。
- **[確認済]** ワークフロー「Daily hunter print refresh」は有効（active）で、実行は全部で6回。2026-11-15 に取得した直近5回は次のとおり（すべて定期実行、ブランチ `main`、結果は成功）。

| 実行 | 開始（UTC） | 開始（日本時間） | 終了（日本時間） |
| --- | --- | --- | --- |
| #6 | 2026-11-14 16:44 | 2026-11-15 01:44 | 01:49 |
| #5 | 2026-11-13 18:08 | 2026-11-14 03:08 | 03:13 |
| #4 | 2026-11-12 18:37 | 2026-11-13 03:37 | 03:42 |
| #3 | 2026-11-11 18:08 | 2026-11-12 03:08 | 03:13 |
| #2 | 2026-11-10 18:19 | 2026-11-11 03:19 | 03:23 |

- **[確認済]** 予定は UTC 10:50（日本時間 19:50）だが、実際の開始は6〜8時間遅れていた。
- **[未調査]** 遅れの原因。
- **[未確認]** 各実行のログの内容（更新件数・失敗件数）、実行 #1 の詳細、Secrets と Variables の登録状況。Secrets の値には触れていない。

### 2026-11-15：push と本番反映の最終確認

- **[確認済]** Claude Code から `git fetch origin` を実行し、リモートとの分岐がないことを確認した。そのうえで `git push origin main` が成功し（`048a7b0..4eabe54`）、このリポジトリへの push 権限を確認できた。認証は Windows の資格情報マネージャーで行われた。
- **[引継]** コミット `4eabe54d051054e499687dbc17e244cce1db8ff0` の Vercel 自動デプロイが成功した（完了：2026-11-15 06:43 日本時間）。
- **[引継]** デプロイ後、新旧両方の URL でトップページが表示されることを、ユーザーが確認した。
  - `https://stgr-fv-app.vercel.app`
  - `https://bistro-bambi-stamp.vercel.app`
- **[確認済]** `main` への push で、本番の自動デプロイが起動する。

## 12. 今後の開発手順

1. **依頼内容の確認**：目的・対象・制約を確認する。分からない点は推測せず質問する。
2. **修正**：依頼の範囲だけを変更する（`CLAUDE.md` の運用方針に従う）。
3. **動作確認・ビルド**：変更に応じて `npm run build`、ローカルでの起動（`npm run start` または `npm run dev`）、画面や API の確認を行う。DB・Storage に書き込む確認は、依頼がない限り行わない。
4. **変更内容の報告**：「実施した結果」と「未確認事項」を分けて報告する。
5. **commit・push**：本番に反映するよう依頼があったときに行う。push の前に `git fetch origin` で分岐がないことを確認する。force push はしない。
6. **デプロイ結果の確認**：**`main` への push で本番（Vercel Production）の自動デプロイが起動する**。現時点では Claude Code から Vercel を操作できないため、デプロイ結果はユーザーが Vercel の管理画面で確認する。
