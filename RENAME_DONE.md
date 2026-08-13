# 改名の実施記録（middleman → bump）

実施: 2026-08-13 ／ 対象は ~/middleman-oss のみ（運用中の ~/middleman は未変更）。push・公開はしていない。

## 適用した名前
- プロジェクト名・CLI・画面ブランド: **bump**（小文字）
- npmパッケージ名: **bumpd**（素の bump は既存パッケージのため。`bin` フィールドでコマンド名は `bump`）

## 変更した箇所（37ファイル一括＋個別）
- `bin/middleman.js` → `bin/bump.js`（全参照更新・package.json に bin: {bump} 追加）
- `installer/middleman.icns` → `installer/bump.icns`
- MCPツール名: `middleman_engaged/_send/_read` → `bump_engaged/_send/_read`（MCPサーバ名も bump）
- launchdラベル: `chat.middleman.{relay,web,daemon}` → `chat.bump.*`（setup-launchd.sh）
- Bundle ID: `chat.middleman.app` → `chat.bump.app`（Info.plist）
- データディレクトリ既定: `~/.middleman` → `~/.bump`（`~/.bump-app` `~/.bump-hub` も同様）
- 環境変数: `MIDDLEMAN_HOME` → **`BUMP_HOME`**。ただし paths.js は旧名 `MIDDLEMAN_HOME` も併読（旧環境からの乗り換え互換・実測済み）
- 画面: `<title>bump`・ブランド表記 `bu|mp`・つかいかた/通知/CLI usage の文言
- ドキュメント: README（冒頭に旧名と改名理由の注記を追加）・AUDIT・DESIGN・SECURITY・docs/

## 変えていないもの（ワイヤ互換・チェックリストの推奨どおり）
- 暗号スイート名 `mm1-x25519-hkdf-sha256-aes256gcm-ed25519`
- 封筒のkind `mm-connect`・制御レター `application/mm-*`
- 環境変数の `MM_*` 接頭辞（MM_RELAY_URL / MM_SELF / MM_PORT 等）
  - 判断: `mm` は旧名の略ではなく**プロトコル識別子（mm1と同族）として凍結**。変えると既存テスター環境・運用スクリプトと非互換になる割に得るものがない。READMEの注記で説明済み
- `/tmp/mm-*.log` のログ名（同上）

## 検証
- 全js構文チェック・全sh bash -n 通過
- スモークテスト: `BUMP_HOME` で init→engage→send→sync→read 往復成功／`MIDDLEMAN_HOME` でも動作（互換確認）／画面起動 HTTP 200・タイトル bump
- 凍結識別子（mm1/mm-connect/application/mm-）が無傷であることを確認

## 公開時に残る作業
- GitHubリポ名 bump での新規作成とpush（大川さんの号令待ち）
- npm公開するなら bumpd の名前確保
- 商標・ドメインの確認（RENAME_CHECKLIST.md 参照）
