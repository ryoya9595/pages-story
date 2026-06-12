#!/bin/zsh
# PAGESストーリー 開発環境一括起動
# 使い方: cd "/Users/ryoya/Desktop/AI Agents/pages-story" && ./start.sh
# 4G公開用トンネルが欲しい時は: ./start.sh --tunnel

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🎮 PAGESストーリー 起動中..."

# ゲームサーバー（ALLOW_DEV=1: 開発チート有効。公開時は外す）
(cd "$DIR/server" && ALLOW_DEV=1 npx tsx watch src/index.ts) &
SERVER_PID=$!

# クライアント（Vite）
(cd "$DIR/client" && npx vite) &
CLIENT_PID=$!

sleep 3
echo ""
echo "✅ ローカル:  http://localhost:5173"
echo "✅ 同じWi-Fi: http://$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1):5173"

if [[ "$1" == "--tunnel" ]]; then
  echo ""
  echo "🌍 トンネル起動中（4G/遠隔用）..."
  cloudflared tunnel --url http://localhost:2567 > /tmp/pages-tunnel-server.log 2>&1 &
  cloudflared tunnel --url http://localhost:5173 > /tmp/pages-tunnel-client.log 2>&1 &
  sleep 8
  SERVER_URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/pages-tunnel-server.log | head -1)
  CLIENT_URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/pages-tunnel-client.log | head -1)
  SERVER_HOST="${SERVER_URL#https://}"
  echo ""
  echo "📱 友達に送るURL（4G/5GでもOK）:"
  echo "   ${CLIENT_URL}/?server=${SERVER_HOST}"
fi

echo ""
echo "終了するときは Ctrl+C"
wait $SERVER_PID $CLIENT_PID
