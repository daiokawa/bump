#!/usr/bin/env bash
# middleman の常駐3点（中継・画面・通知）を launchd に登録する。
# 生成する plist は実行者の $HOME と node の実パスで書かれる（絶対パスの直書きを配らない）。
# 使い方: bash installer/launchd/setup-launchd.sh        解除: bash installer/launchd/setup-launchd.sh remove
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
NODE="$(command -v node || true)"
for p in /opt/homebrew/bin/node /usr/local/bin/node; do [ -z "$NODE" ] && [ -x "$p" ] && NODE="$p"; done
[ -n "$NODE" ] || { echo "Node.js が見つかりません（要 Node 20+）"; exit 1; }
LA="$HOME/Library/LaunchAgents"; mkdir -p "$LA"
PATHV="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if [ "${1:-}" = "remove" ]; then
  for l in relay web daemon; do launchctl bootout "gui/$(id -u)/chat.middleman.$l" 2>/dev/null || true; rm -f "$LA/chat.middleman.$l.plist"; done
  echo "解除しました"; exit 0
fi

plist(){ # $1=label $2..=ProgramArguments（node以降）
  local label="$1"; shift
  local args=""; for a in "$NODE" "$@"; do args="$args<string>$a</string>"; done
  cat > "$LA/$label.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>$args</array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$PATHV</string>
    <key>MM_SELF</key><string>$HOME/.middleman</string>
    <key>MIDDLEMAN_HOME</key><string>$HOME/.middleman</string>
    <key>MM_RELAY</key><string>$HOME/.middleman-hub/relay</string>
    <key>MM_RELAY_URL</key><string>http://127.0.0.1:8791</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/mm-$label.log</string>
  <key>StandardErrorPath</key><string>/tmp/mm-$label.log</string>
</dict></plist>
PL
}
plist chat.middleman.relay  "$REPO/server/relay-server.js" 8791
plist chat.middleman.web    "$REPO/server/web.js" 8790
plist chat.middleman.daemon "$REPO/bin/middleman.js" daemon --notify osa
for l in relay web daemon; do
  launchctl bootout "gui/$(id -u)/chat.middleman.$l" 2>/dev/null || true
done
sleep 1
for l in relay web daemon; do
  launchctl bootstrap "gui/$(id -u)" "$LA/chat.middleman.$l.plist"
done
echo "登録しました（OS再起動後も自動で立ち上がります）: chat.middleman.{relay,web,daemon}"
