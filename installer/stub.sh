#!/bin/bash
# .app の実行本体（ダブルクリックで動く唯一のファイル）。
# ここは意図的に「何もしない」。本体は installer/launch.sh にあり、そちらは自動更新で
# 新しくなる。.app の中身は署名の対象なので書き換えられない＝ここを薄くしておかないと、
# 更新の仕組み自体（署名検証を含む）が永久に古いまま残る（2026-08-16の設計修正）。
set -u
HERE="$(cd "$(dirname "$0")/../Resources/repo" && pwd)"   # 同梱コード（Appleの封の内側）
DEST="$HOME/.bump-app"                                    # 導入先（自動更新で新しくなる）
export BUMP_BUNDLE_REPO="$HERE"
# 導入済みの本体があればそれを使う。無ければ同梱のものを使う（初回・復旧時）。
# 名札(BUMP_STUB_API=1)のある本体にだけ渡す。名札の無い古い本体は同梱側で起動する
# （渡すと HERE が空になり rsync の転送元が "/" になる。実測で確認済み 2026-08-16）。
if [ -x "$DEST/installer/launch.sh" ] && grep -q "BUMP_STUB_API=1" "$DEST/installer/launch.sh" 2>/dev/null; then
  exec /bin/bash "$DEST/installer/launch.sh" "$@"
fi
exec /bin/bash "$HERE/installer/launch.sh" "$@"
