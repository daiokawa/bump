# 疑うための道具

bumpが「何を触り、何を外に出し、何を実行するか」を、**主張ではなく自分の目で確かめる**ための手順です。
「安全です」と言われても信じる理由はないので、確かめる手段を置いておきます。所要5分。

動くコードは約3,200行（bin・lib。画面は別に約3,000行。うち暗号は `lib/crypto.js` の約280行だけ）。全部読めます。

---

## 1. 外に出る通信先

```sh
grep -rn "fetch(" lib server bin | grep -v node_modules
```

**期待される結果**：外部ドメインへのURLは `https://api.chatwork.com/...`（`lib/notify.js`）**だけ**。
これは「新着を自分のChatworkへ通知する」任意機能で、設定しなければ呼ばれません（未設定＝既定）。

relayのURLはコードに埋め込まれていません。あなたが置いた値だけを使います：

```sh
cat ~/.bump-hub/relay-url      # 接続先はこの1行だけ
grep -n "relayUrl\|MM_RELAY_URL" lib/relay.js
```

### relayに何が見えるか（正直に）

送るのは封筒1つで、**中身（本文・プロフィール・連絡先一覧）は暗号化**されています。ただし封筒の**外側には平文の項目があります**。隠していないので、実物で確認してください：

```sh
# 送信待ちの封筒（配達済みは .pushed、受信済みは .done が付く）
ls ~/.bump/pairs/*/outbox/ ~/.bump/pairs/*/inbox/ 2>/dev/null | head
cat ~/.bump/pairs/*/outbox/*.env.json* 2>/dev/null | head -12
```

| 封筒の項目 | 中身 | relayに見えるか |
|---|---|---|
| `ciphertext` `salt` `nonce` `tag` | 本文（AES-256-GCM） | 暗号文のみ |
| `from` `to` | 送信者・受信者の device_id | **見える**（配達に必要） |
| `pair_id` | 縁の識別子 | **見える。ただし名前のハッシュ**（人名は載せない） |
| `suite` `envelope_id` | 暗号方式・封筒の一意ID | 見える |

つまり **relayは「誰から誰へ、いつ、何バイト」を知り得ますが、中身と相手の名前は読めません**。
`pair_id` は 2026-07-27 まで縁の名前をそのまま載せていました（"Y.K." のような人名が中継に見えた）。ハッシュに変更済みです。
`from`/`to` の匿名化（ランダムな routing_id への差し替え）は**まだ済んでいません**。これは既知の残債で、README にも書いてあります。

## 2. 実行する外部コマンド

```sh
grep -rn "execFile\|spawn(" lib server bin | grep -v node_modules
```

**期待される結果**：呼ぶのは下の表のものだけ。`sudo` は一度も出てきません。

| コマンド | いつ | なぜ |
|---|---|---|
| `tmux` | あなたが「読ませる」を押した時だけ | 手紙をあなたのAIのタブへ渡す |
| `osascript` | 新着時 | macOSの通知バナー（本文は出さない） |
| `ps` | 画面を開いた時 | 起動中の手元AI（claude・agy・gemini・codex）のタブを探す（`ps -axww -o tty,command`）。守りの直しより前に起動したままの席も数える |
| `open` | あなたが「別経路で確認」を押した時だけ | LINE等のアプリを前面に出す |
| `claude -p --allowedTools ''` | 手紙が届いた時 | 届いた文のinjection点検。**ツールを無効化**して呼ぶ |
| `node bin/mcp-tools.js` | あなたのAIが bump の道具を呼ぶたび | 道具の中身を、その時点のディスク上の最新コードで動かす（MCP の入口 `bin/mcp.js` が起こす。2026-11-28 から） |
| `git` | 1日1回と、画面の起動時 | 新しい版が出ていないかの確認（`git ls-remote` で GitHub の最新の番号だけを見る）と、動いている版の番号を調べる（`git rev-parse`） |

`claude -p` が気になる場合は `lib/guard.js` を読んでください（29行）。渡すのは点検用のプロンプトと手紙の本文だけで、`--allowedTools ''` によりそのClaudeは何も実行できません。

## 3. 書き込む場所

```sh
grep -rn "writeFile\|mkdir\|appendFile\|rm(" lib server bin installer *.sh | grep -v node_modules
```

書き込み先は関数経由に統一されています。実体は3つだけです：

| 場所 | 中身 |
|---|---|
| `~/.bump-app` | コード本体（clone/展開先） |
| `~/.bump` | あなたの鍵・手紙・設定（`root()` が返す先。`BUMP_HOME` で変更可） |
| `~/.bump-hub` | 接続先URLの控え |

**本体（`lib` `server` `bin`）はそれ以外に書きません。** ただし**導入スクリプト（`installer/`）は別です。** 確かめるなら、本体だけでなく導入側も含めて引いてください：

