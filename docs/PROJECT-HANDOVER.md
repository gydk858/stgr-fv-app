# Bistro Bambi 引き継ぎ資料（Stgr-fv-app）

作成日：2026-11-14（ChatGPT から Claude Code への引き継ぎ時）
更新日：2026-11-15（Vercel・GitHub の名称変更、各サービスの接続確認、移行の最終確認、改名後の本番確認を反映。「11. 移行記録」と「12. 今後の開発手順」を参照）

**移行状況：完了**（2026-11-15）。GitHub リポジトリの改名後も、Claude Code から main への push と Vercel の自動デプロイまで確認済み。残っている課題は「9. 未解決事項・未確認事項」を参照。

この資料では、情報源を次の記号で区別して記載します。

| 記号 | 意味 |
| --- | --- |
| **[コード]** | 2026-11-14 時点のリポジトリ内のコード・設定ファイルで確認できた事実 |
| **[確認済]** | Claude Code のセッションで、コマンド・API・ブラウザを使って確認した事実 |
| **[ChatGPT確認]** | ChatGPT 側で確認され、引き継ぎで伝えられた事実 |
| **[引継]** | ユーザーからの引き継ぎ情報（ユーザーが画面で確認したことを含む） |
| **[未確認]** | 現時点で確認できていない事項。推測で補わないこと |

既存資料（`docs/UPDATE-v3.md`・`README.md`）と現在のコードが異なる場合は、**現在のコードを優先**します。違いは「8. 既存資料との差異」に記載します。

秘密情報（`.env.local` の値、各種キー・トークン・パスワード）はこの資料に記載しません。

---

## 0. システムの位置づけ

- **[引継]** このシステムは、GTA5 のロールプレイサーバー「ストグラ」の中で、飲食店「ビストロバンビ」を経営するための管理サイト。スタンプ・ビンゴ・イベント・ハンティング・従業員・給与などを管理する。
- **[引継]** 扱う情報はすべてゲーム内の情報で、問題があっても影響は小さい。そのため、動作確認は本番で直接行ってよい（2026-11-15、ユーザーの判断）。ただし、本番の変更は内容を示してから行い、GTA 印刷用の固定 URL・Storage のパス・配布済みのトークンは維持する。

## 1. プロジェクトの場所と名称

- **[引継]** ローカルフォルダ名を `stamp-card-app` から `Stgr-fv-app` に変更済み。変更したのはフォルダ名だけ。
- **[引継]** Supabase は変更していない。既存のものを継続利用する。
- **[引継]** GitHub リポジトリ名は 2026-11-15 に `gydk858/bistro-bambi-stamp` から `gydk858/stgr-fv-app` へ変更済み。リポジトリ自体は同じものを継続利用する。
- **[引継]** Vercel のプロジェクト名は 2026-11-15 に `stgr-fv-app` へ変更済み。プロジェクト自体は同じものを継続利用する。Connected Git Repository は `gydk858/stgr-fv-app` に更新されていることを、ユーザーが Vercel の画面で確認済み。
- **[引継]** フォルダ名変更前のローカルバックアップは取得済み。
- **[コード]** 作業ディレクトリ：`C:\Users\gydk8\GTA5\Stgr-fv-app`
- **[確認済]** Git リモート（origin）：`https://github.com/gydk858/stgr-fv-app.git`、ブランチ `main`（`origin/main` を追跡）
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
| ホスティング | Vercel プロジェクト `stgr-fv-app`（**[引継]** GitHub `gydk858/stgr-fv-app` に接続）。**[確認済]** `main` への push により本番の自動デプロイが起動する。リポジトリの改名前（`4eabe54`）と改名後（`4487f2c`）の両方で成功を確認（2026-11-15）。**[コード]** リポジトリ内に `.vercel/` と `vercel.json` はない |

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

### 現在の起動方法（2026-11-15 から）

**[確認済]** 毎日 19:50（日本時間）の画像更新は、次の流れで起動する。

| 順 | 仕組み | 内容 |
| --- | --- | --- |
| 1 | Supabase の pg_cron | ジョブ `hunter-print-dispatch`（`50 10 * * *`、UTC。pg_cron のタイムゾーンは GMT）が、`ops.dispatch_hunter_print_refresh(false)` を実行する |
| 2 | Supabase の pg_net | Vault の `github_dispatch_token` を使い、GitHub の手動実行用 API（`workflow_dispatch`、ref は `main`）を呼ぶ |
| 3 | GitHub Actions | 「Daily hunter print refresh」が、手動実行（workflow_dispatch）として約1〜2秒で開始する（テストで実測） |
| 予備 | GitHub の `schedule` | 遅れて動いても、対象の更新日（その日の JST 19:50 の枠）以降に開始して成功した本番更新があればスキップする（`tools/hunter-refresh-guard.mjs`。朝の手動更新は対象にしない）。pg_cron 側が失敗した日だけ、遅れて更新し、警告を出す。本番反映済み（b44676b、2026-11-15）。判定の限界は `docs/ops/hunter-dispatch-cron.sql` に記載 |

- SQL・確認方法・戻し方：`docs/ops/hunter-dispatch-cron.sql`
- `dry_run=true` で起動すると、画像を更新せずに起動経路だけを確認できる（実行名は「Dry run (dispatch check)」）。dry_run の成功は起動経路の確認で、毎日の定刻開始の保証ではない。
- 毎日の確認は「cron の実行」「GitHub の受付（HTTP 204）」「ジョブの開始」「全カードの更新完了（run が success）」を別々に見る。手順は `docs/ops/hunter-dispatch-cron.sql` の確認用 SQL。
- GitHub トークンの有効期限は **2027-11-15**。期限前に作り直して、Vault を更新する。

### ワークフローの内容

- **[コード]** `.github/workflows/hunter-print-refresh.yml`（Daily hunter print refresh）
  - スケジュールは `cron: '50 10 * * *'`（UTC 10:50 = 日本時間 19:50。2026-11-15 から予備の位置づけ）。手動実行（`workflow_dispatch`、入力 `dry_run`）にも対応。
  - Node 22 で `tools/refresh-hunter-cards.mjs` を実行する。
    - `/api/hunter-refresh` をカード1枚ずつ呼び出し、一時エラーは最大3回まで試行する。
    - 全体の上限は180分で、同時実行はしない。
  - 使う設定は GitHub の Variables `BAMBI_APP_URL` と Secrets `HUNTER_REFRESH_SECRET`。Vercel 側にも同じ `HUNTER_REFRESH_SECRET` が必要。
  - GitHub 側にサービスキーは不要。
- **[引継]** 毎日 19:50（日本時間）の画像更新が設定されている。
- **[確認済]** 2026-11-15 に GitHub の公開 API で実行履歴を取得した。直近5回（#2〜#6）は定期実行で、すべて成功していた。ただし開始時刻は予定の19:50より6〜8時間遅れていた（詳細は「11. 移行記録」）。遅れの原因は未調査。
- **[未確認]** 各実行のログの内容（更新件数・失敗件数）、実行 #1 の詳細、GitHub と Vercel への変数登録状況。
- **[引継]** 2026-11-15 の Vercel 名称変更時に、GitHub Actions の接続先 URL（`BAMBI_APP_URL`）は変更していない。
- **[確認済]** `BAMBI_APP_URL` の値は旧 URL の `https://bistro-bambi-stamp.vercel.app`（2026-11-15 に GitHub の画面で確認）。旧ドメインを維持している限り動作する。新 URL への切り替えは、依頼があったときに別途行う。
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

