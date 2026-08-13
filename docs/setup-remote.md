# 離れた相手と bump で繋ぐ（Claude CLI 同士・実験手順）

配布者（Claude CLI）⇄ 参加者（Claude CLI）を、目隠し中継サーバ経由で繋ぐ最小手順。
中継は暗号文だけ預かる（中身は読めない）。鍵は各自のMacでローカル生成し、外に出ない。

## 0. 中継サーバを公開（配布者側・1回だけ）
```sh
# 中継サーバを起動（暗号文のstore-and-forward）
node ~/bump/server/relay-server.js 8795

# 公開URLを発行。手元にある道具で（どちらか）:
#  (A) tailscale funnel（配布者自身のtailnet・追加登録不要・推奨）
tailscale funnel 8795
#  (B) ngrok（要 authtoken 一度だけ）
ngrok http 8795
#   → https://... の公開URLが出る。これを相手に伝える＝MM_RELAY_URL。
```
この公開URL＝`MM_RELAY_URL`。中継は暗号文しか見ないので、配布者のMacが中継でも中身は安全。

## 1. 相手側の用意（K.S./Y.K./K.K.・各自1回）
前提: Node 20+、git。
```sh
git clone <bumpのリポ> ~/bump && cd ~/bump && npm install
BUMP_HOME=~/.bump node bin/bump.js init      # 自分の鍵を生成
BUMP_HOME=~/.bump node bin/bump.js id        # 自分の公開bundleを表示 → 配布者へ送る(Chatwork)
```

## 2. お互いを engage（bundleを帯域外で交換＝Chatwork）
- 配布者も `node bin/bump.js id` の出力を相手へ、相手の出力を配布者へ（Chatworkで往復）。
- 受け取った相手のbundleをファイルに保存し、両者が engage（pair名は共通、例 `okawa-sugita`）:
```sh
BUMP_HOME=~/.bump node bin/bump.js engage okawa-sugita --bundle ./peer.json
```
- 任意で safety number を Chatwork で読み合わせ、一致したら `verify`（中間者ゼロの格上げ）:
```sh
BUMP_HOME=~/.bump node bin/bump.js safety okawa-sugita   # 数字を突合
BUMP_HOME=~/.bump node bin/bump.js verify okawa-sugita
```

## 3. 置き手紙をやり取り（MM_RELAY_URL＝配布者の公開URL）
```sh
export MM_RELAY_URL=https://xxxxx.trycloudflare.com
export BUMP_HOME=~/.bump
# 送る → 中継へ投函
node bin/bump.js send okawa-sugita "現場A、基礎完了しました。写真は別途。"
node bin/bump.js sync okawa-sugita x        # push（MM_RELAY_URLがあればHTTP中継）
# 受け取る（相手が空いたときに）
node bin/bump.js sync okawa-sugita x        # pull＋復号＋点検
node bin/bump.js read okawa-sugita          # suspiciousチェック済みで表示
```
- 手元Claudeに任せるなら、MCP（`bin/mcp.js`）を `claude mcp add` で載せ、「◯○さんに置き手紙して」「届いた置き手紙を点検して読んで」と頼むだけ。

## メモ
- 非同期・郵便：相手がbusyでも詰まらない。「空いたら読んで返す」。
- 中継が落ちても内容は失われない設計（TTL内・カーソル方式）。可用性は実験段では中継Mac依存。
- 近く強化：routing_id を device_id から 256bit ランダムへ（中継からの相関を断つ・codex推奨）。
