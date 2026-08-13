# フェーズA 完了報告（OSS公開のローカル組み立て）

作業日: 2026-08-09 ／ bumpタブ。**push・公開は行っていない。** 運用中の `~/bump` は未変更。

## 成果物: `~/bump-oss`（新規git・履歴なし・初期コミット1つ）

## 裁定の反映
- ライセンス: **MIT**（LICENSE 追加・Copyright 2026 Koichi Okawa）
- 履歴: **切った**（`git archive` で現在形のみ書き出し→新規 `git init`）
- 謝辞: README に Acknowledgments 節・**イニシャルのみ**（K.K. / Y.K. / Y.Kz. / K.S. / H.S.）

## 🔴 除外（3＋1件）
dist/（元々未追跡）・START_HERE.md・docs/features-telegram.md、および **PUBLIC_READINESS.md 自身**（テスター実名を含む内部文書のため。指示に無かったが同基準で除外。要否は判断ください）

## 🟡 修正（全8件実施）
1. launchd: 絶対パス直書きのplist×3を削除 → `installer/launchd/setup-launchd.sh`（実行者の $HOME / node実パスで生成・remove対応）
2. launch.sh: 「大川さん」→「配布者」／OWNER_NAME既定を一般化
3. make-instructions.sh: リポURLを `MM_REPO_URL` 必須に・一人称と実名を役割名へ
4. docs/setup-remote.md: 配布者/参加者の役割名へ全面置換
5. Intel Mac対応: node探索を `/opt/homebrew` と `/usr/local` の両対応（launch.sh・setup-launchd.sh）
6. lib/notify.js: macOS以外で osascript を no-op に
7. up.sh: 冒頭に「常用はlaunchd・これは実験用」を明記
8. README: fork時の relay-url.local 注意／いらすとや・アイコンの出典／License節

## 新規文書
- SECURITY.md（窓口TBD・AUDIT.mdへの導線つき）
- DESIGN.md にリリース署名（本家の実印・Ed25519）を起草（実装はフェーズB）
- RENAME_CHECKLIST.md（第一候補kasasagi・**ワイヤ互換のため mm1/mm- 接頭辞は変えない**推奨を明記）

## 検証
- 全jsの構文チェック通過・全shの `bash -n` 通過
- 隔離環境でのスモークテスト: init→engage→send→sync→read の往復成功・画面(8790系)起動 HTTP 200
- 残置した「大川さん」はコード内コメントの設計出典のみ（棚卸しで🟢判定済み）。DESIGN.md/AUDIT.md の文脈上の言及も意図して残置

## 未了・引き継ぎ（フェーズB以降）
- リリース署名の実装／配布者ガイド／SECURITY.md の窓口確定／新名称の確定と RENAME_CHECKLIST の実行／GitHubリポ作成とpush（大川さんの指示待ち）