1. **画像自動更新の開始時刻のずれ**：GitHub の予約実行は、予定の19:50（日本時間）より6〜10時間遅れていた。GitHub 内部の理由は観測できず、未確定。**対策（A案）は 2026-11-15 に実施済み**で、Supabase pg_cron から19:50に起動する。次の2つは、本番初回（2026-11-15 19:50）の後に確認する。
   - 時刻どおりに開始して、画像更新が成功するか → **[確認済] 2026-11-15 の初回は成功**（下記）
   - 予備の予約実行がスキップされるか → **[未確認]**（GitHub の予約実行は数時間遅れて起動するため、起動後に確認する）

   **2026-11-15 19:50 の結果（読み取りで確認）**：pg_cron のジョブ `hunter-print-dispatch` が 19:50:00.17 に開始し succeeded（0.1秒）。`net._http_response` に 19:50:00.27 の HTTP 204（GitHub が受付）。GitHub Actions「Daily hunter print refresh」は workflow_dispatch として 19:50:01 に作成、19:50:05 にジョブ開始、19:51:55 に完了し、結果は success（「Refresh all hunter cards」も success。このスクリプトは1枚でも失敗すると終了コード 1 になるため、全カードの更新に成功したと判断）。

   詳細は「5. 定期処理」と「11. 移行記録」を参照。
2. **Supabase の権限（RLS）**：2026-11-15 に調査した。15テーブルだけでなく、ブラウザに配られている公開キー（anon）で、顧客・従業員・給与のデータを読み書きでき、多くの RPC も実行できる状態だった。原因は、管理画面14画面がブラウザから anon キーで DB を直接操作している構成にある。
   - **段階0**（使われていない関数12個と5テーブルの権限削除）は適用済み。
   - **段階1**（管理画面の DB アクセスを、サーバー側の `/api/admin-*` に移す）：手順1〜9をすべて本番反映済み（手順7〜9は 2026-11-15 20:39 JST）。管理画面14画面から DB への直接通信はなくなった（「14画面すべてが正常に動く」ことの確認とは別。書き込みの実行や一部の表示は未確認）。進捗は `docs/ops/rls-stage1-plan.md` の「進捗」。
   - **段階2**（anon の権限削除と RLS の全面有効化）：**2026-11-15 23:48 JST に本番適用済み**（マイグレーション `20261115144805`）。対象の権限の剥奪をカタログで確認し、公開キーでの実リクエストは拒否・許可0・一部は判定不能（内訳は資料）。結果は `docs/ops/rls-stage1-plan.md` の「段階2の本番適用」、戻し方は `docs/ops/rls-stage2-restore.sql`。影響の確認と未確認事項は `docs/ops/rls-stage1-plan.md` の「段階2の準備」。合格基準は、anon キーの非表示ではなく、DB の実効権限と service role の API の認可で判断する（`docs/ops/rls-stage1-plan.md` の「7.」）。
   - **[引継]** ユーザーの決定（2026-11-15）
     - 給与画面の表示は、移行後に変わってよい。
     - 書き込みの確認は本番で直接行ってよい。
     - `ito_*` の3テーブルは、別のプロジェクトで使っていたもの。2026-11-15 に削除した（マイグレーション `drop_unused_ito_tables`。public のテーブルは54個から51個になった）。
   - 詳細は「11. 移行記録」の RLS 調査の項と、`docs/ops/rls-stage0.sql` を参照。
3. **専用ページ・印刷画像の残りの確認**：管理画面、`/hunter-user/`、`/hunter-print/` は、新旧両方の URL で確認済み（「11. 移行記録」の改名後の本番確認を参照）。次は新旧とも未確認。
   - `/event-card/{token}`：画像のキャッシュがないと生成して Storage と DB に保存するため、確認目的ではアクセスしていない
   - 専用受付の入口（`/hunter-access/`、`/event-access/`）：入口用のトークンを取得していないため
4. **Vercel 管理ツールが未接続**：Vercel を操作する MCP と CLI は、Claude Code に接続していない。ただし Git 経由の自動デプロイは、GitHub リポジトリの改名前と改名後の両方で成功を確認済み。デプロイ結果は、GitHub のコミットステータス（公開 API）か Vercel の管理画面で確認する。
5. **GitHub Actions の改名後の定期実行**：「Daily hunter print refresh」の定期実行が、改名後も起動・成功するか未確認。
6. **pg_net（`net` スキーマ）**：anon・authenticated・PUBLIC に、`net.http_get`・`http_post` などの実行権限とキューテーブルの権限がある（関数の ACL が NULL ＝ 既定の PUBLIC 実行権限）。所有者は `supabase_admin` で、postgres（superuser ではない）では権限を外せない。
   - 外部からの到達性（2026-11-15 確認）：PostgREST の公開スキーマは `public`・`graphql_public` だけで、`net`・`ops`・`cron` は「Invalid schema」で拒否される（存在しない関数名での確認で、何も実行していない）。GraphQL（pg_graphql）は無効。`net` を呼ぶ関数は `ops.dispatch_hunter_print_refresh` だけで、anon は `ops` スキーマを使えない。`public` の動的 SQL を使う関数（`reset_system_runtime_data`）は anon が実行できない。
   - 結論：今は外部から pg_net を呼べないため、権限の変更は行わない。条件として、`net` を公開スキーマに加えない、`public` に `net` を呼ぶ関数（特に SECURITY DEFINER）を作らない。
7. **画像更新 API（`/api/sync-*`）の認証**：認証なしで service role の画像再生成ができた（`sync-staff-card` は GET でも）。管理セッション＋同じオリジンを必須にし、GET を削除し、Discord は署名検証の後に生成関数を直接呼ぶように変更した。**本番反映済み**（07f5c0b、2026-11-15）。公開 PNG の URL と Storage のパスは変えていない。
8. **Vercel Functions のリージョン**：本番の応答ヘッダー `x-vercel-id` は `hnd1::iad1`（関数はワシントン）で、Supabase（シンガポール）との往復ごとに遅い。管理 API の応答は、店舗情報 1.4〜2.1秒、単価ルール 2.5〜3.7秒（2026-11-15、継続アクセス）。
   - 問い合わせ回数の削減（99309d0、反映済み）：ローカル（日本→シンガポール）で、店舗情報 224→123ms、単価ルール 585→211ms、月次給与 614→250ms（中央値）。
   - `vercel.json` で関数を `sin1` に固定（f9b1d00、反映済み）。反映後は単価ルール 303ms、店舗情報 226ms（中央値）。詳細は「11. 移行記録」。

### その他の未確認事項

- GitHub と Vercel の `HUNTER_REFRESH_SECRET` の値が一致しているか（値は見ない方針。定期実行の成功から、一致していると推定）
- GitHub の認証ユーザー名（push 権限があることは確認済み）
- 全員を HR 1 に戻す SQL を実行済みかどうか
- 本番 DB で、ハンター動物の並び（兎 → スカンク）とサイズ設定が想定どおりか
- `next.config.ts` の `/card/*.png` 書き換えが使われているか
- Git のユーザーメール設定（ドメインが `gmai.com` になっている）が意図どおりか

### 解決済み（2026-11-15）

- Vercel のプロジェクト名と本番 URL（引き継ぎ情報で判明）
- `main` への push で Vercel の自動デプロイが動くか → 動作を確認
- GitHub リポジトリ改名後の push で、Vercel の自動デプロイが動くか → `4487f2c` で成功を確認
- 改名後の本番画面（管理画面、ハンターの本人ページ・印刷画像、イベントのライブ画像）→ 新旧両方の URL で表示を確認
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
- **[未確認]** 新 URL での、ハンター・イベントの専用 URL、`/hunter-print/`、`/event-card/` の表示。いずれも新旧両方のドメインで同じプロジェクトが応答する想定だが、実際の動作は未確認（記録時点）。→ 一部は後日確認済み（「改名後の本番確認」を参照）。

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

### 2026-11-15：GitHub リポジトリ名の変更

