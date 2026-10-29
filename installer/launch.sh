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
# BUMP_STUB_API=1  ← stubがこの名札を見て「渡してよい本体か」を判断する。
# 名札が無い古い本体に渡すと、HEREの求め方が違って空になり rsync "/" を撃つ（2026-08-16の実測）。
# 同梱コードの場所。stub から渡される（stub経由でない直接実行にも耐えるようフォールバック）。
HERE="${BUMP_BUNDLE_REPO:-}"
[ -n "$HERE" ] || HERE="$(cd "$(dirname "$0")/../Resources/repo" 2>/dev/null && pwd || true)"
[ -n "$HERE" ] || HERE="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd || true)"
# HEREが不正なまま進むと rsync の転送元が壊れる。ここで必ず止める。
if [ -z "$HERE" ] || [ ! -f "$HERE/bin/bump.js" ]; then
  echo "FATAL: 同梱コードの場所を特定できません（HERE=${HERE:-空}）。中止します。"; exit 1
fi
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
# .app から開くと PATH が最小限で、npm（中で node を探す）も claude も見つからない
# （Y.K.報告 2026-10-21: npm ci が黙って失敗し、MCP SDK が弱点ありの旧版のまま残った）。
export PATH="$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.claude/local:$PATH"

# 0.5) 自動更新: GitHubの最新を取れたら、それを導入元に重ねる（人がアプリを開いた時だけ動く）。
# 取れない環境（オフライン・git無し）は同梱版で進む＝更新は付加であって前提ではない。
DEST_SRC="$HERE"   # 検証に使うのは常に同梱側（降ってきた側を信じない）
UPDATED_SHA=""
if command -v git >/dev/null 2>&1 && git ls-remote --heads https://github.com/daiokawa/bump.git >/dev/null 2>&1; then
  rm -rf "$HOME/.bump-latest"
  if git clone -q --depth 1 https://github.com/daiokawa/bump.git "$HOME/.bump-latest" 2>/dev/null; then
    # 署名検証（K.K.の監査 2026-08-16）。降ってきたコードは、いま動いている側に同梱された
    # 公開鍵で検証してから取り込む。通らなければ同梱版のまま進む＝GitHubが乗っ取られても
    # 全員へ同時配布される経路にならない。検証コードと鍵は降ってきた側のものを使わない。
    if "$NODE" "$DEST_SRC/bin/bump.js" verify-release "$HOME/.bump-latest" >/dev/null 2>&1; then
      UPDATED_SHA="$(cd "$HOME/.bump-latest" && git rev-parse --short HEAD)"
      echo "auto-update: 署名を確認して取得 ($UPDATED_SHA)"
    else
      echo "auto-update: 署名を確認できないので取り込みません（同梱版で起動します）"
      rm -rf "$HOME/.bump-latest"
    fi
  fi
fi

# 1) 導入（依存同梱ごとコピー・安定パスへ）
case "$DEST" in "$HOME"/.*-app) rm -rf "$DEST";; esac   # openrsyncのdelete-excluded不動作対策（全入れ替え）
mkdir -p "$DEST" "$RELAY"
rsync -a --exclude .git --exclude /dist --exclude '*.log' --exclude .playwright-mcp --exclude .mcp.json --exclude .DS_Store --exclude '._*' "$HERE/" "$DEST/"
# 最新版が取れていれば、コード部分だけ上に重ねる（node_modulesは同梱を使い、
# 依存が変わっていた時だけ npm ci で揃える。失敗したら同梱のまま＝動くものを壊さない）。
if [ -n "$UPDATED_SHA" ]; then
  if ! cmp -s "$HOME/.bump-latest/package-lock.json" "$DEST/package-lock.json"; then NEED_CI=1; else NEED_CI=""; fi
  rsync -a --exclude .git --exclude node_modules "$HOME/.bump-latest/" "$DEST/"
  if [ -n "$NEED_CI" ]; then
    # 別の場所で揃えてから入れ替える。npm ci は最初に node_modules を消すので、
    # その場で失敗すると同梱の依存まで失う。
    STAGE="$HOME/.bump-app-deps"; rm -rf "$STAGE"; mkdir -p "$STAGE"
    cp "$DEST/package.json" "$DEST/package-lock.json" "$STAGE/"
    if (cd "$STAGE" && npm ci --omit=dev --no-audit --no-fund >>"$LOG" 2>&1); then
      rm -rf "$DEST/node_modules" && mv "$STAGE/node_modules" "$DEST/node_modules" && echo "auto-update: 依存も更新"
    else echo "auto-update: 依存更新に失敗（同梱のまま続行）"; fi
    rm -rf "$STAGE"
  fi
  printf 'アプリ版 %s (%s) auto-updated\n' "$(date '+%Y-%m-%d')" "$UPDATED_SHA" > "$DEST/build.txt"
  rm -rf "$HOME/.bump-latest"
