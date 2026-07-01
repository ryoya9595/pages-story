import Phaser from "phaser";
import { bgm } from "../bgm";
import { getProfile, setProfile } from "../profile";
import { ensureHeroVariantSheets } from "../pixelart";

// GameScene.heroVariant と同じ並び（見た目プレビュー用）
const VARIANTS = [
  { sheet: "f", tint: 0xffffff, label: "むらさき" },
  { sheet: "m", tint: 0xffffff, label: "むらさき" },
  { sheet: "f2", tint: 0xffffff, label: "あかげ" },
  { sheet: "m2", tint: 0xffffff, label: "きんぱつ" },
];

/** タイトル画面（キービジュアル → キャラ選択＆名前 → スタート） */
export class TitleScene extends Phaser.Scene {
  private mode: "title" | "select" = "title";

  constructor() {
    super("title");
  }

  preload() {
    this.load.image("title_art", "assets/ui/title.png");
    this.load.spritesheet("hero_m_idle", "assets/char/m_idle.png", { frameWidth: 48, frameHeight: 64 });
    this.load.spritesheet("hero_f_idle", "assets/char/f_idle.png", { frameWidth: 48, frameHeight: 64 });
  }

  create() {
    ensureHeroVariantSheets(this, ["idle"]); // 選択画面プレビュー用の色違い生成
    this.mode = "title";
    this.drawTitle();
    this.scale.on("resize", () => (this.mode === "title" ? this.drawTitle() : this.drawSelect()));
  }

  private drawTitle() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.children.removeAll();

    const img = this.add.image(w / 2, h / 2, "title_art");
    img.setScale(Math.max(w / img.width, h / img.height));

    this.add.rectangle(w / 2, h * 0.2, w, 130, 0x2b2118, 0.45);
    this.add
      .text(w / 2, h * 0.2 - 22, "PAGESストーリー", {
        fontSize: `${Math.min(38, Math.floor(w / 10))}px`,
        color: "#fff8e7",
        fontStyle: "bold",
        stroke: "#2b2118",
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.add
      .text(w / 2, h * 0.2 + 26, "〜 描きかけの絵本の国 〜", {
        fontSize: `${Math.min(18, Math.floor(w / 19))}px`,
        color: "#ffe9b8",
        stroke: "#2b2118",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    const start = this.add
      .text(w / 2, h * 0.82, "タップして すすむ", {
        fontSize: `${Math.min(20, Math.floor(w / 20))}px`,
        color: "#ffffff",
        backgroundColor: "#3a3530cc",
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    // BGMクレジット（CC-BY 表記。公開時もゲーム内に出す約束）
    this.add
      .text(w / 2, h - 10, "BGM: Caketown / Woodland Fantasy by Matthew Pablo (CC-BY) ／ 背景: ansimuz (CC0)", {
        fontSize: `${Math.min(11, Math.floor(w / 40))}px`,
        color: "#fff8e7",
        stroke: "#2b2118",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.85);

    this.input.once("pointerdown", () => {
      bgm.userGesture(); // 最初のタップでBGM開始（自動再生制限対策）
      this.mode = "select";
      this.drawSelect();
    });
  }

  private drawSelect() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.children.removeAll();
    this.input.removeAllListeners();

    this.add.rectangle(w / 2, h / 2, w, h, 0x3a3530, 1);
    const profile = getProfile();
    let name = profile.name || "";
    let charIdx = profile.charIdx >= 0 ? profile.charIdx : 0;

    this.add
      .text(w / 2, 40, "キャラと なまえを えらんでね", { fontSize: "20px", color: "#fff8e7", fontStyle: "bold" })
      .setOrigin(0.5);

    // キャラ4種のプレビュー
    const frames: Phaser.GameObjects.Rectangle[] = [];
    const cellW = Math.min(86, (w - 40) / 4);
    VARIANTS.forEach((v, i) => {
      const x = w / 2 + (i - 1.5) * cellW;
      const y = h * 0.3;
      const frame = this.add.rectangle(x, y, cellW - 10, 110, 0xfff8e7, i === charIdx ? 0.35 : 0.1);
      frame.setStrokeStyle(3, i === charIdx ? 0xffd700 : 0x6b6257);
      frames.push(frame);
      const spr = this.add.image(x, y, `hero_${v.sheet}_idle`, 0).setScale(1.4);
      spr.setTint(v.tint);
      frame.setInteractive({ useHandCursor: true });
      spr.setInteractive({ useHandCursor: true });
      const pick = () => {
        charIdx = i;
        frames.forEach((f, j) => {
          f.setFillStyle(0xfff8e7, j === i ? 0.35 : 0.1);
          f.setStrokeStyle(3, j === i ? 0xffd700 : 0x6b6257);
        });
      };
      frame.on("pointerdown", pick);
      spr.on("pointerdown", pick);
    });

    // 名前
    const nameBtn = this.add
      .text(w / 2, h * 0.55, "", {
        fontSize: "17px",
        color: "#3a3530",
        backgroundColor: "#fff8e7",
        padding: { x: 16, y: 9 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const renderName = () => nameBtn.setText(`なまえ: ${name || "（タップして きめる）"} ✏️`);
    renderName();
    nameBtn.on("pointerdown", () => {
      const input = window.prompt("ぼうけんしゃの なまえは？（12文字まで）", name || "");
      if (input && input.trim()) {
        name = input.trim().slice(0, 12);
        renderName();
      }
    });

    // スタート
    const go = this.add
      .text(w / 2, h * 0.72, "▶ ぼうけんに でかける！", {
        fontSize: "20px",
        color: "#ffffff",
        backgroundColor: "#1e7d32ee",
        padding: { x: 22, y: 12 },
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    go.on("pointerdown", () => {
      setProfile({ name: name || "", charIdx });
      // 冒険開始のたびに、必ず はじまりのお話（オープニング）から
      this.scene.start("opening");
    });

    // はじまりのおはなし（再視聴）
    const story = this.add
      .text(w / 2, h * 0.85, "📖 はじまりのおはなしを みる", {
        fontSize: "14px",
        color: "#fff8e7",
        backgroundColor: "#5a2d77cc",
        padding: { x: 14, y: 7 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    story.on("pointerdown", () => {
      setProfile({ name: name || "", charIdx });
      this.scene.start("opening");
    });

    this.add
      .text(w / 2, h * 0.93, "※なまえと見た目は あとからタイトルに戻れば変えられるよ", {
        fontSize: "12px",
        color: "#b9b3a8",
      })
      .setOrigin(0.5);
  }
}
