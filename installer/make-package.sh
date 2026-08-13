#!/usr/bin/env bash
# 相手ごとの「専用パッケージ」を1つ作る。
#   - relay URL（＝配布者=あなたのtailscale受信箱の住所）を焼き込む → テスターは貼らずに即つながる
#   - 宛先ラベルを刻む（recipient.txt）＝系統の種（誰に配ったか）
# 使い方: bash installer/make-package.sh "加賀爪" [relayURL]
#   relayURL 省略時は tailscale の自分のIPから自動生成（http://<ip>:8791）
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

LABEL="${1:?宛先名を指定してください（例: 加賀爪）}"
TS_IP="$(tailscale ip -4 2>/dev/null | head -1)"
# 既定relayはローカルファイル（gitに入れない＝リポジトリ公開時にURLを晒さない）
RELAY_URL="${2:-$(cat installer/relay-url.local 2>/dev/null || echo "http://${TS_IP:-127.0.0.1}:8791")}"
SLUG="$(printf '%s' "$LABEL" | tr ' /:*?"<>|' '_________')"  # ファイル名に使えない文字だけ置換（日本語は保持）

APP="$ROOT/dist/bump-$SLUG.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/repo"

cp installer/launch.sh "$APP/Contents/MacOS/bump"; chmod +x "$APP/Contents/MacOS/bump"
cp installer/Info.plist "$APP/Contents/Info.plist"
cp installer/bump.icns "$APP/Contents/Resources/bump.icns" 2>/dev/null || true

# リポ一式（node_modules 同梱＝相手側 npm 不要）。scratch は除外。
rsync -a --exclude .git --exclude dist --exclude '*.log' --exclude .playwright-mcp \
  --exclude '*.png' --exclude installer --exclude relaybox \
  "$ROOT/" "$APP/Contents/Resources/repo/"

# ★焼き込み：relay住所（配布者の受信箱）＋宛先ラベル（系統）＋合言葉（本人確認）
# 合言葉はこのパッケージの中にしか無い。載せた申請が届いたら、渡した先から出ていると分かる。
# 発行の記録は配る側の ~/.bump/invites.json に残る（誰に渡したかの台帳＝系統）。
MMHOME="${BUMP_HOME:-$HOME/.bump}"
TOKEN="$(BUMP_HOME="$MMHOME" node bin/bump.js invite "$LABEL")"
printf '%s' "$RELAY_URL" > "$APP/Contents/Resources/repo/relay-url.default"
printf '%s' "$LABEL"     > "$APP/Contents/Resources/repo/recipient.txt"
printf '%s' "$TOKEN"     > "$APP/Contents/Resources/repo/invite-token"
# 配る側の公開鍵も焼き込む＝初回起動で接続リクエストまで自動で飛ぶ（貼り付ける文が要らない）。
# 公開鍵と署名だけなので、パッケージが漏れても縁は作れない（承認は配る側の画面で人が押す）。
BUMP_HOME="$MMHOME" node bin/bump.js id > "$APP/Contents/Resources/repo/owner-bundle.json"
printf '%s' "${OWNER_NAME:-大川}" > "$APP/Contents/Resources/repo/owner-name"
# 版の刻印。gitを持たない配布先でも `bump version` が答えられるようにする。
printf 'アプリ版 %s (%s) 宛先:%s\n' "$(date '+%Y-%m-%d')" "$(git rev-parse --short HEAD 2>/dev/null || echo '-')" "$LABEL" \
  > "$APP/Contents/Resources/repo/build.txt"

# 署名。Developer ID があれば本署名（相手のMacで「開発元が確認できません」が出ない）。
# 無い環境ではad-hocに落とす＝ビルド自体は通す（開発中に止めない）。
# --options runtime は公証(notarize)の必須条件。--deep は非推奨だが同梱物が素のファイルのみなので実害なし。
SIGN_ID="${MM_SIGN_ID:-$(security find-identity -v -p codesigning 2>/dev/null | awk -F'"' '/Developer ID Application/{print $2; exit}')}"
if [ -n "$SIGN_ID" ]; then
  codesign --force --deep --timestamp --options runtime --sign "$SIGN_ID" "$APP" \
    && echo "署名: $SIGN_ID" || echo "（署名に失敗。ad-hocに落とします）"
else
  codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || echo "（codesign スキップ）"
fi
# 公証（Appleに提出して「悪意なし」の判定をもらう）。署名だけでは Gatekeeper が拒否する。
# 判定は .app に貼り付ける（staple）ので、以後はオフラインでも警告が出ない。
# 資格情報はキーチェーンのプロファイルに入れてある（`notarytool store-credentials mm-notary`）。
# 無い環境では黙って飛ばす＝受け取る側で右クリック→開くが必要になるだけ。
NOTARY="${MM_NOTARY_PROFILE:-mm-notary}"
if [ -n "$SIGN_ID" ] && xcrun notarytool history --keychain-profile "$NOTARY" >/dev/null 2>&1; then
  echo "公証に提出中（数分かかります）..."
  ditto -c -k --keepParent "$APP" "/tmp/notarize-$SLUG.zip"
  if xcrun notarytool submit "/tmp/notarize-$SLUG.zip" --keychain-profile "$NOTARY" --wait 2>&1 | tail -3 | grep -q "status: Accepted"; then
    xcrun stapler staple "$APP" >/dev/null 2>&1 && echo "公証: 通過（判定を貼り付け済み）" || echo "公証は通ったが貼り付けに失敗"
  else echo "公証: 失敗（詳細は notarytool log を参照）"; fi
  rm -f "/tmp/notarize-$SLUG.zip"
else
  echo "公証: スキップ（資格情報なし）"
fi
# dist/ は配布zipだけを置く。旧版は old/ へ退避、.app（中間生成物）はzip後に消す。
mkdir -p "$ROOT/dist/old"
[ -f "$ROOT/dist/bump-$SLUG.zip" ] && mv -f "$ROOT/dist/bump-$SLUG.zip" "$ROOT/dist/old/bump-$SLUG-$(date +%Y%m%d%H%M).zip"
( cd "$ROOT/dist" && ditto -c -k --keepParent "bump-$SLUG.app" "bump-$SLUG.zip" )
rm -rf "$APP"

echo "できました:"
echo "  dist/bump-$SLUG.zip   ← これを $LABEL さんに渡す"
echo "  relay(焼込): $RELAY_URL"
echo "  宛先(系統):  $LABEL"
echo "  合言葉:      焼込済（承認画面で自動照合されます）"
du -h "$ROOT/dist/bump-$SLUG.zip" | awk '{print "  size: " $1}'