fi
cd "$DEST" || exit 1

# 1.1) 依存が package-lock どおりかを確かめる。食い違っていたら黙らずに知らせる
# （更新に失敗して旧版の依存のまま動き続けるのを、本人が気づける形にする）。
DEP_DRIFT="$("$NODE" -e '
  const fs = require("fs"); const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  const bad = [];
  for (const [k, v] of Object.entries(lock.packages || {})) {
    if (!k.startsWith("node_modules/") || v.dev) continue;
    try { const got = JSON.parse(fs.readFileSync(k + "/package.json", "utf8")).version; if (got !== v.version) bad.push(k.slice(13) + " " + got + "≠" + v.version); }
    catch { if (!v.optional) bad.push(k.slice(13) + " なし"); }
  }
  console.log(bad.slice(0, 3).join(", "));' 2>/dev/null)"
if [ -n "$DEP_DRIFT" ]; then
  echo "deps: package-lock と食い違い: $DEP_DRIFT"
  alert "部品（依存）の更新が済んでいません: ${DEP_DRIFT}。ターミナルで cd ~/.bump-app && npm ci --omit=dev を実行するか、ログ ~/Library/Logs/bump.log を添えて配布者にお知らせください。"
fi

# 1.4) 事故でできた「空の鍵」の救済。壊れた版が移行せずに新しい鍵だけ作った場合、
# ~/.bump は在るが縁がゼロ。フォルダの有無だけで移行をスキップすると、この状態は
# 修正版を開いても直らない（Y.K.指摘 2026-08-14）。縁の実在で見分け、事故鍵は消さず退避する。
if [ -d "$MIDHOME" ] && [ -d "$HOME/.middleman" ]; then
  bump_bonds=$(ls "$MIDHOME"/pairs/*/peer.json 2>/dev/null | wc -l | tr -d ' ')
  old_bonds=$(ls "$HOME/.middleman"/pairs/*/peer.json 2>/dev/null | wc -l | tr -d ' ')
  if [ "$bump_bonds" -eq 0 ] && [ "$old_bonds" -gt 0 ]; then
    mv "$MIDHOME" "$MIDHOME.fresh-$(date +%Y%m%d%H%M%S)"
    echo "rescue: 縁ゼロの $MIDHOME を退避（事故で出来た鍵の可能性）。旧データから移行し直します"
  fi
fi

# 1.5) 旧middlemanからの乗り換え（初回のみ）。鍵と手紙を新パスへ写し、旧常駐を撤去する。
# これが無いと ~/.bump に新しい鍵が生成され、既存テスターが「別人」になる
# （K.S.報告 2026-08-14: 手紙・ペア・検証フラグが引き継がれず、新規申請が飛ぶ）。
if [ ! -d "$MIDHOME" ] && [ -d "$HOME/.middleman" ]; then
  cp -a "$HOME/.middleman" "$MIDHOME"
  [ -d "$HOME/.middleman-hub" ] && [ ! -d "$HUB" ] && cp -a "$HOME/.middleman-hub" "$HUB"
  echo "migrated: ~/.middleman → ${MIDHOME}（旧データは残置・削除しない）"
  # 旧常駐の撤去（放置すると通知の二重化と8790の取り合いになる）
  for L in $(launchctl list 2>/dev/null | awk '$3 ~ /middleman/ && $3 !~ /^application\./ {print $3}'); do
    launchctl bootout "gui/$(id -u)/${L}" >/dev/null 2>&1 && echo "旧launchd停止: ${L}"
  done
  pkill -f "middleman.js daemon" >/dev/null 2>&1 || true
fi

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
# 2つ目以降の中継（並列。送るときは全部に置き、受けるときは全部から取る）。パッケージに焼き込まれた
# 追加分は、手元の一覧がまだ無いときだけ写す（利用者が後で外した中継を開くたびに戻さない）。
if [ -s "$DEST/relays.default" ] && [ ! -f "$MIDHOME/relays.txt" ]; then
  cp "$DEST/relays.default" "$MIDHOME/relays.txt"; echo "relays: 焼き込みの追加中継を登録"
