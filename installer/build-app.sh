#!/usr/bin/env bash
# bump.app を組み立てる（依存 node_modules 同梱・self-contained）。
# 出力: dist/bump.app と dist/bump.zip（配布用）。
# 使い方: bash installer/build-app.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
APP="$ROOT/dist/bump.app"
rm -rf "$ROOT/dist"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/repo"

# 頭脳スクリプトを実行本体に
cp installer/launch.sh "$APP/Contents/MacOS/bump"
chmod +x "$APP/Contents/MacOS/bump"
cp installer/Info.plist "$APP/Contents/Info.plist"

# リポ一式を同梱（node_modules も入れて member 側 npm 不要。scratch は除外）
rsync -a \
  --exclude .git --exclude dist --exclude '*.log' --exclude .playwright-mcp \
  --exclude '*.png' --exclude installer \
  "$ROOT/" "$APP/Contents/Resources/repo/"

# ad-hoc 署名（Gatekeeperの初回右クリック開くを少し楽に。正式署名ではない）
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || echo "（codesign スキップ）"

# zip 配布物
( cd "$ROOT/dist" && zip -qry bump.zip bump.app )
echo "できました:"
echo "  $APP"
echo "  $ROOT/dist/bump.zip  ← これを配る（相手はダブルクリック、初回だけ右クリック→開く）"
du -sh "$APP" | sed 's/^/  size: /'
