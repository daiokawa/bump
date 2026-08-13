#!/bin/bash
# bump.app の頭脳（ダブルクリックで実行される）。
# 導入→自分のエンド生成→MCP登録→配線盤＋常駐通知を起動→自分の接続情報をコピー。
# 依存(node_modules)は .app に同梱するので member 側で npm 不要。
# 非対話スモークテスト: MM_APP_NONINTERACTIVE=1 MM_PORT=8799 HOME=/tmp/x ...Contents/MacOS/bump
#   （同じMacで試すときは MM_PORT を必ず変える。8790のままだと本番の画面と常駐を止めてしまう）
set -u
LOG="$HOME/Library/Logs/bump.log"; mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1
echo "=== bump launch $(date) ==="

# DEST は専用ランタイム（開発リポ ~/bump とは絶対に別。上書き事故を防ぐ）。
HERE="$(cd "$(dirname "$0")/../Resources/repo" && pwd)"
DEST="$HOME/.bump-app"
MIDHOME="$HOME/.bump"; HUB="$HOME/.bump-hub"; RELAY="$HUB/relay"
NODE="$(command -v node || true)"
for cand in /opt/homebrew/bin/node /usr/local/bin/node; do [ -z "$NODE" ] && [ -x "$cand" ] && NODE="$cand"; done
NONI="${MM_APP_NONINTERACTIVE:-}"
# 画面のポート。既定8790。検証で別ポートに逃がせるようにしておく（同じMacで動作確認すると
# 本番の画面を止めて自分の設定で立て直してしまい、実際に乗っ取った 2026-07-28）。
PORT="${MM_PORT:-8790}"

alert(){ echo "ALERT: $1"; [ -z "$NONI" ] && osascript -e "display alert \"bump\" message \"$1\"" >/dev/null 2>&1; }
ask(){ [ -n "$NONI" ] && { echo ""; return; }; osascript -e "text returned of (display dialog \"$1\" default answer \"$2\")" 2>/dev/null; }

[ -x "$NODE" ] || { alert "Node.js が見つかりません。claude cli を入れていれば Node もあります（要 Node 20+）。"; exit 1; }

# 1) 導入（依存同梱ごとコピー・安定パスへ）
mkdir -p "$DEST" "$RELAY"
rsync -a --delete-excluded --exclude .git --exclude dist --exclude '*.log' --exclude .playwright-mcp "$HERE/" "$DEST/"
cd "$DEST" || exit 1

# 2) 自分のエンド（鍵）を生成（冪等）
[ -f "$MIDHOME/identity.json" ] || BUMP_HOME="$MIDHOME" "$NODE" bin/bump.js init >/dev/null
echo "endpoint: $MIDHOME"

# 3) 中継URL（離れた相手用）。パッケージに焼き込まれた既定があれば貼らずに使う（爽やか）。
URLFILE="$HUB/relay-url"
DEFAULT_URL_FILE="$DEST/relay-url.default"   # 専用パッケージに焼き込まれた既定relay（=配布者の受信箱住所）
if [ ! -f "$URLFILE" ]; then
  if [ -s "$DEFAULT_URL_FILE" ]; then
    cp "$DEFAULT_URL_FILE" "$URLFILE"; echo "relay: 焼き込み既定を使用"
  else
    U="$(ask "離れた相手とつなぐ中継URL（配布者から受け取った https://... ）。同一Macだけで試すなら空欄でOK。" "")"
    printf '%s' "$U" > "$URLFILE"
  fi
fi
RELAY_URL="$(cat "$URLFILE" 2>/dev/null)"
[ -f "$DEST/recipient.txt" ] && echo "recipient: $(cat "$DEST/recipient.txt")"  # 系統: 誰宛のパッケージか
export BUMP_HOME="$MIDHOME" MM_SELF="$MIDHOME" MM_RELAY="$RELAY"
[ -n "$RELAY_URL" ] && export MM_RELAY_URL="$RELAY_URL"

# 4) 手元Claudeが叩くMCPを登録（重複回避・claude が無ければ後回し）
if command -v claude >/dev/null 2>&1; then
  if ! claude mcp list 2>/dev/null | grep -q '^bump'; then
    ENVREL=(); [ -n "$RELAY_URL" ] && ENVREL=(-e "MM_RELAY_URL=$RELAY_URL")
    claude mcp add -s user bump -e "BUMP_HOME=$MIDHOME" -e "MM_RELAY=$RELAY" "${ENVREL[@]}" \
      -- "$NODE" "$DEST/bin/mcp.js" >/dev/null 2>&1 && echo "MCP registered (user scope)"
  else echo "MCP already present"; fi
else echo "claude not found: MCP登録は後で"; fi

