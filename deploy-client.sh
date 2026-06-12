#!/bin/zsh
# クライアントをビルドして Cloudflare Pages に公開する。
# 初回だけ: npx wrangler login（ブラウザでCloudflareにログイン）
# 使い方: cd pages-story && ./deploy-client.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/client"

echo "📦 クライアントをビルド中..."
npm run build

echo "☁️  Cloudflare Pages に公開中..."
# プロジェクト名 pages-story。初回は対話で作成するか聞かれる。
npx wrangler pages deploy dist --project-name=pages-story

echo "✅ 公開完了！表示された https://pages-story.pages.dev が固定URL。"
