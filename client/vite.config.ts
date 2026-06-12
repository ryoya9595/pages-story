import { defineConfig } from "vite";

export default defineConfig({
  // host: true でLAN内のスマホ実機からもアクセス可能にする
  server: {
    host: true,
    port: 5173,
    // トンネル（cloudflared等）経由のアクセスを許可
    allowedHosts: true,
    fs: {
      // 共有定義（../shared）をクライアントから読めるようにする
      allow: [".."],
    },
  },
});
