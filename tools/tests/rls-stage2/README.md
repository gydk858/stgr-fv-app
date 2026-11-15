# 段階2の権限変更 SQL と復元 SQL の回帰テスト

`docs/ops/rls-stage2.sql`（前進）と `docs/ops/rls-stage2-restore.sql`（戻し方）を、
PGlite 上の**合成データ**で通しで実行し、権限・RLS・ポリシー・ビューのオプション・既定の権限を比べる保守用のテスト。
SQL を変えたら必ず実行する。

- 本番の Supabase には接続しない。本番のデータも使わない。
- 依存はこのフォルダの `package.json` だけ（`@electric-sql/pglite` を 0.5.14 に固定）。アプリ本体の `package.json` には入れない。
- `node_modules` はコミットしない（このフォルダの `.gitignore`）。

## 実行方法

```bash
cd tools/tests/rls-stage2
npm ci
npm test
```

## 期待結果

16ケースがすべて `PASS` になり、最後に `16/16 PASS`（終了コード 0）。

| ケース | 内容 |
| --- | --- |
| 1a, 1b | 前進の後、anon・authenticated はテーブル・ビュー・シーケンス・関数を使えない（実際の操作が権限エラー） |
| 1c | service_role は、security_invoker のビュー・SECURITY DEFINER の関数・通常の関数・RLS を有効にしたテーブルを使える |
| 1d | トリガー関数の実行権限がないロールの更新でも、トリガーが動く |
| 1e | service_role・postgres の権限は変わらない |
| 1f | 前進の後に作ったテーブル・関数に、anon の権限・PUBLIC の実行権限が付かない |
| 2 | 前進の再実行は止まり、何も変わらない |
| 3a–3d | 計画表示は永続的なカタログを変えない。復元で変更前と一致。再実行は0件。古い plan_hash は拒否 |
| 4 | 誤った plan_hash・未指定・誤った captured_at・postgres 以外のロールは拒否 |
| 5 | 同じ名前で内容の違うポリシーがあれば block |
| 6 | 段階2の後に削除・作成されたものは info とし、ほかは戻す |
| 7 | 途中の文が失敗すると、全体が取り消される |
| 8 | 段階2の適用前は block |

## この検証の範囲（検証していないこと）

- PGlite は PostgreSQL 18.6。本番は 17.6 で、本番と同じ版では実行していない。
- 合成データは本番の形を小さく再現したもので、本番の全テーブル・全関数ではない。
- PostgREST（API）経由の拒否は、このテストでは確認しない（適用後に `tools/rls-stage2-anon-check.mjs` で確認する）。
