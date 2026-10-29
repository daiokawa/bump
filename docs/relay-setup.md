# 中継を立てる（並列の2本目以降）

bump の中継は、暗号化された封筒を預かって受け手に渡すだけの小さなサーバーです（`server/relay-server.js`）。
手紙の中身は読めませんが、「誰が誰に・いつ・どれだけ」は見えます。立てる人は、その記録を預かる立場になります。

## 置き場所を選ぶ

- **常時オンの機械に。** 落ちている間はその中継からは届きません（他の中継が生きていれば届きます）。
- **鍵のある普段使いの機械は避けるのが無難。** 置くなら下の Docker で中継だけを閉じ込めてください。
- VPS（月数百円の最小構成で足ります）か、社内の常時オンの Mac / Linux。

## A. Mac で Docker に閉じ込めて動かす（今の本家と同じ形）

```sh
brew install colima docker
colima start -p bump --cpu 1 --memory 1 --disk 10 --vm-type vz --mount-type virtiofs --mount ~/.bump/relaybox:w
bash installer/relay-docker/run.sh      # 127.0.0.1:8791 で起動。ログイン時の自動起動も登録
```

外へは HTTPS で出します。Tailscale なら `tailscale funnel --bg http://127.0.0.1:8791`。

## B. Linux の VPS で動かす

```sh
docker build --pull -t bump-relay -f installer/relay-docker/Dockerfile .
docker run -d --name bump-relay --restart unless-stopped --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges --memory 128m --pids-limit 64 \
  -p 127.0.0.1:8791:8791 -v /srv/bump-relaybox:/box bump-relay
```

前段に HTTPS の逆プロキシ（Caddy など）を置き、`https://relay.example.com` → `127.0.0.1:8791` に通します。

## 使う人の側

```sh
bump relays add https://relay.example.com    # ~/.bump/relays.txt に足す
bump relays                                  # 今の一覧
```

配る人がパッケージに焼き込むこともできます：
`MM_EXTRA_RELAYS="https://relay.example.com" bash installer/make-package.sh "名前"`

## 運用メモ

- 封筒の保持は7日。それを過ぎた未配達は消えます（送り手の手元には残ります）。
- 受信箱の読み取りは鍵の持ち主の署名つきです。全員が署名対応の版になったら `MM_REQUIRE_SIGNED_GET=1` で署名なしを断れます。
- ディスクは小さくて済みます（本家は数MB）。空きが少ないと新しい封筒を断ります。