- **[引継]** ユーザーが GitHub のリポジトリ名を `gydk858/bistro-bambi-stamp` から `gydk858/stgr-fv-app` に変更した。
- **[確認済]** Claude Code で、ローカルの origin を `https://github.com/gydk858/stgr-fv-app.git` に変更した（`git remote set-url`）。
- **[確認済]** 変更後の `git fetch origin` が成功した。`main` と `origin/main` はどちらも `f97c9ef` で一致し、分岐はなかった。
- **[引継]** Vercel の Connected Git Repository が `gydk858/stgr-fv-app` に更新されていることを、ユーザーが Vercel の画面で確認した。
- **[確認済]** 改名後の push で Vercel の自動デプロイが成功した（詳細は次の項）。
- **[未確認]** 改名後に、GitHub Actions「Daily hunter print refresh」の定期実行が起動・成功するか。
- この項より前の移行記録に書かれている旧リポジトリ名 `bistro-bambi-stamp` は、当時の記録としてそのまま残している。
- 旧 Vercel ドメイン `https://bistro-bambi-stamp.vercel.app` は Vercel のドメイン名で、GitHub リポジトリ名とは別のもの。引き続き維持する。

### 2026-11-15：改名後の自動デプロイと本番画面の確認

**自動デプロイ**

- **[確認済]** 改名後の最初の push（`git push origin main`、`f97c9ef..4487f2c`）が、新しいリポジトリ `https://github.com/gydk858/stgr-fv-app.git` に成功した。
- **[ChatGPT確認]** コミット `4487f2cd0acb117a9024d18231fdc72d7e9cba0a`（docs: record GitHub repository rename）の Vercel 自動デプロイが成功した。ChatGPT が GitHub のコミットステータス API で確認した。
  - 結果：context `Vercel`、state `success`、description `Deployment has completed`
  - 完了日時：2026-11-15 07:02:59（日本時間）
- **[確認済]** Claude Code でも、GitHub の公開 API（認証なし）で同じコミットステータスを取得した。`Vercel` / `success` / `Deployment has completed` / 2026-11-14 22:02:59 UTC（日本時間 2026-11-15 07:02:59）で、ChatGPT の確認結果と一致した。

**本番画面**

- **[確認済]** ログインせずに、新旧両方の URL で確認した結果
  - トップ `/` が 200（タイトル「Bistro Bambi」）
  - `/admin/login` が 200
  - 未ログインでの `/admin` は 307 でログイン画面へ転送される
  - 未ログインでの管理 API（`/api/admin-events`）は 401
- **[確認済]** 管理ログインはユーザーが行った（新旧の URL それぞれで1回ずつ）。ログイン後に、新旧両方の URL で読み取りだけの確認をした。登録・発行・画像更新などの操作はしていない。
  - 管理画面11ページ（管理メニュー、ハンティング、スタンプ、スタンプ顧客、ビンゴ、ビンゴ顧客、イベント、従業員、従業員カード、勤怠、システム）がすべて 200。新 URL では、管理メニューの6項目の表示もブラウザで確認した。
  - ハンター一覧 API は24件で、DB の件数と一致。ハンター1件の詳細も取得できた。
  - そのハンターの `/hunter-print/{token}` が 200、PNG（約3.7MB）。Storage の `bambi-hunter-live/{token}-all.png` も同じ画像で 200。
  - そのハンターの `/hunter-user/{token}` が 200 で、「無効」の表示は出ていない。ブラウザで画面を開いての確認はしていない。
  - イベント一覧は3件。カードのある2件で、`bambi-event-live/{token}.png` が 200、PNG（新 URL で確認）。
  - トークンは、ログ・報告・この資料のどこにも全文を記録していない。
- **[確認済]** 補足：ハンティング受付の画面は、開いた直後に「ハンター一覧 0件」と表示され、数秒後に正しい件数（24件）に変わる。読み込み中の表示で、不具合ではない。
- **[未確認]** `/event-card/{token}`。キャッシュがない場合に生成と保存（Storage と DB への書き込み）が起きるため、確認目的ではアクセスしていない。
- **[未確認]** 専用受付の入口（`/hunter-access/`、`/event-access/`）。
- **[未確認]** スタンプ・ビンゴ・従業員の画面で、データを読み込んだ後の表示（ページが表示されることだけ確認）。

### 2026-11-15：GitHub Actions の改名後の状態確認

GitHub の公開 API（認証なし・読み取りのみ）で、11/15 07:16（日本時間）に確認した。手動実行や設定変更はしていない。

- **[確認済]** ワークフロー「Daily hunter print refresh」の状態
  - 有効（active）。ID は 411921830、作成は 2026-11-09。
  - スケジュールは `cron: '50 10 * * *'`。GitHub の cron は UTC 固定で、ファイルにタイムゾーンの指定はない。日本時間では毎日 19:50。
  - ワークフローファイルの最後の変更は `95b5e9f`（2026-11-09）。全6回とも同じ内容で動いている。
- **[確認済]** 旧リポジトリ名の参照は docs 以外にない。ワークフローは `vars.BAMBI_APP_URL` と `secrets.HUNTER_REFRESH_SECRET` だけを使い、リポジトリ名を参照していない。API が返すリポジトリ名も `gydk858/stgr-fv-app` になっている。
- **[確認済]** 改名後の定期実行は、確認時点でまだない。次の予定は 2026-11-15 19:50（日本時間）。
- **[確認済]** 全6回の実行（日本時間。結果はすべて success）

| 回 | 予定（前日 19:50）から実行の作成まで | 実行の作成 | ジョブ開始 | ジョブ完了 | 更新処理の所要時間 |
| --- | --- | --- | --- | --- | --- |
| #6 | 約5.9時間 | 11/15 01:44:28 | 01:44:30 | 01:49:29 | 4.9分 |
| #5 | 約7.3時間 | 11/14 03:08:25 | 03:08:28 | 03:13:50 | 5.2分 |
| #4 | 約7.8時間 | 11/13 03:37:33 | 03:37:36 | 03:42:48 | 4.9分 |
| #3 | 約7.3時間 | 11/12 03:08:24 | 03:08:27 | 03:13:09 | 4.6分 |
| #2 | 約7.5時間 | 11/11 03:19:01 | 03:19:03 | 03:23:23 | 4.2分 |
| #1 | 約10.3時間 | 11/10 06:08:10 | 21:33:15（2回目の試行） | 21:37:47 | 4.3分 |

- **[確認済]** 遅れが出ている場所：ジョブが作られてから実際に動き出すまでは、毎回2〜3秒。遅れは、予定時刻から実行が作られるまでの間で発生している。
- **[確認済]** #1 は2回目の試行で成功した（1回目の試行は 11/10 06:08 に作成、2回目の試行は 21:33 開始）。
- **[確認済]** 直近の #6 の注記（annotations）
  - warning：`actions/checkout@v4` と `actions/setup-node@v4` が Node.js 20 向けのため、Node.js 24 で強制的に実行されている（廃止予告）。今は成功している。
  - notice：`ubuntu-latest` が Ubuntu 26 へ移行するという告知。
- **[未確認]** 改名後の定期実行の結果。
- **[未確認]** ログ本文と、更新件数・失敗件数。ログの取得には認証が必要で、公開 API では 403 だった。
- **[未確認]** #1 の1回目の試行の結果と、再実行したきっかけ。

### 2026-11-15：19:50 の画像更新が遅れる原因の調査と改善（A案）

**調査結果**

- **[確認済]** 遅れは、予定時刻（UTC 10:50）から GitHub が実行を作るまでの間で発生していた（約5.9〜10.3時間）。実行が作られてからジョブが始まるまでは2〜3秒、処理時間は約5分。
- **[確認済]** 設定の問題ではない。
  - cron は UTC 10:50（日本時間 19:50）で正しく、全6回とも同じワークフローファイルで動いている。
  - ずれの幅が毎回違うので、タイムゾーンの取り違えではない。
  - 既定ブランチの最新コミットで実行されている。
