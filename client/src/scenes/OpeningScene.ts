import Phaser from "phaser";

// オープニング: 主人公が「描きかけの絵本」に迷い込むまでの物語。
// 初回プレイ時に自動再生、タイトルの「はじまりのおはなし」から再視聴も可能。
// 絵はグラフィックスで描く（外部素材に依存せず本番でもそのまま動く）。

interface Page {
  bg: number;
  draw: (s: OpeningScene, cx: number, cy: number) => void;
  text: string;
}

const OP_SEEN_KEY = "pages_op_seen";
export const markOpeningSeen = () => {
  try { localStorage.setItem(OP_SEEN_KEY, "1"); } catch {}
};
export const hasSeenOpening = () => {
  try { return localStorage.getItem(OP_SEEN_KEY) === "1"; } catch { return false; }
};

export class OpeningScene extends Phaser.Scene {
  private idx = 0;
  private pageObjs: Phaser.GameObjects.GameObject[] = [];
  private advancing = false;

  constructor() {
    super("opening");
  }

  private pages: Page[] = [
    {
      bg: 0x2b2740,
      text: "絵を描くのが だいすきな きみは、\nある雨の日、おじいちゃんの 屋根裏で\n一冊の ふるい絵本を 見つけた。",
      draw: (s, cx, cy) => s.drawBook(cx, cy, false),
    },
    {
      bg: 0x3a3354,
      text: "ひょうしには『描きかけの絵本の国』。\n…でも 中のページは とちゅうで 終わっていて、\nまっ白なページ ばかりだった。",
      draw: (s, cx, cy) => s.drawBook(cx, cy, true),
    },
    {
      bg: 0x46406a,
      text: "「もったいないなあ」\nきみが えんぴつを とって、\nさいごのページに 一本の線を 描いた とき——",
      draw: (s, cx, cy) => s.drawPencilLine(cx, cy),
    },
    {
      bg: 0xf3ecd9,
      text: "ピカッ！\n線が ひかって、きみは\n絵本の中へ すいこまれて しまった！",
      draw: (s, cx, cy) => s.drawFlash(cx, cy),
    },
    {
      bg: 0x355c7d,
      text: "気づくと そこは えほんの国。\nいたずらな ラクガキたちが あばれ、\nものがたりは とまった まま。",
      draw: (s, cx, cy) => s.drawScribbles(cx, cy),
    },
    {
      bg: 0x2e7d5b,
      text: "この国を、きみの絵で 完成させよう。\nさあ、ページを めくる ぼうけんの はじまり！",
      draw: (s, cx, cy) => s.drawPortal(cx, cy),
    },
  ];

