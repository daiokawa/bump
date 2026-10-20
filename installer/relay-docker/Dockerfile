# 中継(relay)だけを入れる檻。中に入るのは relay-server.js と依存3ファイルだけ（鍵もbump本体も入れない）。
# 見えるディスクは /box（ホストの ~/.bump/relaybox）だけ。build/起動は run.sh から。
FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY lib/disk.js lib/paths.js lib/crypto.js ./lib/
COPY server/relay-server.js ./server/
ENV MM_RELAYBOX=/box MM_BIND=0.0.0.0 MM_BEHIND_PROXY=1
USER node
EXPOSE 8791
CMD ["node", "server/relay-server.js", "8791"]