- **[外部情報]** GitHub の公式ドキュメントによると、予約実行は高負荷時に遅れたり、取りこぼされたりすることがある。毎時0分は特に負荷が高い（10:50 は該当しない）。cron に IANA 形式のタイムゾーンを指定することもできる。
- **[未確認]** GitHub の内部で遅れている具体的な理由は観測できない。混雑が原因とは断定しない。
- 結論：GitHub の予約実行だけでは、「毎日19:50に開始」という要件を保証できない。

**改善の方針（A案。ユーザーが採用を決定）**

- Supabase の pg_cron と pg_net を使い、UTC 10:50 に GitHub の手動実行用 API（`workflow_dispatch`）を呼ぶ。画像更新の処理は、今の GitHub Actions をそのまま使う。
- GitHub の `schedule` は予備として残す。直近20時間以内に手動実行での画像更新が成功していれば、スキップする。
- ワークフローに `dry_run` の入力を追加し、画像を更新せずに起動経路だけを確認できるようにする。
- Supabase で実行する SQL の案と、確認方法・戻し方は `docs/ops/hunter-dispatch-cron.sql` にまとめた。
- **[引継]** 起動用の GitHub トークンを、ユーザーが作成した（2026-11-15）。
  - 種類：fine-grained PAT。名前は `stgr-fv-app hunter dispatch`。
  - 対象：1リポジトリ（`gydk858/stgr-fv-app`）。
  - 権限：Actions が Read and write、Metadata が Read-only。
  - **有効期限：2027-11-15（月）**。期限が切れると19:50の起動が止まり、予備の遅れる定期実行だけになる。期限前に作り直して、Vault を更新すること。
  - トークンの値は、この資料・チャット・Git のどこにも記録しない。保存先は Supabase Vault（名前 `github_dispatch_token`）だけ。
- 進め方（各手順は実行前にユーザーの承認を得る）
  1. トークンの作成（完了）
  2. ワークフロー変更の push
  3. Vault への保存（ユーザーが行う）
  4. 拡張機能の有効化と関数の作成
  5. dry_run でのテスト
  6. 本番登録

**実施結果（2026-11-15）**

- **[確認済]** 手順2：ワークフローの変更を push した（`6f3e67e`）。Vercel のデプロイは成功し、新旧両方の URL のトップページは 200。
- **[確認済]** 手順3：ユーザーがトークンを Vault に保存した。Claude Code は、値を読まずに、名前 `github_dispatch_token` が1件あることだけを確認した。
- **[確認済]** 手順4：マイグレーション `hunter_print_dispatch_function` を適用した。
  - pg_cron 1.6.4 と pg_net 0.20.0 を有効にした。
  - 専用スキーマ `ops` を作り、関数 `ops.dispatch_hunter_print_refresh` を作った（security definer、search_path は空）。
  - anon と authenticated には、`ops` スキーマの利用権限も関数の実行権限もないことを確認した。
- **[確認済]** 手順5：dry_run でテストした（画像の更新はしていない）。

| テスト | GitHub API の応答 | 予定・呼び出しから実行の作成まで | GitHub の実行 |
| --- | --- | --- | --- |
| 5a 関数を直接呼ぶ | 204 | 約2秒 | #7 Dry run、success。画像更新のステップは skipped |
| 5b cron 経由（UTC 22:46 で1回） | 204 | 約1秒 | #8 Dry run、success。画像更新のステップは skipped |

  - 5a で、GitHub が新しいワークフロー（`dry_run` の入力と実行条件）を正しく読み込んでいることも確認した。
  - テスト用のジョブ `hunter-print-dispatch-test` は、確認後に解除した。
- **[確認済]** 手順6：本番ジョブ `hunter-print-dispatch` を登録した（jobid 2、`50 10 * * *`、active、実行ユーザーは postgres）。初回は 2026-11-15 19:50（日本時間）。
- **[未確認]** 本番初回（dry_run=false）の結果。時刻どおりの開始、画像更新の成功、その夜の予備の予約実行がスキップされるか。
- **[確認済・対応保留]** pg_net の関数（`net.http_post` など）は、Supabase の初期設定のまま、anon と authenticated にも `net` スキーマの利用権限と実行権限がある。
  - `net` スキーマが API（PostgREST）に公開されているかは、SQL からは確認できず未確認。
  - Vault のトークンと `ops` の関数には、anon からは届かない。
  - 権限を絞るかどうかは、【5】の RLS 調査とあわせて判断する。

### 2026-11-15：Supabase の権限（RLS）調査と段階0の適用

**調査結果**（読み取りのみ。行データは取得していない）

- **[確認済]** RLS が無効な15テーブルすべてで、anon と authenticated に SELECT・INSERT・UPDATE・DELETE（ほかに TRUNCATE・TRIGGER・REFERENCES）が付与されていた。
- **[確認済]** RLS は有効でも、ポリシーの条件が `true`（全行を許可）になっているテーブル
  - `users`：anon（public ロール）の読み取り・追加・更新
  - `employee_profiles`：anon の読み取り・追加・更新
  - `payroll_period_inputs`、`payroll_period_summaries`：anon の読み取り・追加・更新
  - `ranch_care_events`、`ranch_profit_entries`：anon の読み取り・追加・更新・削除
  - `payroll_*`（ほか）、`staff_*`、`stores`、`app_settings`：anon の読み取り
- **[確認済]** ビュー `v_stamp_cards_current`、`v_bingo_cards_current`、`v_staff_stamp_cards_current` は、作成者の権限で動く設定（security_invoker なし）。anon が読み取り・更新できる。
- **[確認済]** `public` の独自関数のうち、`bambi_*` 以外の約60個を anon が実行できた。security definer の関数が多く、`reset_system_runtime_data`（全データの削除）も含まれていた。
- **[確認済]** ハンターとイベント（`bambi_*` の18テーブルと関連する関数）は、anon に権限がない。サーバー側（service role）だけで扱われている。
- **[確認済]** ブラウザ用のビルド成果物（`.next/static`）に、Supabase の URL と publishable キーの形式の文字列が含まれている（値は記録しない）。`/_next/static` はログインなしで取得できるため、キーは公開状態にある。
- **[確認済]** アプリの経路
  - 14画面（スタンプ、ビンゴ、スタッフ、給与、牧場、各種 manage）：ブラウザから anon キーで DB を直接操作する。管理ログイン（proxy）は、この直接アクセスを守れない。
  - ハンター、イベント、Discord、sync-card 系、admin-reset 系：サーバー側（service role）で操作する。
- **[未確認]** 実際に anon キーで API を呼ぶ検証はしていない（秘密情報を使った接続を避けた）。第三者からアクセスされた形跡（API ログ）も未確認。

**段階0の適用**（ユーザーの承認を得て適用。マイグレーション `rls_stage0_revoke_unused_anon_privileges`）

- 変更前の権限を `ops.acl_snapshot_stage0` に保存した（69行）。
- 関数12個から、anon・authenticated・PUBLIC の実行権限を外した。service_role の実行権限は残っている。
  - `reset_system_runtime_data`、`reset_all_stamp_cards`、`reset_all_bingo_cards`、`reset_regular_customer_stamp_cards`
  - `archive_active_stamp_cards`、`archive_active_bingo_cards`
  - `staff_clock_in`、`staff_clock_out`、`staff_fix_work_session`
  - `snapshot_staff_stamps_for_period`、`build_payroll_run_preview`、`upsert_ranch_care_event`
