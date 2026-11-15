# 段階0の権限復元 SQL の回帰テスト

`docs/ops/rls-stage0.sql`（段階0の前進側）と `docs/ops/rls-stage0-restore.sql`（戻し方）を、
PGlite 上の**合成データ**で通しで実行し、権限（ACL）と RLS の状態を比べる保守用のテスト。
不要になった試作ファイル（`tools/cleanup-legacy-tests.ps1` の対象）とは別物で、復元 SQL を変えたら必ず実行する。

- 本番の Supabase には接続しない。本番のスナップショットの実データも使わない。
- 依存はこのフォルダの `package.json` だけ（`@electric-sql/pglite` を 0.5.14 に固定）。アプリ本体の `package.json` には入れない。
- `node_modules` はコミットしない（このフォルダの `.gitignore`）。DB はメモリ上にだけ作られ、ファイルは残らない。

## 実行方法

```bash
cd tools/tests/rls-stage0-restore
npm ci
npm test
```

## 期待結果

- 先頭に `PGlite: 0.5.14` と `version(): PostgreSQL 18.6 (PGlite 0.5.14) ...` が出る。
- 22ケースがすべて `PASS` になり、最後に `22/22 PASS` と出る（終了コード 0）。1件でも `FAIL` なら終了コード 1。
- `7h` は「限界の確認」で、段階0で外した権限を後でもう一度 REVOKE した場合は検知できず、復元されることを確かめている（PASS ＝ 限界どおりの挙動）。

## 確認している内容

各ケースで、public のテーブル・ビュー・関数の ACL を「オブジェクト・付与先・権限・付与オプション・付与者」の明細に正規化し、RLS の状態とあわせて比べる。

| ケース | 内容 |
| --- | --- |
| 1 | 変更前 → 段階0 → `ito_*` 削除 → 復元で、ACL と RLS が変更前と一致。計画表示の前後で永続的なカタログが変わらない |
| 2 | PUBLIC・anon・authenticated の権限が異なる |
| 3 | WITH GRANT OPTION のある権限 |
| 4, 4b | ACL が NULL（既定権限）の関数・テーブル |
| 5 | 削除済み：既知の除外（`ito_*`）は info、想定外の欠落は block で何も変えない |
| 6a–6d | 前進 SQL の再実行ガード、スナップショットの重複（未指定は block、captured_at の明示で復元、同じ回の2行は block） |
| 7a–7g | 段階0の後の変更（剥奪・一部の手作業の付与・付与オプション・RLS・未確認のマイグレーション・`ops.acl_snapshot_stage2`）で停止し、何も変えない |
| 7h | 限界の確認（上記） |
| 8 | 復元の再実行：0件で変化なし。古い plan_hash は拒否 |
| 9 | 途中（100件目の GRANT）で失敗させると、1件も残らない |
| 10 | 誤った plan_hash・未指定・postgres 以外のロールは拒否。計画表示を繰り返しても変化なし |
| 11 | 計画表示は `pg_temp` の一時関数だけを作る |

## この検証の範囲（検証していないこと）

- PGlite は PostgreSQL 18.6。本番は PostgreSQL 17.6 で、本番と同じ版では実行していない。
- 確認したのは、postgres ロールで行う GRANT・REVOKE と、ACL 明細・RLS 状態の一致まで。
  合成データの anon・authenticated は属性（ログイン・継承など）を本番と揃えておらず、
  ロール属性が影響しないと言えるのは、この操作と比較の範囲に限る。
- anon・authenticated の実効権限、本番の認証、PostgREST（API）経由のアクセス、Supabase 固有の既定権限・所有者は検証していない。
- 計画の block 0件は「定義した検査条件に当たらなかった」という意味で、復元が無条件に安全であることの保証ではない。
