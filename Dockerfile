# PAGESストーリー ゲームサーバー（Colyseus）— fly.io 用
# ビルドコンテキストは pages-story/ ルート（server/ と shared/ の両方が必要なため）
FROM node:22-slim

WORKDIR /app

# 依存だけ先に入れてキャッシュを効かせる（tsx は devDependencies なので --omit は付けない）
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# サーバー本体と共有定義（server は ../../../shared を参照する）
COPY server ./server
COPY shared ./shared

# セーブデータの保存先（fly.io の永続ボリュームを /data にマウント）
ENV DATA_DIR=/data
ENV PORT=2567
EXPOSE 2567

WORKDIR /app/server
# ALLOW_DEV は付けない＝本番では開発チート無効
CMD ["npm", "run", "start"]