```sh
grep -rn "zshrc\|bash_profile\|LaunchAgents\|Library/Logs\|claude mcp add" lib server bin installer *.sh | grep -v node_modules
```

**期待される結果**：5行出ます。実際に何かをするのは下の3行だけで、残り2行は文字列です。

| 出てくる場所 | 何をするか |
|---|---|
| `installer/launch.sh:8` | `~/Library/Logs/bump.log` にログを書く |
| `installer/launch.sh:124` | `claude mcp add -s user bump ...` で手元Claudeに道具を登録する |
| `installer/launchd/setup-launchd.sh:10` | `~/Library/LaunchAgents` に常駐設定（画面・relay・通知）を置く |
| `up.sh:53` | 画面に表示する案内文（実行はしない。自分で打つためのコマンド例） |
| `bin/mcp.js:10` | コメント行 |

上の3つは導入時に一度だけ走るもので、`bash up.sh` では実行されません。シェルの起動ファイル（`.zshrc` 等）には触りません。

`~/.bump` の中でも、鍵とトークン（`identity.json`・`release-key.json`・`notify.json`）は本人だけが読める `0600` で書きます。以前の版が `0644` で書いた分は、画面か通知常駐が起動したときに `0600` へ直します。

```sh
stat -f '%Lp %N' ~/.bump/identity.json ~/.bump/notify.json   # → 600
```

> 2026-11-27 まで、つながった相手が手紙の id に `../` を入れて署名すると、受け取った側の `~/.bump` の外に `.msg.json` が書かれる穴がありました（承認待ちの申請の名前でも同じ）。上の「それ以外に書きません」が守れていなかったことになります。いまは手紙の id を英数字と `-` `_` だけに、縁の名前を区切り文字や `..` を含まないものだけに限っています。

> この節の grep は 2026-09-19 まで `lib server bin` だけを見ており、上の3箇所を取りこぼしていました。導入者からの指摘で範囲を広げています。**「何も出ない」を正しい結果として配っていた**ので、それ以前に監査された方は、この版で引き直してください。

## 4. 開くポート

```sh
grep -n "listen(" server/*.js
```

**期待される結果**：`127.0.0.1` に固定（`MM_BIND` で明示的に変えない限り）。外向きには開きません。
動かしながら実測するなら：

```sh
lsof -nP -iTCP -sTCP:LISTEN | grep -E '8790|8791'
# → 127.0.0.1:8790 (画面) / 127.0.0.1:8791 (relay) のみ。0.0.0.0 や * が出たらおかしい
```

画面（8790）は、宛先名（`Host`）が `localhost` か `127.0.0.1` と自分のポートでない要求には何も返しません。DNS rebinding（悪いサイトが自分のドメインを `127.0.0.1` に向け直す手口）で、ブラウザ越しに手紙や通知の設定を読まれないためです。状態を変える要求は、`Origin` のポートまで一致したものだけ通します。

```sh
curl -s -H 'Host: example.com:8790' http://127.0.0.1:8790/api/state   # → {"error":"unexpected host"}
```

## 5. 届いた手紙が勝手に実行されないこと

これが設計の一線です。読むなら `lib/exchange.js` の `receiveInbox`（受信は復号・署名検証して**保存するだけ**）と、
`server/web.js` の `/api/apply`（あなたが押した時だけ、tmux経由で「外部データ枠」を付けて渡す）。

seed（ソフト配布）も同じで、届いても**展開も実行もしません**（`lib/package.js` の `savePackage` は保存とsha256照合だけ）。

届いた手紙に自動で返信するコマンドはありません。以前は検証用の `rally --serve` がありましたが、
「毎回人間が決める」と矛盾する唯一の口だったため、2026-11-28 に取り除きました。

- 確かめるなら：`grep -rn "rally" bin lib server up.sh installer`（何も出ません）

## 6. 隔離して試す

既存の環境に一切触れずに動かせます。

```sh
BUMP_HOME=/tmp/mmtest node bin/bump.js init      # 鍵も手紙も全部 /tmp/mmtest の中
MM_SELF=/tmp/mmtest node server/web.js 8799                # 画面も別ポートで
```

満足したら `rm -rf /tmp/mmtest` で跡形もなく消えます。

## 7. 走っている姿を見る

```sh
# ネットワークの接続先（relay以外に繋いでいないこと）
lsof -nP -i -a -p $(pgrep -f 'server/web.js' | head -1)

# ファイルの書き込み先をリアルタイムに（要sudo・macOS）
sudo fs_usage -w -f filesystem $(pgrep -f 'server/web.js' | head -1) | grep -v ' \.bump'
# → ~/.bump 以外への書き込みが流れないのが期待される結果
```

---

おかしな点を見つけたら教えてください。この文書自体が間違っていたら、それも直します。