- 未使用の5テーブル（バックアップ3つ、`stamp_migration_map`、`card_templates`）で RLS を有効にし、anon と authenticated の権限を外した。
- anon と authenticated から、public の全テーブルの TRUNCATE・TRIGGER・REFERENCES を外した（残りは0件）。
- **[確認済]** 適用後に、新 URL の管理画面10ページ（スタンプ、スタンプ顧客、ビンゴ、ビンゴ顧客、従業員、給与、給与の月次・履歴・レート、牧場）を開いた。データの読み込みでエラーは出ていない。書き込みの操作はしていない。
- **[未確認]** 書き込みを伴う操作の実地確認（Discord の出退勤とスタンプ、admin-reset 系 API、各画面の保存）。どれも service role か、権限を変えていない関数を使うため、影響はない見込み。
- 適用した SQL：`docs/ops/rls-stage0.sql`（再実行防止のガードを 2026-11-15 に追加。段階0は適用済みのため、再実行しない）
- 戻し方：`docs/ops/rls-stage0-restore.sql`（2026-11-15 改訂）
  - 旧版の復元 SQL（`rls-stage0.sql` の末尾）は、削除済みの `ito_*` で GRANT が失敗して全体が止まる、`GRANT ALL` で段階0の範囲外の権限まで戻す、PUBLIC・anon・authenticated をまとめて扱う、という問題があったため置き換えた。
  - 新版は、段階0の範囲だけを aclitem 単位（付与先・権限・付与オプション）で戻す。段階0直後の期待状態と今の状態に差がある、想定外の欠落がある、未確認のマイグレーションや `ops.acl_snapshot_stage2` がある、スナップショットが複数回分ある、などの場合は止まる。実行は、計画で表示された captured_at と plan_hash を引数で渡したときだけ行う。
  - **[検証済：PGlite]** PGlite 0.5.14（PostgreSQL 18.6）上の合成データで、postgres による GRANT・REVOKE と、ACL 明細（オブジェクト・付与先・権限・付与オプション・付与者）・RLS 状態の一致を22ケースで確認した（通常・付与先の違い・付与オプション・NULL ACL・削除済み・スナップショット重複・段階0後の変更・再実行・途中失敗・承認の誤り・計画表示の非永続性）。回帰テスト：`tools/tests/rls-stage0-restore/`（実行方法と期待結果は同フォルダの README.md）。
  - **[確認済：本番・読み取りのみ]** 計画部分を、一時関数を作らない読み取り専用の SELECT に書き換えて実行した（2026-11-15）。定義した検査条件に当たるもの（block）は0件、戻す権限 308件（49オブジェクト）、RLS 5テーブル、info は既知の除外 `ito_*` 3件とマイグレーション1件。block 0件は無条件の安全保証ではない。
  - **[未検証]** 本番の PostgreSQL 17.6 での、このファイルそのままの実行（一時関数を含む）と復元。anon・authenticated の実効権限、本番の認証、API 経由のアクセス、Supabase 固有の既定権限・所有者。ロール属性が影響しないと言えるのは、PGlite での上記の操作と比較の範囲に限る。
  - **[限界]** 段階0で外した権限を後でもう一度 REVOKE した場合（段階2など）は ACL では区別できない。マイグレーション履歴と `ops.acl_snapshot_stage2` の有無で止めるが、マイグレーションを使わない直接の変更は検知できない。作り直された同名オブジェクトは、ACL・RLS に差が出ない限り見分けられない。
  - 本番での復元は行っていない（承認がない限り行わない）。

**残っている対応**

- 段階1：14画面の DB アクセスを、サーバー側の `/api/admin-*`（service role、ログイン必須）に移す。コードの変更が必要。
- 段階2：移行後に、anon と authenticated の権限を外し、全テーブルで RLS を有効にして、`true` のポリシーを削除する。

### 2026-11-15：外部サービスの接続手段（再確認）

**[確認済]** Claude Code のセッションから使える手段

| サービス | 使える手段 | 使えない手段 | できること |
| --- | --- | --- | --- |
| Supabase | Supabase MCP（コネクタ、36ツール） | Supabase CLI | 読み取り、SQL、マイグレーション（変更は承認後に行う） |
| GitHub | git（Windows の資格情報マネージャー経由）、公開 API（認証なし） | GitHub MCP、`gh` | fetch・push、公開リポジトリの実行履歴とコミットステータスの読み取り。ログ本文、Variables・Secrets の一覧、認証が必要な API は使えない |
| Vercel | なし（デプロイ結果は、GitHub のコミットステータスで間接的に確認） | Vercel MCP、Vercel CLI | — |
| 各サービスの管理画面 | アプリ内のブラウザ（ユーザーのログインが必要） | — | ユーザーがログインした画面の読み取り |

- 不要なインストールはしていない。
- 認証が必要な操作は、ユーザーが画面でログインする。パスワードやトークンをチャットに貼らない。

### 2026-11-15：外部設定の参照先の確認

ユーザーがアプリ内のブラウザで各サービスにログインし、Claude Code が画面を読み取った。設定は変更していない。秘密情報の値は開いていない。

| 設定 | 値・状態 | 使っている URL |
| --- | --- | --- |
| GitHub Actions の Variables：`BAMBI_APP_URL` | `https://bistro-bambi-stamp.vercel.app` | **旧 URL** |
| GitHub Actions の Secrets：`HUNTER_REFRESH_SECRET` | 登録済み。最終更新 2026-11-10 12:26 UTC（日本時間 21:26） | — |
| GitHub の Environment ごとの変数・シークレット | なし | — |
| Vercel：`HUNTER_REFRESH_SECRET` | 登録済み（Production）。Nov 10 | — |
| Vercel：そのほかの環境変数 | 次の10個が All Environments に登録済み。コードが参照する11個がすべて揃っている | — |
| Discord「Stamp Bot」の Interactions Endpoint URL | `https://bistro-bambi-stamp.vercel.app/api/discord/stamp/interactions` | **旧 URL** |
| Discord「Bingo Bot」の Interactions Endpoint URL | `https://bistro-bambi-stamp.vercel.app/api/discord/bingo/interactions` | **旧 URL** |

