# 疑うための道具

bumpが「何を触り、何を外に出し、何を実行するか」を、**主張ではなく自分の目で確かめる**ための手順です。
「安全です」と言われても信じる理由はないので、確かめる手段を置いておきます。所要5分。

コード全体は約3,000行（うち暗号は `lib/crypto.js` の217行だけ）。全部読めます。

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
`pair_id` は 2026-07-27 まで縁の名前をそのまま載せていました（"北原" のような人名が中継に見えた）。ハッシュに変更済みです。
`from`/`to` の匿名化（ランダムな routing_id への差し替え）は**まだ済んでいません**。これは既知の残債で、README にも書いてあります。

## 2. 実行する外部コマンド

```sh
grep -rn "execFile\|spawn(" lib server bin | grep -v node_modules
```

**期待される結果**：呼ぶのは5つだけ。`sudo` は一度も出てきません。

| コマンド | いつ | なぜ |
|---|---|---|
| `tmux` | あなたが「読ませる」を押した時だけ | 手紙をあなたのAIのタブへ渡す |
| `osascript` | 新着時 | macOSの通知バナー（本文は出さない） |
| `ps` | 画面を開いた時 | 起動中のclaudeタブを探す（`ps -axww -o tty,command`） |
| `open` | あなたが「別経路で確認」を押した時だけ | LINE等のアプリを前面に出す |
| `claude -p --allowedTools ''` | 手紙が届いた時 | 届いた文のinjection点検。**ツールを無効化**して呼ぶ |

最後の1つが気になる場合は `lib/guard.js` を読んでください（29行）。渡すのは点検用のプロンプトと手紙の本文だけで、`--allowedTools ''` によりそのClaudeは何も実行できません。

## 3. 書き込む場所

```sh
grep -rn "writeFile\|mkdir\|appendFile\|rm(" lib server bin | grep -v node_modules
```

書き込み先は関数経由に統一されています。実体は3つだけです：

| 場所 | 中身 |
|---|---|
| `~/.bump-app` | コード本体（clone/展開先） |
| `~/.bump` | あなたの鍵・手紙・設定（`root()` が返す先。`BUMP_HOME` で変更可） |
| `~/.bump-hub` | 接続先URLの控え |

**それ以外には書きません。** シェルの起動ファイル（`.zshrc` 等）、既存アプリの設定、システム領域には一切触りません。確かめるなら：

```sh
grep -rn "zshrc\|bash_profile\|LaunchAgents\|/Library/" lib server bin | grep -v node_modules
# → 何も出ないのが期待される結果
```

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

## 5. 届いた手紙が勝手に実行されないこと

これが設計の一線です。読むなら `lib/exchange.js` の `receiveInbox`（受信は復号・署名検証して**保存するだけ**）と、
`server/web.js` の `/api/apply`（あなたが押した時だけ、tmux経由で「外部データ枠」を付けて渡す）。

seed（ソフト配布）も同じで、届いても**展開も実行もしません**（`lib/package.js` の `savePackage` は保存とsha256照合だけ）。

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