fi
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
# 常駐（画面・通知）は launchd に登録して、ログイン後も自動で立ち上がるようにする。
# 開くたびに登録し直す＝走っているプロセスを新しい本体に入れ替える。
# 止めるのは bump 自身のラベル（chat.bump.app.*）と旧名(middleman)の残骸だけ。利用者が自分で
# 登録した常駐は止めない（Y.K.報告 2026-10-21: 開くたびに外されていた）。その役割は利用者の登録に
# 任せ、再起動だけして新しい本体を読ませる。こちらからは重ねて起動しない（通知の二重化を防ぐ）。
# 検証ポート(MM_PORT指定)では launchd に触らない＝配る側のMacで本番を巻き込まないため。
APP_LA="$HOME/Library/LaunchAgents"
app_plist() { # $1=label $2..=node以降の引数
  local label="$1"; shift
  local args="<string>$NODE</string>"; for a in "$@"; do args="$args<string>$a</string>"; done
  local relay=""; [ -n "$RELAY_URL" ] && relay="<key>MM_RELAY_URL</key><string>$RELAY_URL</string>"
  mkdir -p "$APP_LA"
  cat > "$APP_LA/$label.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>$args</array>
  <key>WorkingDirectory</key><string>$DEST</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$PATH</string>
    <key>BUMP_HOME</key><string>$MIDHOME</string><key>MM_SELF</key><string>$MIDHOME</string>
    <key>MM_RELAY</key><string>$RELAY</string>$relay
  </dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string><key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL
  launchctl bootout "gui/$(id -u)/$label" >/dev/null 2>&1
  local i; for i in 1 2 3 4 5; do   # bootout 直後は前のジョブが消えきらず bootstrap が失敗することがある
    launchctl bootstrap "gui/$(id -u)" "$APP_LA/$label.plist" >/dev/null 2>&1 && { echo "launchd: $label を登録"; return 0; }
    sleep 1
  done
  echo "launchd: $label の登録に失敗。nohup で起動します"; nohup "$NODE" "$@" >>"$LOG" 2>&1 &
}
# 利用者自身の launchd 常駐のうち、役割（web / daemon）を担う plist を返す。
# 読み込み中かどうかでなく plist ファイルで見る（以前の版に外されたままの登録も見つけて戻すため）。
foreign_plist() { # $1=web|daemon
  local pat f; [ "$1" = web ] && pat='server/web\.js' || pat='bump\.js daemon'
  for f in "$APP_LA"/*.plist; do
    [ -f "$f" ] || continue
    case "$(basename "$f")" in chat.bump.app.*|*middleman*) continue;; esac
    grep -q bump "$f" 2>/dev/null || continue
    plutil -extract ProgramArguments json -o - "$f" 2>/dev/null | tr -d '[]"\\' | tr ',' ' ' | grep -Eq "$pat" && { echo "$f"; return; }
  done
}
start_role() { # $1=web|daemon $2=自前ラベル $3..=引数
  local role="$1" label="$2"; shift 2
  local f L; f="$(foreign_plist "$role")"
  if [ -n "$f" ]; then
    launchctl bootout "gui/$(id -u)/$label" >/dev/null 2>&1; rm -f "$APP_LA/$label.plist"
    L="$(plutil -extract Label raw -o - "$f" 2>/dev/null)"
    launchctl bootstrap "gui/$(id -u)" "$f" >/dev/null 2>&1   # 外れていたら戻す（読み込み済みなら何も起きない）
    launchctl kickstart -k "gui/$(id -u)/$L" >/dev/null 2>&1
    echo "launchd: $role は利用者の登録 $L を再起動（こちらからは起動しない）"
  else app_plist "$label" "$@"; fi
}
if [ "$PORT" = "8790" ]; then
  # 旧名(middleman)の常駐は毎回掃く（移行初回が途中で死ぬと撤去だけが永久に漏れる＝K.K.指摘 2026-08-16）。
  # application.* ＝ open経由で起動された「このアプリ自身」のラベルなので除く（2026-08-13）。
  for L in $(launchctl list 2>/dev/null | awk '$3 ~ /middleman/ && $3 !~ /^application\./ {print $3}'); do
    launchctl bootout "gui/$(id -u)/${L}" >/dev/null 2>&1 && echo "launchd stop: ${L} (旧名)"
  done
  # 以前の版が nohup で立てた常駐の片付け。利用者の launchd 常駐は KeepAlive で立ち直る。
  pkill -f "server/web.js $PORT" >/dev/null 2>&1
  pkill -f "bump.js daemon" >/dev/null 2>&1
  pkill -f "middleman.js daemon" >/dev/null 2>&1
  sleep 1
  start_role web chat.bump.app.web "$DEST/server/web.js" "$PORT"
  start_role daemon chat.bump.app.daemon "$DEST/bin/bump.js" daemon --notify osa
else
  pkill -f "server/web.js $PORT" >/dev/null 2>&1; sleep 1
  nohup "$NODE" server/web.js "$PORT" >>"$LOG" 2>&1 &
  echo "daemon: 検証ポートなので触らない"
fi
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do sleep 0.5; alive_http && break; done
alive_http || alert "画面を起動できませんでした。ログを確認してください: $LOG"
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
# BUMP_NO_CONNECT=1 なら申請を出さない。検証で本物の中継へ申請が飛び、配る側の画面に
# テスト用の接続リクエストが並んだ（2026-08-16。実物で起動確認するようにした副作用）。
if [ -n "${BUMP_NO_CONNECT:-}" ]; then
  : > "$HUB/requested"; echo "connect request: 検証モードのため送りません"
fi
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