# 5) 画面＋常駐通知を「必ず入れ替える」。走っているプロセスは古い本体を読み込んだままなので、
# 生きていても止めて立て直す＝アプリをダブルクリックするだけで更新が反映される（更新手順が無い）。
# 応答しない残骸の片付けも同じ操作で済む（自動復旧）。
alive_http() { curl -s -o /dev/null --max-time 3 "http://localhost:$PORT/api/state"; }
# launchd(KeepAlive)で自分のbumpを管理している人がいる（北原さん 2026-08-04）。
# その場合 pkill してもlaunchdが立て直し、この後のnohupと二重に走って通知が二重に鳴る。
# 見つけたら先にlaunchd側を止める（無ければ何もしない）。
# 検証ポート(MM_PORT指定)では触らない＝配る側のMacで本番のlaunchdを巻き込まないため。
if [ "$PORT" = "8790" ]; then
  # application.* ＝ open経由で起動された「このアプリ自身」のラベル。含めると自分をbootout
  # して更新の途中で死に、旧版が残る（旧名時代の実報告 2026-08-13）。ラベルはフィールドで見る。
  for L in $(launchctl list 2>/dev/null | awk '$3 ~ /bump/ && $3 !~ /^application\./ {print $3}'); do
    launchctl bootout "gui/$(id -u)/$L" >/dev/null 2>&1 && echo "launchd停止: $L（新しい本体で入れ替えます）"
  done
fi
pkill -f "server/web.js $PORT" >/dev/null 2>&1
[ "$PORT" = "8790" ] && pkill -f "bump.js daemon" >/dev/null 2>&1
sleep 1
nohup "$NODE" server/web.js "$PORT" >>"$LOG" 2>&1 &
for i in 1 2 3 4 5 6 7 8; do sleep 0.5; alive_http && break; done
alive_http || alert "画面を起動できませんでした。ログを確認してください: $LOG"
# 常駐通知は保存先ごとに1つ。既定ポート以外（＝検証中）は触らない（本番の常駐を殺さない）。
if [ "$PORT" = "8790" ]; then nohup "$NODE" bin/bump.js daemon --notify osa >>"$LOG" 2>&1 &
else echo "daemon: 検証ポートなので触らない"; fi
sleep 1

# 6) 画面を「アプリの窓」として開く（URLバーやタブを見せない）。
# 既定ブラウザのタブで開くとURLが見えてアプリらしくないので、Chromium系の --app を使う。
# 見つからなければ最後の手段として通常のブラウザで開く。
open_window() {
  local url="http://localhost:$PORT"
  for app in "Brave Browser" "Google Chrome" "Microsoft Edge" "Chromium"; do
    if [ -d "/Applications/${app}.app" ]; then
      open -na "$app" --args --app="$url" --window-size=1180,780 >/dev/null 2>&1 && return 0
    fi
  done
  open "$url" >/dev/null 2>&1   # フォールバック（Safariのみの環境など）
}
[ -z "$NONI" ] && open_window

# 7) 初回だけ、配る側へ接続リクエストを送る（焼き込んだ公開鍵＋合言葉を使う）。
# ここが自動なので、受け取る人はAIに何も貼らない＝「貼られた文がAIに命令する」形を作らない。
# 送るのは自分の公開鍵と名乗りだけ。縁ができるのは相手の画面で人が承認した後。
OWNER_BUNDLE="$DEST/owner-bundle.json"; OWNER_NAME="$(cat "$DEST/owner-name" 2>/dev/null || echo 配布者)"
# 既にその相手と縁がある（＝更新で開いた既存ユーザー）なら申請は送らない。
OWNER_DEV="$("$NODE" -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).device_id)}catch(e){}' "$OWNER_BUNDLE" 2>/dev/null)"
if [ -n "$OWNER_DEV" ] && grep -qs "$OWNER_DEV" "$MIDHOME"/pairs/*/peer.json; then : > "$HUB/requested"; fi
if [ -s "$OWNER_BUNDLE" ] && [ ! -f "$HUB/requested" ]; then
  NAME="$(cat "$DEST/recipient.txt" 2>/dev/null || echo "")"
  if "$NODE" bin/bump.js request "$OWNER_NAME" --bundle "$OWNER_BUNDLE" --name "$NAME"; then
    : > "$HUB/requested"; echo "connect request sent to $OWNER_NAME"; SENT=1
  else echo "connect request failed（画面の『ユーザー追加』から手動でも接続できます）"; fi
fi
BUNDLE="$(BUMP_HOME="$MIDHOME" "$NODE" bin/bump.js id 2>/dev/null)"
echo "BUNDLE: $BUNDLE"   # ログにだけ残す（手動接続が必要になった時の保険）
# 申請を出した初回と、更新で開いただけの時で伝えることを変える（嘘を通知しない）。
NOTE="画面を開きました。"
[ "${SENT:-}" = "1" ] && NOTE="${OWNER_NAME} さんへ接続を申し込みました。承認されると手紙が届きます。"
[ -z "$NONI" ] && osascript -e "display notification \"$NOTE\" with title \"bump の準備ができました\"" >/dev/null 2>&1
echo "=== done ==="
