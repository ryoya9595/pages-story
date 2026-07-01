import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // ビルドは相対パス（GitHub Pages のサブパス配信でもアセットが読めるように）。
  // 開発サーバーはルート配信のまま。
  base: command === "build" ? "./" : "/",
  server: {
    // host: true でLAN内のスマホ実機からもアクセス可能にする
    host: true,
    port: 5173,
    // トンネル（cloudflared等）経由のアクセスを許可
    allowedHosts: true,
    fs: {
      // 共有定義（../shared）をクライアントから読めるようにする
      allow: [".."],
    },
  },
}));
