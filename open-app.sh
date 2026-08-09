#!/usr/bin/env bash
# middleman を「ダッシュボード窓」で開く（chromeless・横長）。
# Braveはアプリ窓の前回サイズを記憶するので、開いた後に横長へ強制リサイズする。
URL="${1:-http://localhost:8790}"
open -na "Brave Browser" --args --app="$URL" --window-size=1180,780
sleep 1.3
# 直前に前面化した窓（=いま開いた middleman）を横長に。要アクセシビリティ許可。
osascript <<'OSA' 2>/dev/null || true
tell application "System Events"
  tell (first application process whose frontmost is true)
    set position of front window to {110, 90}
    set size of front window to {1180, 780}
  end tell
end tell
OSA