  create() {
    this.idx = 0;
    this.cameras.main.setBackgroundColor("#2b2740");

    // スキップ
    const skip = this.add
      .text(this.scale.width - 14, 14, "スキップ ⏭", {
        fontSize: "15px", color: "#fff8e7", backgroundColor: "#00000055", padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0).setDepth(100).setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    skip.on("pointerdown", () => this.finish());

    this.showPage();

    // タップ／クリックで次へ（スキップボタンの上は除く）
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.y < 40 && p.x > this.scale.width - 120) return;
      this.next();
    });
    this.input.keyboard?.on("keydown-SPACE", () => this.next());
    this.input.keyboard?.on("keydown-ENTER", () => this.next());
  }

  private showPage() {
    const page = this.pages[this.idx];
    const w = this.scale.width, h = this.scale.height;
    this.cameras.main.setBackgroundColor(page.bg);

    for (const o of this.pageObjs) o.destroy();
    this.pageObjs = [];

    // イラスト
    page.draw(this, w / 2, h * 0.36);

    // テキスト枠
    const dark = page.bg === 0xf3ecd9; // 明るい背景のページだけ文字色を反転
    const panel = this.add
      .rectangle(w / 2, h * 0.78, Math.min(w - 24, 620), 150, dark ? 0xfffaf0 : 0x000000, dark ? 0.6 : 0.4)
      .setDepth(10);
    const txt = this.add
      .text(w / 2, h * 0.78, page.text, {
        fontSize: `${Math.min(20, Math.floor(w / 22))}px`,
        color: dark ? "#3a2f50" : "#fff8e7",
        align: "center",
        lineSpacing: 8,
        wordWrap: { width: Math.min(w - 56, 580) },
      })
      .setOrigin(0.5).setDepth(11);
    this.pageObjs.push(panel, txt);

    // ページ進行ドット
    this.pages.forEach((_, i) => {
      const dot = this.add
        .circle(w / 2 + (i - (this.pages.length - 1) / 2) * 20, h - 26, 5, i === this.idx ? 0xffd700 : 0xffffff, i === this.idx ? 1 : 0.4)
        .setDepth(11);
      this.pageObjs.push(dot);
    });

    // 「タップでつぎへ」ヒント
    const hint = this.add
      .text(w / 2, h * 0.9, this.idx < this.pages.length - 1 ? "タップで つぎへ ▶" : "タップで ぼうけんへ ▶", {
        fontSize: "14px", color: dark ? "#5a4d70" : "#ffe9b8",
      })
      .setOrigin(0.5).setDepth(11);
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
    this.pageObjs.push(hint);

    // フェードイン
    txt.setAlpha(0);
    this.tweens.add({ targets: txt, alpha: 1, duration: 400 });
  }

  private next() {
    if (this.advancing) return;
    if (this.idx >= this.pages.length - 1) {
      this.finish();
      return;
    }
    this.advancing = true;
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.idx++;
      this.showPage();
      this.cameras.main.fadeIn(180, 0, 0, 0);
      this.advancing = false;
    });
  }

  private finish() {
    markOpeningSeen();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("game"));
  }

  // ============ イラスト（グラフィックスで簡易に描く） ============

  drawBook(cx: number, cy: number, open: boolean) {
    const g = this.add.graphics().setDepth(5);
    if (open) {
      // 見開き（白紙ページ）
      g.fillStyle(0x8a5a3a, 1).fillRoundedRect(cx - 130, cy - 90, 260, 180, 8);
      g.fillStyle(0xfdf6e3, 1).fillRect(cx - 120, cy - 80, 110, 160);
      g.fillStyle(0xfdf6e3, 1).fillRect(cx + 10, cy - 80, 110, 160);
      g.lineStyle(3, 0x6b4226, 1).lineBetween(cx, cy - 80, cx, cy + 80);
      // 描きかけの薄い線
      g.lineStyle(2, 0xcbb89a, 1);
      g.lineBetween(cx - 100, cy - 40, cx - 40, cy - 30);
      g.lineBetween(cx - 95, cy - 10, cx - 55, cy + 10);
    } else {
      // 閉じた古い絵本
      g.fillStyle(0x5a3a6b, 1).fillRoundedRect(cx - 90, cy - 110, 180, 220, 10);
      g.fillStyle(0x7b4f8f, 1).fillRoundedRect(cx - 78, cy - 98, 156, 196, 8);
      g.fillStyle(0xffd700, 1).fillRect(cx - 40, cy - 30, 80, 6);
      g.fillStyle(0xffd700, 1).fillRect(cx - 30, cy - 10, 60, 5);
    }
    this.pageObjs.push(g);
    this.floatY(g);
  }

  drawPencilLine(cx: number, cy: number) {
    const g = this.add.graphics().setDepth(5);
    // えんぴつ
    g.fillStyle(0xf4c542, 1).fillRect(cx - 10, cy - 80, 20, 110);
    g.fillStyle(0xe8b4a0, 1).fillTriangle(cx - 10, cy + 30, cx + 10, cy + 30, cx, cy + 52);
    g.fillStyle(0x3a3530, 1).fillTriangle(cx - 3, cy + 46, cx + 3, cy + 46, cx, cy + 52);
    this.pageObjs.push(g);
    // 描かれていく線
    const line = this.add.graphics().setDepth(4);
    line.lineStyle(4, 0x2b2118, 1);
    let prog = 0;
    const startX = cx - 120, endX = cx + 120, yy = cy + 70;
    const ev = this.time.addEvent({
      delay: 16, loop: true, callback: () => {
        prog += 0.04;
        line.clear().lineStyle(4, 0x2b2118, 1);
        line.lineBetween(startX, yy, startX + (endX - startX) * Math.min(1, prog), yy);
        if (prog >= 1) ev.remove();
      },
    });
    this.pageObjs.push(line);
  }

  drawFlash(cx: number, cy: number) {
    const star = this.add.star(cx, cy, 12, 18, 70, 0xfff3b0, 1).setDepth(5);
    this.tweens.add({ targets: star, angle: 180, scale: 1.3, duration: 1200, yoyo: true, repeat: -1 });
    const glow = this.add.circle(cx, cy, 40, 0xffffff, 0.5).setDepth(4);
    this.tweens.add({ targets: glow, scale: 2.4, alpha: 0, duration: 900, repeat: -1 });
    this.pageObjs.push(star, glow);
  }

  drawScribbles(cx: number, cy: number) {
    const colors = [0x6b8e4e, 0x4a6fa5, 0xa05a8f, 0xc77d3a];
    for (let i = 0; i < 5; i++) {
      const x = cx + (i - 2) * 70;
      const c = this.add.circle(x, cy, 22, colors[i % colors.length], 1).setDepth(5);
      // らくがきの目（本体と一緒に動くようコンテナにまとめる）
      const eyeLW = this.add.circle(x - 7, cy - 4, 4, 0xffffff, 1).setDepth(6);
      const eyeRW = this.add.circle(x + 7, cy - 4, 4, 0xffffff, 1).setDepth(6);
      const eyeLB = this.add.circle(x - 7, cy - 4, 2, 0x000000, 1).setDepth(7);
      const eyeRB = this.add.circle(x + 7, cy - 4, 2, 0x000000, 1).setDepth(7);
      this.tweens.add({ targets: [c, eyeLW, eyeRW, eyeLB, eyeRB], y: cy - 14, duration: 400 + i * 90, yoyo: true, repeat: -1 });
      this.pageObjs.push(c, eyeLW, eyeRW, eyeLB, eyeRB);
    }
  }

  drawPortal(cx: number, cy: number) {
    for (let r = 0; r < 4; r++) {
      const ring = this.add.circle(cx, cy, 30 + r * 22, 0xffffff, 0).setStrokeStyle(5, [0xffd166, 0xef8354, 0x6fd0ff, 0xa0e060][r], 0.9).setDepth(5);
      this.tweens.add({ targets: ring, angle: 360, duration: 4000 + r * 500, repeat: -1 });
      this.tweens.add({ targets: ring, scale: 1.1, duration: 900 + r * 120, yoyo: true, repeat: -1 });
      this.pageObjs.push(ring);
    }
  }

  private floatY(obj: Phaser.GameObjects.Graphics) {
    this.tweens.add({ targets: obj, y: obj.y - 10, duration: 1400, yoyo: true, repeat: -1 });
  }
}
