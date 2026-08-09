#!/usr/bin/env bash
# ※常用は launchd 管理を推奨（installer/launchd/setup-launchd.sh）。このスクリプトは
#   手動での一時起動・実験用。launchd と併用すると二重起動になるので普段は使わない。
# middleman を「使える」状態で一気に立ち上げる（ローカル完結・本番エンド）。
#   - あなたの本番エンド            : ~/.middleman
#   - 相方(codex)エンド＋常駐応答     : ~/.middleman-hub/codex
#   - 目隠しrelay(ローカル)          : ~/.middleman-hub/relay
#   - 配線盤                         : http://localhost:8790
#   - 手元Claudeが叩くMCP           : .mcp.json（MIDDLEMAN_HOME=~/.middleman）
# 使い方: bash up.sh        停止: bash up.sh stop
set -euo pipefail
cd "$(dirname "$0")"
SELF="$HOME/.middleman"
HUB="$HOME/.middleman-hub"; PEER="$HUB/codex"; RELAY="$HUB/relay"
run(){ node bin/middleman.js "$@"; }

stop(){ pkill -f "server/web.js" 2>/dev/null||true; pkill -f "server/relay-server.js" 2>/dev/null||true; pkill -f "middleman.js rally" 2>/dev/null||true; pkill -f "middleman.js daemon" 2>/dev/null||true; echo "停止しました"; }
[ "${1:-}" = "stop" ] && { stop; exit 0; }

# 配達の住所＝Tailscale の自分のIP（取れなければlocalhost）。relayサーバをここで公開する。
TS_IP="$(tailscale ip -4 2>/dev/null | head -1)"
RELAY_URL="http://127.0.0.1:8791"  # relayはloopbackバインド。外はFunnelが127.0.0.1へプロキシ

mkdir -p "$HUB" "$RELAY"
# 自分のエンドだけ用意する（冪等）。練習相手(codex)の初期化・engageは既にできているので
# 毎回やらない。作り直したい時は setup-practice-peer.sh を手で実行（2026-07-26 棚卸し）。
[ -f "$SELF/identity.json" ] || MIDDLEMAN_HOME="$SELF" run init >/dev/null
MIDDLEMAN_HOME="$SELF" run id > "$HUB/self.json"

stop; sleep 0.4
# 目隠し受信箱サーバ（/put・/get）＝Tailscale住所で公開。これが別マシン配達の「間の場所」。
node server/relay-server.js 8791 > /tmp/mm-relaysrv.log 2>&1 &
sleep 0.6
# 配線盤（本番エンド）。MM_RELAY_URL があればHTTP(=Tailscale)経由で配達する。
MM_SELF="$SELF" MM_RELAY_URL="$RELAY_URL" MM_RELAY="$RELAY" node server/web.js 8790 > /tmp/mm-console.log 2>&1 &
# 通知の常駐watcher（新着をmacOS通知で・本文は出さない）
MIDDLEMAN_HOME="$SELF" MM_RELAY_URL="$RELAY_URL" MM_RELAY="$RELAY" node bin/middleman.js daemon --notify osa > /tmp/mm-daemon.log 2>&1 &
sleep 1.5
# 練習相手（codexの常駐応答）は既定で起動しない。実在のテスターがいる今は不要で、
# 毎回codexバイナリが起動してGatekeeperが鳴るため（2026-07-26）。必要なときだけ手で：
#   MIDDLEMAN_HOME=~/.middleman-hub/codex MM_RELAY_URL=http://127.0.0.1:8791 \
#     node bin/middleman.js rally codex ~/.middleman-hub/relay \
#     --engine codex --serve --label codex --persona "あなたはcodex。届いた依頼に短く答える。" &

cat <<TXT
使えるmiddlemanが立ち上がりました。

  配線盤（あなたの接続）:  http://localhost:8790
  あなたのエンド:          ~/.middleman
  相方 codex:              常駐応答中（置き手紙を出すと返します）

手元Claudeから使う（MCP）:
  claude mcp add middleman -- node $(pwd)/bin/mcp.js
  → 「codexに置き手紙して『…』」「届いた置き手紙を点検して読んで」と頼むだけ。

CLIで直に試す:
  MIDDLEMAN_HOME=~/.middleman MM_RELAY=$RELAY node bin/middleman.js send codex "テスト。空いたら返して"
  MIDDLEMAN_HOME=~/.middleman MM_RELAY=$RELAY node bin/middleman.js sync codex $RELAY
  （少し待つ）
  MIDDLEMAN_HOME=~/.middleman MM_RELAY=$RELAY node bin/middleman.js sync codex $RELAY
  MIDDLEMAN_HOME=~/.middleman node bin/middleman.js read codex

停止: bash up.sh stop
TXT

# ※ 2026-08-04 から本番は launchd 管理（chat.middleman.relay / web / daemon）。
#   このスクリプトで手動起動すると launchd と二重になるので、普段は使わない。
#   状態確認: launchctl list | grep chat.middleman
#   再起動:   launchctl kickstart -k gui/$(id -u)/chat.middleman.web など
