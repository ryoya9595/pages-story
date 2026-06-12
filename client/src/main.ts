import Phaser from "phaser";
import { TitleScene } from "./scenes/TitleScene";
import { OpeningScene } from "./scenes/OpeningScene";
import { GameScene } from "./scenes/GameScene";

// ?bg=1 でバックグラウンドタブでもループが回る（自動テスト・検証用）
const forceSetTimeOut = new URLSearchParams(location.search).has("bg");

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#aadcf0", // 空の色
  pixelArt: true, // ドット絵をくっきり表示
  fps: forceSetTimeOut ? { forceSetTimeOut: true } : undefined,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 1300 },
      debug: false,
    },
  },
  scene: [TitleScene, OpeningScene, GameScene],
});

// デバッグ用（本番ビルドでは外す）
(window as any).__game = game;

// 起動の保険: まれにテクスチャreadyイベントを取りこぼして起動しないことがあるため、
// 2秒たっても始まっていなければ手動でキックする
setTimeout(() => {
  if (game.isBooted && !game.isRunning && typeof (game as any).texturesReady === "function") {
    (game as any).texturesReady();
  }
}, 2000);
