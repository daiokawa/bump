#!/usr/bin/env bash
# 練習相手（codex）を作り直す時だけ手で実行する。普段の up.sh からは外してある
# （実在のテスターがいるので毎回は不要／codex起動でGatekeeperが鳴るため。2026-07-26 棚卸し）。
#
# これは「自分に手紙を投げると自動で返事が来る的」を用意するもの。
# 使い方: bash setup-practice-peer.sh        そのあと下に出るコマンドで常駐応答を起動。
set -euo pipefail
cd "$(dirname "$0")"
SELF="$HOME/.bump"
HUB="$HOME/.bump-hub"; PEER="$HUB/codex"; RELAY="$HUB/relay"
run(){ node bin/bump.js "$@"; }

mkdir -p "$HUB" "$RELAY"
[ -f "$SELF/identity.json" ] || BUMP_HOME="$SELF" run init >/dev/null
[ -f "$PEER/identity.json" ] || BUMP_HOME="$PEER" run init >/dev/null
BUMP_HOME="$SELF" run id > "$HUB/self.json"
BUMP_HOME="$PEER" run id > "$HUB/peer-codex.json"
# 両端で同じ縁の名前 "codex" を使う
BUMP_HOME="$SELF" run engage codex --bundle "$HUB/peer-codex.json" >/dev/null 2>&1 || true
BUMP_HOME="$PEER" run engage codex --bundle "$HUB/self.json" >/dev/null 2>&1 || true
BUMP_HOME="$SELF" run verify codex >/dev/null 2>&1 || true
BUMP_HOME="$PEER" run verify codex >/dev/null 2>&1 || true

cat <<'TXT'
練習相手 codex を用意しました。常駐応答を動かすには:

  BUMP_HOME=~/.bump-hub/codex MM_RELAY_URL=http://127.0.0.1:8791 \
    node bin/bump.js rally codex ~/.bump-hub/relay \
    --engine codex --serve --label codex \
    --persona "あなたはcodex。届いた報連相・依頼に、手元で調べたつもりで具体的に短く答える。" &

止める: pkill -f "bump.js rally"
TXT