- Vercel の All Environments に登録されている10個
  - `ADMIN_PASSWORD`、`SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `DISCORD_STAMP_*` の3個、`DISCORD_BINGO_*` の3個
- **[確認済]** 外部からアプリを呼ぶ設定（GitHub Actions と Discord の2つ）は、すべて**旧 URL** を使っている。旧ドメインは同じ Vercel プロジェクトの Production につながっていて動作しているため、変更していない。
- **重要**：旧 URL `bistro-bambi-stamp.vercel.app` を削除・リダイレクトすると、Discord のスタンプとビンゴ、画像の定期更新が止まる。旧 URL を廃止する場合は、先にこの3か所を新 URL に切り替えること。
- **[推測]** GitHub のシークレットの更新（11/10 21:26）の直後に、実行 #1 の2回目の試行（21:33）が成功している。1回目の試行はシークレットが未登録で失敗し、登録後に再実行した可能性がある（未確認）。

### 2026-11-15：ローカルサーバーの停止

- **[確認済]** 動作確認のために `npm run start`（port 3000）で起動していたローカルサーバーを、ユーザーの指示で停止した。止めたのは、このセッションで起動したプロセス（`next start -p 3000`）だけ。port 3000 が解放されたことを確認した。

### 2026-11-15：コードレビュー指摘への対応（優先1〜4）

| コミット | 内容 | 状態 |
| --- | --- | --- |
| 3107885 | 段階0の復元 SQL を作り直し、PGlite の回帰テストを追加（優先1） | 反映済み |
| 07f5c0b | 画像更新 API に管理セッションを必須化、GET 削除、Discord は生成関数を直接呼ぶ（優先2） | 反映済み |
| b44676b | 予備の定期実行の判定を「JST の更新日の枠以降の成功」に変更、確認手順を整理（優先3） | 反映済み |
| 99309d0 | 給与系 API の問い合わせ回数を削減、`Server-Timing` を追加（優先4） | 反映済み |
| f9b1d00 | `vercel.json` で関数リージョンを `sin1` に固定（優先4） | 反映済み |
| a3a91d9 | RLS 段階1の手順3（月次リセット・従業員） | 反映済み |

- **[確認済]** ビルド成功。各 API は未ログイン 401、別オリジンの POST 403（共通の `requireAdmin`）、不正な入力 400。移行した画面は、ローカルで DB と件数・金額・順序が一致。
- pg_net は権限を変更していない（「9. 未解決事項」の6）。

**本番反映（2026-11-15 14:15 JST、ユーザー承認のうえ push。先頭 c6c162d、Vercel デプロイ success）**

- ダッシュボードの設定変更はしていない。ただし `vercel.json` のデプロイにより、関数の実行リージョンは `iad1` → `sin1` に変わった（応答ヘッダー `x-vercel-id` が `hnd1::sin1`。新旧両 URL）。
- **[確認済]** 新旧両 URL で、給与履歴・月次給与・単価ルール・従業員・月次リセットの5画面が表示され、エラーなし。各画面の通信は `/api/admin-*` の1回だけ。
- **[確認済]** 画像更新 API は未ログインで POST 401・GET 405（新旧両 URL）。署名なしの Discord 呼び出しは 401。ログイン済みでも不正な user_id は 400。管理 API の不正な view・action・年月、他店舗の従業員の保存は 400。
- **[確認済]** 速度（本番、ログイン済み、5回の中央値。括弧内は反映前）：店舗情報 226ms（1.4〜2.1秒）、単価ルール 303ms（2.5〜3.7秒）、月次給与 291ms、給与履歴 224ms、従業員 277ms、リセット前チェック 244ms。`Server-Timing` のサーバー内の合計は 37〜106ms。
- **[確認済]** データ：給与履歴 51件、単価ルール 2セット・6明細、2026年10月の月次給与（期間3・明細57・集計2・入力3・支給額合計）、従業員24人・在籍カード24枚（出勤数合計68）が DB と一致。
- **[確認済・承認済の書き込み]** 画像の再生成を各1件（スタンプ user 3、ビンゴ user 1、従業員カード user 26）。200 で成功し、Storage の `live/3.png`・`live-bingo/1.png`・`live-staff/26.png` の更新時刻が実行時刻になった（サイズは前と同じ）。スタンプ数・開いたマス・出勤数・出退勤の記録は変わっていない。公開 URL の `Last-Modified` は CDN のキャッシュにより古い値のまま返ることがある（従来からの挙動）。
- **[確認済・承認済の書き込み]** 従業員 user 26 を、直前に取得した現在値のまま保存（200）。内容（氏名・在籍・等級・退職日・メモ・店舗・コード、users の表示名・状態）は前後で同一。変わったのは `employee_profiles.updated_at` と `users.updated_at` だけ（トリガー `set_updated_at`）。監査の記録はない。
  - 反映前に一度、この保存が実行されなかったのは、Claude Code のツールの権限確認（自動モード）による停止で、アプリや DB が拒否したものではない。
- **[未確認]** Discord からの画像更新（署名検証の後に生成関数を直接呼ぶ経路）。月次リセットの実行（テスト目的では実行しない）。19:50 の初回 pg_cron 実行（2026-11-15。反映時点では実行前）。

### 2026-11-15：Bambi01 の出勤数が増えなかった件（調査・対策）

- **報告**：14:20 ごろ、Discord で Bambi01（user 26、カード 24、店舗 1）が出勤。返信は「出勤しました」だが、現在の出勤数は 0 / 15、画像も 0。
- **[確認済] 記録**：14:20:30 に出勤イベント（`work`、+1、work_date 2026-11-15）と勤務セッション（193）が作られた。セッションは 14:20:45 に退勤で閉じている（勤務 0 分）。カードの表示数は 0。
- **仕組み**：Discord の出勤は `staff_clock_in`（セッション作成＋出勤イベント +1）の後、カードの表示数を「その月の出勤イベントの合計」に合わせる（`syncStaffCardVisualCountToMonthly`）。画像はその後に作る。返信と画像は、この合計の値を表示している。
- **原因**：11月の合計が -1 から始まっていた。2026-11-01 06:33（JST）に、管理画面の従業員カードで「-1」を押し、10月から繰り越した表示（10月の出勤1回、10月分の月次リセットは未実行）を 1→0 にした。この減算は、出勤履歴に `adjust_minus -1`（event 1054、work_date 2026-11-01）として記録され、11月の出勤数に入った。そのため 11/15 の出勤 +1 と相殺され、合計 0 になった。
  - 出勤の加算は失敗していない。別のカード・店舗は参照していない。画像キャッシュの問題でもない。
  - **今回の変更による不具合ではない**（c6c162d までの Discord 側の変更は画像生成の呼び出し方だけで、出勤数の計算は変えていない）。同じパターンの減算は、11月では Bambi01 の1件だけ。
  - 給与：11月前半の給与明細は未作成のため、まだ影響していない。このまま作成すると、Bambi01 の前半の出勤数が 0 になる。
- **再発防止（本番反映済み、2026-11-15）**
  - 更新側：`record_staff_attendance_event`（出勤履歴を書き込む唯一の RPC）で、負の amount はその月（work_date の暦月）の合計が 0 未満になる場合に拒否する。従業員×月の advisory lock で、同時の減算でも確認と書き込みが食い違わない。正の amount と 0（出勤・修正・リセットの記録）は従来どおり。マイグレーション `staff_attendance_negative_guard`、SQL と戻し方は `docs/ops/staff-attendance-negative-guard.sql`、回帰テストは `tools/tests/staff-attendance-guard/`（PGlite、10件 PASS。同時実行は PGlite では検証できない）。
  - 画面：従業員カードの +1 / -1 は、先に出勤履歴を記録し、成功したときだけカードを変える。-1 が拒否される場合は、「リセット」はカードの表示数だけを 0 にする操作で出勤履歴（給与）は変えず、次の出勤時の同期で表示は今月の出勤履歴の合計に戻る、と区別して案内する（256708b）。
- **補正（本番、2026-11-15 14:3x JST、ユーザー承認済み）**
  - 1つのトランザクションで、従業員×11月の advisory lock、event 1054 とカード 24 の行ロックを取り、前提（event 1054 が 11/01・-1・adjust_minus のまま、補正が未実施、カード 24 が user 26 のもの）を確認してから実行。
  - 追加：event **1110**（work_date 2026-11-01、`adjust_plus` +1、source `data_fix`、note は `[補正 event 1054]` で始まり理由を記載）。event 1054 は残している。
  - カード 24 の表示数を 0→1（stamp_histories **1314**、理由に補正記録の ID）。画像 `live-staff/26.png` を作り直した（固定 URL は同じ）。
  - 結果：11月の合計 0→1（前半 11/1〜11/15 の合計も 1）、カード 1 / 15。勤務セッション（193）と出退勤時刻は変更していない。11月前半の給与明細は未作成のまま、11月の給与明細の更新もない。
  - 同じ補正の再実行は、前提確認（`[補正 event 1054]` の記録あり）で止まることを確認した。
  - **戻し方**（この補正だけを取り消す。後続の操作は残る）：`record_staff_attendance_event(26, '2026-11-01', -1, 'adjust_minus', 'data_fix', '[取消 補正 event 1110] 理由…', '<実行者>')` で相殺記録を追加し、カード 24 の表示数を11月の出勤履歴の合計に合わせて stamp_histories に記録してから、画像を作り直す。補正の行は削除しない。
- **解消（2026-11-15、ユーザー確認）**：Discord で Bambi01 の表示が出勤数 1 / 15、カード画像は1個目まで反映。Discord の「修正」で勤務時間を 14:30〜14:50（20分）に修正し、状態は「修正済み」。修正後の数値と画像の表示も確認済み。
  - 確認した範囲：Bambi01 の、補正後の表示と、Discord の勤務時間修正（修正後の数値・画像）。通常の出勤・退勤の全パターン（新規の出勤での加算など）を検証済みとはしていない。追加のデータ補正は不要（ユーザー判断）。
- **[ユーザー判断で確認省略]** ビンゴの Discord 操作（使用予定がないため。確認済みにはしない）。

### 2026-11-15：画像パズルの問題番号とピースの対応を変更できるようにした（ローカル）

- **仕組み**：`layout.slots` の並び順が問題番号（1〜ピース数）。各要素の `id`（達成記録 `marked_slots` が参照）と `label`（お題の文章）は問題に属する。ピースの形は、自動分割は `points`、ZIP 取り込みは `asset_id`。
- **番号の変更**：`swapPuzzlePieces`（`lib/puzzle-geometry.js`）が、2つの問題の間でピースの形（`points`・`asset_id`）だけを交換する。id・お題・並び・頂点・背景画像は変えない。「問題3 達成済み」の記録はそのままで、問題3 に割り当てたピースが開く。編集画面・試し表示・担当者画面・印刷／公開画像はすべて `slots` の同じ並びを使うため、同じ対応になる。番号は常に 1〜ピース数で、重複・欠番は起きない。
- **画面**：イベントの「画像パズルの準備」に「ピースと問題番号の対応」を追加。ピースを選び（画像のクリックでも可。選択中は橙色で強調）、「対応する問題番号」を選ぶと、その番号のピースと入れ替わる。保存は既存の「設定と配置を保存」。
- **制限**：カード発行後は、既存の規則（`bambi_event_action_v2` がカード発行後の配置変更を拒否）により、番号の対応も変更できない。2026-11-15 時点で対象の「APの真似っこしちゃAP」は準備中・カード0枚のため変更できる。
- **DB の変更なし**（既存の配置設定 `layout` の中で完結。`bambi_validate_layout` の条件も満たす）。
- **[確認済・ローカル]** 単体テスト（`tools/tests/puzzle-numbering.test.mjs`、6件）：3と4の交換、複数回の交換、達成記録の追従、往復で元に戻ること、ZIP 取り込み、範囲外と未設定の互換。画面で「ピース4 → 問題3」を操作し、番号3・4の形だけが入れ替わり、お題の文章は変わらず、試し表示で問題3 を達成にすると元の「4」の位置のピースだけが開くことを確認（保存はしていない）。
- **本番反映（2026-11-15、d0b91fb、デプロイ成功）**：本番の編集画面で、準備中の「APの真似っこしちゃAP」に「ピースと問題番号の対応」が表示され操作できること、カード発行済みの「てｓｔ」では欄が無効になり「カード発行後は変更できません。」と表示されること（設定欄を開いたとき）を確認した。本番イベントの番号の割り当てと保存はユーザーが行う。
- **[未確認]** 本番での保存・再読込、担当者画面・印刷画像・公開画像での表示。画像の生成処理は変更しておらず `slots` の id と形をそのまま使うが、共通のデータを使うことを理由に実機確認済みとはしない。

### 2026-11-15：RLS 段階1 手順7〜9の本番反映と、段階2の準備

- **本番反映**：`8e3e8df`（スタンプ）・`262ce08`（ビンゴ）・`16e901b`（`lib/supabase.js` の削除）を 20:39 JST に push（ユーザー承認済み）。19:50 の定期更新の完了後で、出勤中の従業員がいないことを DB で確認してから反映した。Vercel のデプロイは成功（コミットステータス success）。
- **[確認済]** 未ログインでの拒否：新旧 URL とも、`/api/admin-stamp`・`/api/admin-bingo`・`/api/admin-context` の GET と POST が 401、`/admin/bingo` はログイン画面へ転送。別オリジンを名乗る POST も、未ログインのため 401（ログイン確認が先に行われる）。
- **ログイン済みの別オリジン POST**：403 になることは、手順1〜3の時点でローカルで確認済み（localhost:3001 の一時ページから。共通の `requireAdmin` の同一オリジン確認）。スタンプ・ビンゴの API も同じ `requireAdmin(request, { write: true })` を使う（コードで確認）。本番では再確認していない（ユーザー判断で再検証不要）。
- **[表示・読み取り確認済]** ログイン後の本番（新 URL、2026-11-15 21時台）：移行した14画面をすべて開き、どの画面も「読み込み中です...」のまま止まらず、エラー表示なし。データ取得の API はすべて 200、Supabase の REST・認証・GraphQL への直接通信は0件。
  - 照合：スタンプ顧客51人・カード19枚・スタンプ合計0、ビンゴ顧客51人・カード3枚・マス25・商品番号1件、アーカイブ0件、従業員24人（画面の一覧は表示条件により17行）、給与の11月の期間（id 153）が DB と一致。
  - スタンプ・ビンゴのカードの検索ボタンは、押すとカード画像を作り直す（Storage への書き込み）ため押していない。代わりに読み取りの API（`view=card`）を直接呼び、DB と一致することと、存在しないカード番号が 400 になることを確認した。
  - ビンゴ管理（`/admin/bingo`）は、表示中のブラウザ枠では普通に表示され、商品番号の取得（200）まで進んだ。
- **[表示・読み取り確認済]** 旧 URL（`bistro-bambi-stamp.vercel.app`）でもログイン後に同じ14画面を確認：止まる画面・エラー表示なし、データ取得の API はすべて 200、Supabase への直接通信0件。件数（スタンプ顧客51人・カード19枚、ビンゴ3枚・25マス、従業員の一覧17行、牧場13行、給与履歴・月次給与28行）は新 URL と同じ。
- **[未確認]** スタンプ・ビンゴ・従業員カード・牧場・給与の書き込み（加算・リセット・発行・保存など）は実行していない。ビンゴの利用者による確認は省略（ユーザー判断）で、機能正常の確認に含めない。
- **ビンゴ管理の「読み込み中です...」**：確認用の非表示ブラウザ（`requestAnimationFrame` が動かない）に起因する**可能性が高い**。ログイン後、表示中のブラウザ枠では表示と商品番号の取得まで確認できた（詳細は `docs/ops/rls-stage1-plan.md`）。コードの変更なし。未ログインで初期化まで進んだことは、ログイン後の画面が正常に動くことの確認にはならない。ログインした状態での本番の表示は未確認。ビンゴの利用者による確認は省略（ユーザー判断）で、機能が正常であることの確認には含めない。
- **秘密キーの露出（是正対象）**：調査中に、別プロジェクト play の `.env.local` にある秘密キー（`sb_secret_` 形式。このアプリのローカル設定と同じ値。本番も同じ可能性が高いが、Vercel の設定値との一致は未確認）の値がツール出力に表示された。値は資料・Git に残していない。交換の手順と影響は `docs/ops/rls-stage1-plan.md` の「秘密キーの露出」。**2026-11-15 に交換済み**：新しい秘密キーを Vercel（全環境）と手元の `.env.local` に設定し、本番の再デプロイ後に新しいキーでの動作を確認してから、旧キーを Supabase で削除した（旧キーは 401）。詳細は同じ資料。段階2（anon の権限削除）は別作業として保留中。
- **別プロジェクト play**：同じ Supabase プロジェクトを参照していた。ユーザー判断（使用終了）で、Vercel の play プロジェクト、Storage の `play-images` バケット、ローカルの `GTA5\play` フォルダを削除した（詳細は同じ資料の「別プロジェクト play」）。GitHub リポジトリ・共有 DB・他のバケット・バックアップフォルダは残した。他のサービスで公開キーを使っているかは未確認のまま。
- **段階2の準備**（本番の権限は変更していない）：`docs/ops/rls-stage2.sql`、`docs/ops/rls-stage2-restore.sql`、回帰テスト `tools/tests/rls-stage2/`（16/16 PASS）、確認スクリプト `tools/rls-stage2-anon-check.mjs`。適用前の状態として、確認スクリプトを本番に実行した（読み取りと、存在しない行への更新・削除だけ。91件中、許可82・判定不能9）。
- **管理パスワード**：推測されやすいため、より長いものへの変更を推奨（ユーザー判断。値やその手がかりは記録しない）。変更場所は Vercel の環境変数 `ADMIN_PASSWORD`（Production。ローカルで使う場合は `.env.local` も）。反映には再デプロイが必要。管理セッションの署名にも同じ値を使っている（`lib/event-session.js`）ため、反映後は新旧 URL とも、ログイン中のセッションがすべて無効になり、新しいパスワードで再ログインが必要。

### 2026-11-15：RLS 段階2の本番適用と、ハンティング画面のエラー表示の改良（引き継ぎ）

**本番に反映したもの**
| 種類 | 内容 | コミット・識別子 |
| --- | --- | --- |
| アプリ（画面） | ハンティング画面のエラー表示の改良 | `8246d97` |
| 資料・段階2の SQL・ツール | 段階2の SQL・戻し方・確認クエリ・回帰テスト・確認スクリプト、鍵交換・play 削除・本番確認の記録 | `f21dcb8`〜`df344af`（10件）、`f5648fd`（適用結果の記録） |
| 本番 DB | RLS 段階2（anon・authenticated の権限剥奪など） | マイグレーション `20261115144805 rls_stage2_revoke_anon_authenticated` |

- push 先：`origin/main`（GitHub `gydk858/stgr-fv-app`）。push は Vercel の本番デプロイを伴い（デプロイ成功）、本番 DB への適用は別の操作として行った。
- **ハンティング画面のエラー表示の改良（`8246d97`）**
  - 経緯：#3 の買取が 11/14 に保存されていなかった件の調査で、保存のエラー（「別の画面で更新されています」）が画面上部にしか出ず、スクロールしないと気づかないことが分かった。ユーザーから改良の依頼があり、ローカルで確認した後、「段階2と併せて push」の承認を得て反映した。
  - 変更内容：画面上部のエラーを、スクロールしても見える固定表示にし、閉じるボタンを付けた。買取・サイズ記録の保存に失敗したとき、押したボタンのすぐ上にも同じエラーを表示する。「別の画面で更新されています」のときは、入力内容が残っていることと、控えてから再読込する手順を表示する。保存の処理・データは変えていない（`app/admin/hunters/` の4ファイル）。
  - 確認：ローカルで、保存の通信をブラウザ内で偽のエラー応答に差し替えて表示を確認（本番 DB には送っていない）。本番では、デプロイ後にハンティング画面の API が 200 を返すことだけを確認。実際のエラー時の表示は通常利用の中で確認する。
- **段階2**：適用前の状態は `ops.acl_snapshot_stage2`（199行・1回分、復元用）に保存。結果・確認内容・未確認事項は `docs/ops/rls-stage1-plan.md` の「段階2の本番適用」。戻し方は `docs/ops/rls-stage2-restore.sql`（未実行）。
- **専用ページの読み取り確認**：`/hunter-print`・`/hunter-user`（ページ・本人データ・カード画像）・`/event-card` を、新旧 URL で確認済み（トークンは表示・記録していない。詳細は `docs/ops/rls-stage1-plan.md`）。
- **次回作業時の確認事項**：11/16 19:50 の定期更新（新しい秘密キー・段階2の後で初回）と予備実行のスキップ。自動では確認しない。
- **通常利用の中で確認すること**：Discord（スタンプ・ビンゴ・出退勤）・ハンター・イベントの書き込み（テスト目的の増減はしない）。

### 2026-11-16：設定の整理とユーザーの判断

- **管理パスワード**：ユーザー判断で変更しない。ゲームの管理画面で、従業員が勝手にログインできなければよい（本来はパスワード不要でもよいくらい）。以前の「変更を推奨」は取り下げ。
- **Vercel の `NEXT_PUBLIC_SUPABASE_ANON_KEY` を削除**（2026-11-16、ユーザー承認済み）。アプリのコード（`app/`・`components/`・`lib/`）は参照しておらず、手順9（`16e901b`）以降は使われていない。残る Vercel の環境変数は10個。手元の `.env.local` には、確認スクリプト `tools/rls-stage2-anon-check.mjs` 用に残している。
- **旧形式（JWT）の API キー（anon・service_role）を無効化**（2026-11-16 14:4x JST、ユーザー承認済み）。API ログ（2026-11-01〜16）で旧形式のキーの利用は0件。無効化の画面で「連携アプリが動かなくなる可能性」の警告が出たため確認し、認可済みの OAuth アプリは「ChatGPT」（2026-11-07、ユーザーは「使っていない」と回答）と「Claude（Anthropic）」（Claude Code の Supabase 接続）だった。無効化後、管理 API の読み取り 200、未ログイン 401、公開画像 200、公開キーの読み取り33件は拒否、Supabase 接続（SQL）も動作することを確認。管理画面の「Re-enable JWT-based API keys」で元に戻せる。
  - **限界**：Supabase の説明では、無効化は旧形式のキーを `apikey` ヘッダーで使う場合だけで、旧形式のキーは JWT としては有効なまま。完全に無効にするには、JWT の署名鍵（JWT Keys）の切り替えが別途必要（認証ユーザーは0人のため、ログインへの影響はない見込み）。旧形式の service_role キーが漏れた形跡は見つかっていない。
- **ChatGPT の OAuth 連携を取り消し**（2026-11-16、ユーザー承認済み。ユーザーは使っていないと回答）。Supabase の組織設定 → OAuth Apps の「Authorized apps」から削除し、残りは「Claude（Anthropic）」だけ。プロジェクトの秘密キーは `stgr_fv_app_20261115` の1つだけで、ChatGPT 用のキーはない。取り消し後も Claude Code の Supabase 接続は動作。元に戻すには、組織の管理者が改めて認可する必要がある。
- **運用ルール2つ**（public に関数を作るときの権限の取り消し、古いデプロイに戻すときは再デプロイで戻す）：ユーザーは作業のイメージがまだ持てていないため、該当する作業を指示されたときは、必ず手順を説明して確認してから行う。

## 12. 今後の開発手順

1. **依頼内容の確認**：目的・対象・制約を確認する。分からない点は推測せず質問する。
2. **修正**：依頼の範囲だけを変更する（`CLAUDE.md` の運用方針に従う）。
3. **動作確認・ビルド**：変更に応じて `npm run build`、ローカルでの起動（`npm run start` または `npm run dev`）、画面や API の確認を行う。DB・Storage に書き込む確認は、依頼がない限り行わない。
4. **変更内容の報告**：「実施した結果」と「未確認事項」を分けて報告する。
5. **commit・push**：本番に反映するよう依頼があったときに行う。push の前に `git fetch origin` で分岐がないことを確認する。force push はしない。
6. **デプロイ結果の確認**：**`main` への push で本番（Vercel Production）の自動デプロイが起動する**。現時点では Claude Code から Vercel を操作できない。デプロイ結果は、GitHub の公開 API でコミットステータス（context `Vercel`）を確認するか、ユーザーが Vercel の管理画面で確認する。
