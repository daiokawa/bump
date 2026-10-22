#!/usr/bin/env bash
# 中継を Docker(colima) に閉じ込めて起動する。鍵のある機械に Funnel が刺さっている間の当面の手当て。
# コンテナから見えるのは ~/.bump/relaybox だけ。ポートはホストの 127.0.0.1:8791 にだけ出す。
# 前提: colima start -p bump --cpu 1 --memory 1 --disk 10 --vm-type vz --mount-type virtiofs --mount ~/.bump/relaybox:w
# 使い方: bash installer/relay-docker/run.sh     （launchd の chat.bump.relay は先に止めておく）
# 戻す:   docker rm -f bump-relay && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/chat.bump.relay.plist
set -euo pipefail
export DOCKER_CONTEXT="${DOCKER_CONTEXT:-colima-bump}"   # 専用プロファイル（VMに見せるのも relaybox だけ）
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BOX="${MM_RELAYBOX:-$HOME/.bump/relaybox}"
docker build -q --pull -t bump-relay -f "$REPO/installer/relay-docker/Dockerfile" "$REPO" >/dev/null
docker rm -f bump-relay >/dev/null 2>&1 || true
docker run -d --name bump-relay --restart unless-stopped \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  --memory 128m --pids-limit 64 \
  -p 127.0.0.1:8791:8791 -v "$BOX":/box \
  bump-relay >/dev/null
# ログイン時に専用VMを起こす（コンテナは --restart で後から自動で上がる）
LA="$HOME/Library/LaunchAgents/chat.bump.colima.plist"
cat > "$LA" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>chat.bump.colima</string>
  <key>ProgramArguments</key><array><string>$(command -v colima)</string><string>start</string><string>-p</string><string>bump</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/mm-chat.bump.colima.log</string>
  <key>StandardErrorPath</key><string>/tmp/mm-chat.bump.colima.log</string>
</dict></plist>
PL
echo "bump-relay を起動しました（127.0.0.1:8791 → コンテナ, box=${BOX}）"
