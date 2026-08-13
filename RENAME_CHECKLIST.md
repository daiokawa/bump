# 改名チェックリスト（現名 bump → 新名。第一候補: kasasagi）

Ruby製 bump（静的サイトジェネレータ）との衝突回避。確定は大川さん。
kasasagi＝鵲。七夕に翼を連ねて天の川に橋を架ける鳥（鵲橋）。離れた二人の間に橋を渡す道具の名として筋が通る。

## 置換対象（コード・設定）

| 箇所 | 現状 | 備考 |
|---|---|---|
| `package.json` name | bump | npm公開するなら名前空間も要確認 |
| データディレクトリ | `~/.bump` `~/.bump-app` `~/.bump-hub` | **移行スクリプト必須**（既存ユーザーの鍵・手紙を新パスへ。シンボリックリンク経過措置も可） |
| 環境変数 | `BUMP_HOME` `MM_SELF` `MM_RELAY` `MM_RELAY_URL` `MM_BIND` `MM_PORT` `MM_SIGN_ID` `MM_NOTARY_PROFILE` `MM_REPO_URL` `MM_RELAYBOX` `MM_MIN_FREE` | `MM_` 接頭辞を変えるか要判断（略称が新名と合うなら残す手も） |
| MCP登録名 | `bump`（`claude mcp add bump`） | 全ユーザーの再登録が要る |
| MCPツール名 | `bump_engaged` `bump_send` `bump_read` | 手元AIの呼び出し名が変わる |
| launchdラベル | `chat.bump.{relay,web,daemon}` | setup-launchd.sh と AUDIT.md |
| Bundle ID | `chat.bump.app`（installer/Info.plist） | 公証済みアプリの再署名が要る |
| アプリ名 | `bump.app` / `bump-<宛名>.zip` | make-package.sh |
| CLIコマンド表記 | `bump send` 等（bin/bump.js のusage・全ドキュメント） | |
| 暗号スイート名 | `mm1-x25519-...` | **変えない**ことを推奨（ワイヤ互換。mm1は「version 1」の識別子として凍結） |
| 封筒のkind | `mm-connect` / `application/mm-*` | 同上・**変えない**推奨（変えると全既存ユーザーと非互換） |
| UI文言 | console.html のブランド表示・つかいかた画面 | |
| ログ/通知の文言 | 「bump新着」等 | bin/bump.js, lib/notify.js |

## 置換対象（外部・運用）

| 箇所 | 備考 |
|---|---|
| GitHubリポジトリ名 | 新規作成（履歴なし方針） |
| voice-code 連携 | `config.bumpUrl`・`/api/mm/*`・`public/modules/bump.js`（別リポ。互換エイリアス残しが安全） |
| 各テスターのMCP登録・launchd | 移行案内が必要（アプリ版はダブルクリックで済む形にする） |
| 商標 | 新名で出願検討（公開戦略の防衛線） |
| ドメイン | 新名の取得可否を命名前に確認 |

## 変えないもの（明記）

- ワイヤフォーマット（封筒・スイート名 `mm1`・kind接頭辞 `mm-`）＝既存の縁と後方互換を保つ
- `~/.bump` 内のファイル形式
