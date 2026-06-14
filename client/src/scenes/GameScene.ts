import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "colyseus.js";
import { TouchControls } from "../touchControls";
import { MAPS, ENEMY_KINDS, type MapDef, type DoorDef, type LadderDef, type NpcDef } from "../../../shared/maps";
import { getIdentity, transferCode, resetIdentity } from "../identity";
import { getKeyword, setKeyword } from "../keyword";
import { makePlayerTextures, makeEnemyTextures, makeWorldTextures, ENEMY_TEXTURES, ensureHeroVariantSheets } from "../pixelart";
import { bgm } from "../bgm";
import { sfx } from "../sfx";
import { getProfile } from "../profile";
import { PROD_SERVER_HOST } from "../serverConfig";
import { QUESTS } from "../../../shared/quests";
import { SKETCHES, parseSketchBook, type SketchDef } from "../../../shared/sketches";
import {
  JOBS,
  HEAL_COOLDOWN_MS,
  RANGED_ATTACK_X,
  ADVANCE_LEVELS,
  availableJobs,
  isHealer,
  jobAtkCdMul,
} from "../../../shared/jobs";

// 鏡の大迷宮の4カービィへのオマージュ（ピンク・赤・黄・緑）
const PLAYER_COLORS = [0xff9ec7, 0xff6b6b, 0xffd93d, 0x6bcb77];

const MOVE_SPEED = 240;
const JUMP_VELOCITY = -560;
const CLIMB_SPEED = 160;
const SEND_INTERVAL_MS = 50; // 20Hz
const ATTACK_COOLDOWN_MS = 400;
const DOOR_COOLDOWN_MS = 1500;

const INK = 0x3a3530; // 絵本のインク色
const PAPER = "#f5efe0";

type RemoteEntry = {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  state: any;
  targetX: number;
  targetY: number;
};

type EnemyEntry = {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Graphics;
  state: any;
  targetX: number;
  targetY: number;
};

export class GameScene extends Phaser.Scene {
  private room?: Room;
  private me?: Phaser.Physics.Arcade.Sprite;
  private myState?: any;
  private myLabel?: Phaser.GameObjects.Text;
  private remotes = new Map<string, RemoteEntry>();
  private enemies = new Map<string, EnemyEntry>();

  private currentMapId = "";
  private platforms?: Phaser.Physics.Arcade.StaticGroup;
  private mapObjects: Phaser.GameObjects.GameObject[] = [];
  private doors: { def: DoorDef; zone: Phaser.Geom.Rectangle }[] = [];
  private ladders: LadderDef[] = [];
  private npcs: { def: NpcDef; sprite: Phaser.GameObjects.Image; bubble: Phaser.GameObjects.Text }[] = [];
  private doorArmed = false;
  private spPanel?: Phaser.GameObjects.GameObject[];
  private spBtn?: Phaser.GameObjects.Text;
  private barText?: Phaser.GameObjects.Text;
  private climbing = false;
  private collider?: Phaser.Physics.Arcade.Collider;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"a" | "d" | "w" | "s" | "space" | "j" | "x" | "h" | "k" | "p", Phaser.Input.Keyboard.Key>;
  private jobOverlay?: Phaser.GameObjects.GameObject[];
  private lastHealAt = 0;
  private myLabelJob = "";
  private touch!: TouchControls;

  private hud!: Phaser.GameObjects.Text;
  private questPanel!: Phaser.GameObjects.Text;
  private bars!: Phaser.GameObjects.Graphics;
  private deadOverlay?: Phaser.GameObjects.Text;

  private sendAccum = 0;
  private lastSent = { x: 0, y: 0, flip: false, anim: "idle" };
  private lastAttackAt = 0;
  private lastDoorAt = 0;
  private lastSketchAt = 0; // とくぎ発動のクライアント側CT表示用
  private sketchBtn?: Phaser.GameObjects.Text; // スケッチブックを開くボタン
  private sketchOverlay?: Phaser.GameObjects.GameObject[];
  private shopBtn?: Phaser.GameObjects.Text; // ショップを開くボタン
  private shopOverlay?: Phaser.GameObjects.GameObject[];
  private lastPotionAt = 0;

  constructor() {
    super("game");
  }

  preload() {
    // フリー背景素材（CC0 / OpenGameArt ansimuz: Magic Cliffs, Mountain Dusk）
    this.load.image("bg_cliffs_sky", "/assets/bg/cliffs/sky.png");
    this.load.image("bg_cliffs_clouds", "/assets/bg/cliffs/clouds.png");
    this.load.image("bg_cliffs_sea", "/assets/bg/cliffs/sea.png");
    this.load.image("bg_cliffs_far", "/assets/bg/cliffs/far-grounds.png");
    this.load.image("bg_dusk_bg", "/assets/bg/dusk/parallax-mountain-bg.png");
    this.load.image("bg_dusk_far", "/assets/bg/dusk/parallax-mountain-montain-far.png");
    this.load.image("bg_dusk_mountains", "/assets/bg/dusk/parallax-mountain-mountains.png");
    this.load.image("bg_dusk_trees", "/assets/bg/dusk/parallax-mountain-trees.png");
    this.load.image("bg_dusk_fg", "/assets/bg/dusk/parallax-mountain-foreground-trees.png");

    // 敵スプライト（AI生成オリジナル）。読み込めればこちらが優先され、
    // 無ければ pixelart.ts のコード製ドットに自動フォールバックする（同名キーのため）
    this.load.image("enemy_makimaki", "/assets/enemies/makimaki.png");
    this.load.image("enemy_inkdama", "/assets/enemies/inkdama.png");
    this.load.image("enemy_kinoko", "/assets/enemies/kinoko.png");
    this.load.image("enemy_rafbear", "/assets/enemies/rafbear.png");

    this.load.image("enemy_keshiboo", "/assets/enemies/keshiboo.png");
    this.load.image("enemy_fudemushi", "/assets/enemies/fudemushi.png");
    this.load.image("enemy_golem", "/assets/enemies/enogu_golem.png");

    // NPC（AI生成オリジナル）
    this.load.image("npc_shiori", "/assets/npc/shiori.png");
    this.load.image("npc_elder", "/assets/npc/elder.png");

    // インクのぬま背景（AI生成）
    this.load.image("bg_swamp", "/assets/bg/ink_swamp.png");

    // 主人公スプライト（The Adventurer by sscary / 無料・商用OK）48×64×8フレーム
    for (const v of ["m", "f"]) {
      this.load.spritesheet(`hero_${v}_idle`, `/assets/char/${v}_idle.png`, { frameWidth: 48, frameHeight: 64 });
      this.load.spritesheet(`hero_${v}_walk`, `/assets/char/${v}_walk.png`, { frameWidth: 48, frameHeight: 64 });
      this.load.spritesheet(`hero_${v}_jump`, `/assets/char/${v}_jump.png`, { frameWidth: 48, frameHeight: 64 });
    }
  }

  create() {
    this.makeTextures();

    // 主人公の色違いシート（f2=赤毛, m2=金髪）を生成してからアニメ定義
    ensureHeroVariantSheets(this, ["idle", "walk", "jump"]);
    for (const v of ["m", "f", "m2", "f2"]) {
      if (!this.anims.exists(`anim_${v}_idle`)) {
        this.anims.create({
          key: `anim_${v}_idle`,
          frames: this.anims.generateFrameNumbers(`hero_${v}_idle`, {}),
          frameRate: 7,
          repeat: -1,
        });
        this.anims.create({
          key: `anim_${v}_walk`,
          frames: this.anims.generateFrameNumbers(`hero_${v}_walk`, {}),
          frameRate: 12,
          repeat: -1,
        });
      }
    }

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = {
      a: this.input.keyboard!.addKey("A"),
      d: this.input.keyboard!.addKey("D"),
      w: this.input.keyboard!.addKey("W"),
      s: this.input.keyboard!.addKey("S"),
      space: this.input.keyboard!.addKey("SPACE"),
      j: this.input.keyboard!.addKey("J"),
      x: this.input.keyboard!.addKey("X"),
      h: this.input.keyboard!.addKey("H"),
      k: this.input.keyboard!.addKey("K"),
      p: this.input.keyboard!.addKey("P"),
    };
    this.touch = new TouchControls(this);

    this.hud = this.add
      .text(12, 10, "せつぞくちゅう…", {
        fontSize: "16px",
        color: "#3a3530",
        backgroundColor: "#ffffffcc",
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(2000);
    this.bars = this.add.graphics().setScrollFactor(0).setDepth(2000);
    this.barText = this.add
      .text(16, 0, "", { fontSize: "11px", color: "#ffffff", fontStyle: "bold", stroke: "#3a3530", strokeThickness: 3 })
      .setScrollFactor(0)
      .setDepth(2001);

    // SP振り分けボタン＆パネル
    this.spBtn = this.add
      .text(244, 0, "✨SP 0", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#7b3fa0ee",
        padding: { x: 10, y: 6 },
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(2001)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.spBtn.on("pointerdown", () => this.toggleSpPanel());

    // スケッチブック（技コピー図鑑）を開くボタン。1つでも覚えたら表示
    this.sketchBtn = this.add
      .text(0, 0, "📕 スケッチ", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#5a2d77ee",
        padding: { x: 10, y: 6 },
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(2001)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.sketchBtn.on("pointerdown", () => this.toggleSketchBook());

    // ショップ（ポーション購入）を開くボタン
    this.shopBtn = this.add
      .text(0, 0, "🛒 ショップ", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#1e7d64ee",
        padding: { x: 10, y: 6 },
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(2001)
      .setInteractive({ useHandCursor: true });
    this.shopBtn.on("pointerdown", () => this.toggleShop());

    // PC向け操作ヒント
    if (!this.sys.game.device.input.touch) {
      this.add
        .text(this.scale.width / 2, this.scale.height - 8, "←→/AD:いどう ␣:ジャンプ J/X:こうげき K:とくぎ P:ポーション ↑↓:はしご H:かいふく", {
          fontSize: "11px",
          color: "#3a3530",
          backgroundColor: "#ffffff88",
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5, 1)
        .setScrollFactor(0)
        .setDepth(2000);
    }
    this.questPanel = this.add
      .text(12, 44, "", {
        fontSize: "13px",
        color: "#3a3530",
        backgroundColor: "#fff8e7dd",
        padding: { x: 8, y: 5 },
        wordWrap: { width: 260 },
      })
      .setScrollFactor(0)
      .setDepth(2000);

    // BGM（タイトル画面で開始済みのはずだが、直接ゲームに入った場合の保険）
    this.input.once("pointerdown", () => bgm.userGesture());
    this.input.keyboard!.once("keydown", () => bgm.userGesture());
    const bgmBtn = this.add
      .text(this.scale.width - 10, 62, bgm.enabled ? "🎵BGM" : "🔇BGM", {
        fontSize: "13px",
        color: "#6b6257",
        backgroundColor: "#ffffffaa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(2000)
      .setInteractive({ useHandCursor: true });
    bgmBtn.on("pointerdown", () => {
      const on = bgm.toggle();
      bgmBtn.setText(on ? "🎵BGM" : "🔇BGM");
    });
    this.scale.on("resize", () => bgmBtn.setPosition(this.scale.width - 10, 62));

    this.connect().catch((e) => {
      console.error(e);
      this.hud.setText("せつぞくに しっぱい… サーバーは うごいてる？");
    });
  }

  // ============ テクスチャ ============

  private makeTextures() {
    // ドット絵（人型プレイヤー4色×4フレーム・敵4種・タイル・はしご・雲）
    makePlayerTextures(this, PLAYER_COLORS);
    makeEnemyTextures(this);
    makeWorldTextures(this);

    // 攻撃の斬撃（三日月）
    let g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(5, INK, 0.8);
    g.beginPath();
    g.arc(10, 24, 20, -Math.PI / 2.4, Math.PI / 2.4);
    g.strokePath();
    g.generateTexture("slash", 36, 48);
    g.destroy();

    // 扉（ページの入口）
    g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 0.8);
    g.fillRoundedRect(0, 0, 48, 76, 8);
    g.lineStyle(3, INK, 1);
    g.strokeRoundedRect(1, 1, 46, 74, 8);
    g.lineStyle(2, INK, 0.6);
    g.lineBetween(24, 6, 24, 70); // 本の折り目
    g.generateTexture("door", 48, 76);
    g.destroy();
  }

  // ============ マップ構築（ページ切り替え） ============

  private buildMap(map: MapDef) {
    this.currentMapId = map.id;
    this.doorArmed = false; // 到着した扉の上ですぐ戻らないように

    // マップの雰囲気でBGM切り替え（明るい系/ダーク系）
    const brightMaps = ["hub", "sky", "beach"];
    bgm.setTrack(brightMaps.includes(map.id) ? "field" : "forest");

    // 前のページを片付ける
    for (const o of this.mapObjects) o.destroy();
    this.mapObjects = [];
    this.doors = [];
    this.collider?.destroy();
    this.platforms?.clear(true, true);
    this.platforms?.destroy();

    this.physics.world.setBounds(0, 0, map.width, map.height);
    this.cameras.main.setBounds(0, 0, map.width, map.height);

    // ===== 多層パララックス背景（フリー素材 CC0） =====
    // 横方向だけパララックス（メイプル方式）。縦は世界座標に固定
    const addLayer = (
      key: string,
      sf: number,
      depth: number,
      opts: { y: number; originY: number; scale: number; alpha?: number }
    ) => {
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
      const widthNeeded = Math.ceil((map.width * sf + this.scale.width * 2) / opts.scale) + src.width * 2;
      const ts = this.add
        .tileSprite(0, opts.y, widthNeeded, src.height, key)
        .setOrigin(0, opts.originY)
        .setScale(opts.scale)
        .setScrollFactor(sf, 1)
        .setDepth(depth)
        .setAlpha(opts.alpha ?? 1);
      this.mapObjects.push(ts);
    };

    if (map.id === "forest") {
      // 夕暮れの山（強敵エリアの不穏さ）
      this.cameras.main.setBackgroundColor("#cdb6bd");
      addLayer("bg_dusk_bg", 0.05, -30, { y: 0, originY: 0, scale: 4.5 });
      addLayer("bg_dusk_far", 0.18, -28, { y: 0, originY: 0, scale: 4.5 });
      addLayer("bg_dusk_mountains", 0.32, -26, { y: 0, originY: 0, scale: 4.5 });
      addLayer("bg_dusk_trees", 0.5, -24, { y: 0, originY: 0, scale: 4.5 });
      addLayer("bg_dusk_fg", 0.72, -22, { y: 0, originY: 0, scale: 4.5 });
    } else if (map.id === "swamp") {
      // インクのぬま（AI生成1枚絵をゆっくりパララックス）
      this.cameras.main.setBackgroundColor("#cfc3e8");
      const src = this.textures.get("bg_swamp").getSourceImage() as HTMLImageElement;
      addLayer("bg_swamp", 0.2, -30, { y: 0, originY: 0, scale: 720 / src.height });
    } else if (map.id === "blank") {
      // しろいページ（描きかけの白い世界。うっすら雲だけ）
      this.cameras.main.setBackgroundColor("#f3ecd9");
      addLayer("bg_cliffs_clouds", 0.12, -28, { y: 60, originY: 0, scale: 2, alpha: 0.35 });
    } else if (map.id === "sky") {
      // くものページ（空の上）
      this.cameras.main.setBackgroundColor("#9fd9f5");
      addLayer("bg_cliffs_sky", 0.04, -30, { y: 0, originY: 0, scale: 720 / 304 });
      addLayer("bg_cliffs_clouds", 0.2, -28, { y: 60, originY: 0, scale: 2.4 });
      addLayer("bg_cliffs_clouds", 0.45, -26, { y: 320, originY: 0, scale: 3, alpha: 0.8 });
    } else if (map.id === "cave") {
      // インクのどうくつ（暗い）
      this.cameras.main.setBackgroundColor("#39324d");
      addLayer("bg_dusk_mountains", 0.2, -28, { y: 0, originY: 0, scale: 4.5, alpha: 0.45 });
      addLayer("bg_dusk_fg", 0.55, -24, { y: 0, originY: 0, scale: 4.5, alpha: 0.7 });
    } else if (map.id === "beach") {
      // ゆうやけのうみべ（暖色）
      this.cameras.main.setBackgroundColor("#ffd9a8");
      addLayer("bg_cliffs_clouds", 0.15, -28, { y: 40, originY: 0, scale: 2, alpha: 0.85 });
      addLayer("bg_cliffs_sea", 0.3, -26, { y: 724, originY: 1, scale: 2.6 });
      addLayer("bg_cliffs_far", 0.5, -24, { y: 668, originY: 1, scale: 2.4 });
    } else if (map.id === "peak") {
      // おえかきのやま（高山）
      this.cameras.main.setBackgroundColor("#cfe5f2");
      addLayer("bg_dusk_far", 0.18, -28, { y: 0, originY: 0, scale: 4.5, alpha: 0.6 });
      addLayer("bg_dusk_mountains", 0.35, -26, { y: 0, originY: 0, scale: 4.5, alpha: 0.8 });
      addLayer("bg_cliffs_clouds", 0.55, -24, { y: 100, originY: 0, scale: 2.4 });
    } else if (["moonpage", "dream", "lullaby"].includes(map.id)) {
      // 第4章 よるのものがたり（夜・星空・月）
      this.cameras.main.setBackgroundColor("#2b2740");
      addLayer("bg_cliffs_sky", 0.04, -30, { y: 0, originY: 0, scale: 720 / 304, alpha: 0.45 });
      addLayer("bg_dusk_mountains", 0.3, -26, { y: 0, originY: 0, scale: 4.5, alpha: 0.55 });
      addLayer("bg_cliffs_clouds", 0.5, -24, { y: 90, originY: 0, scale: 2.4, alpha: 0.35 });
    } else if (["storm", "thunder", "maelstrom"].includes(map.id)) {
      // 第5章 あらしのうみ（嵐・雷・荒れた海）
      this.cameras.main.setBackgroundColor("#3a4258");
      addLayer("bg_cliffs_clouds", 0.12, -28, { y: 20, originY: 0, scale: 2.6, alpha: 0.55 });
      addLayer("bg_cliffs_sea", 0.3, -26, { y: 724, originY: 1, scale: 2.6, alpha: 0.85 });
      addLayer("bg_cliffs_far", 0.5, -24, { y: 668, originY: 1, scale: 2.4, alpha: 0.6 });
    } else if (["rainbow", "prism", "aurora"].includes(map.id)) {
      // 第6章 にじのかなた（虹・光・色が戻る）
      this.cameras.main.setBackgroundColor("#bfe3f0");
      addLayer("bg_cliffs_sky", 0.04, -30, { y: 0, originY: 0, scale: 720 / 304 });
      addLayer("bg_cliffs_clouds", 0.2, -28, { y: 50, originY: 0, scale: 2.4 });
      addLayer("bg_cliffs_clouds", 0.45, -26, { y: 300, originY: 0, scale: 3, alpha: 0.7 });
    } else if (["edge", "tobira", "finale"].includes(map.id)) {
      // 第7章 さいごのページ（白紙の果て・結末は暗く）
      this.cameras.main.setBackgroundColor(map.id === "finale" ? "#1e1a2e" : "#efe7d4");
      addLayer("bg_cliffs_clouds", 0.12, -28, { y: 60, originY: 0, scale: 2, alpha: 0.3 });
    } else {
      // 明るい崖と海（もくじ広場）
      this.cameras.main.setBackgroundColor("#8edceb");
      addLayer("bg_cliffs_sky", 0.04, -30, { y: 0, originY: 0, scale: 720 / 304 });
      addLayer("bg_cliffs_clouds", 0.15, -28, { y: 30, originY: 0, scale: 2 });
      addLayer("bg_cliffs_sea", 0.3, -26, { y: 724, originY: 1, scale: 2.6 });
      addLayer("bg_cliffs_far", 0.5, -24, { y: 668, originY: 1, scale: 2.4 });
    }

    const title = this.add
      .text(160, 200, `「${map.name}」`, { fontSize: "24px", color: "#ffffff" })
      .setAlpha(0.75)
      .setDepth(-9);
    this.mapObjects.push(title);

    // ===== 足場（草タイル。地面以外は下から飛び乗れるワンウェイ） =====
    this.platforms = this.physics.add.staticGroup();
    map.platforms.forEach((p, idx) => {
      // 地面（idx0）は縦長タイル、浮き足場は通常タイル
      const t = this.add.tileSprite(p.x, p.y, p.w, p.h, idx === 0 ? "tile_ground" : "tile_grass");
      this.physics.add.existing(t, true);
      this.platforms!.add(t);
      if (idx > 0) {
        // ワンウェイ足場: 上からだけ乗れる（下・横からはすり抜け）
        const sb = (t as any).body as Phaser.Physics.Arcade.StaticBody;
        sb.checkCollision.down = false;
        sb.checkCollision.left = false;
        sb.checkCollision.right = false;
      }
      this.mapObjects.push(t);
    });

    // ===== はしご =====
    this.ladders = map.ladders;
    for (const l of map.ladders) {
      const ladder = this.add
        .tileSprite(l.x, (l.y1 + l.y2) / 2, 32, l.y2 - l.y1, "ladder")
        .setDepth(-4);
      this.mapObjects.push(ladder);
    }

    // ===== NPC =====
    this.npcs = [];
    for (const n of map.npcs) {
      const sprite = this.add.image(n.x, n.y, n.key).setDepth(-2);
      const nameLabel = this.add
        .text(n.x, n.y - sprite.displayHeight / 2 - 6, n.name, {
          fontSize: "13px",
          color: "#7b5226",
          stroke: "#ffffff",
          strokeThickness: 4,
          fontStyle: "bold",
        })
        .setOrigin(0.5, 1)
        .setDepth(90);
      const bubble = this.add
        .text(n.x, n.y - sprite.displayHeight / 2 - 26, "", {
          fontSize: "13px",
          color: "#3a3530",
          backgroundColor: "#fffdf5ee",
          padding: { x: 10, y: 7 },
          wordWrap: { width: 230 },
          align: "center",
        })
        .setOrigin(0.5, 1)
        .setDepth(300)
        .setVisible(false);
      if (n.float) {
        this.tweens.add({ targets: sprite, y: n.y - 10, duration: 1200, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      }
      if (n.id === "shiori") {
        // 吹き出しタップでクエスト受注・報告
        bubble.setInteractive({ useHandCursor: true });
        bubble.on("pointerdown", () => {
          const phase = this.myState?.questPhase;
          if (phase === "idle") this.room?.send("acceptQuest");
          else if (phase === "ready") this.room?.send("claimQuest");
        });
      }
      this.mapObjects.push(sprite, nameLabel, bubble);
      this.npcs.push({ def: n, sprite, bubble });
    }

    // 扉
    for (const d of map.doors) {
      const img = this.add.image(d.x, d.y, "door").setDepth(-5);
      const label = this.add
        .text(d.x, d.y - 56, d.label, { fontSize: "13px", color: "#3a3530", stroke: "#f5efe0", strokeThickness: 4 })
        .setOrigin(0.5, 1);
      this.mapObjects.push(img, label);
      this.doors.push({ def: d, zone: new Phaser.Geom.Rectangle(d.x - 30, d.y - 50, 60, 100) });
    }

    if (this.me) {
      this.collider = this.physics.add.collider(this.me, this.platforms);
    }
    this.refreshVisibility();
  }

  /** 敵・他プレイヤーの表示/非表示を現在ページに合わせる */
  private refreshVisibility() {
    for (const r of this.remotes.values()) {
      const visible = r.state.mapId === this.currentMapId && !r.state.dead;
      r.sprite.setVisible(visible);
      r.label.setVisible(visible);
    }
    for (const e of this.enemies.values()) {
      const visible = e.state.mapId === this.currentMapId && !e.state.dead;
      e.sprite.setVisible(visible);
      e.label.setVisible(visible);
      e.hpBar.setVisible(visible);
    }
  }

  // ============ 通信 ============

  private async connect() {
    // サーバーの場所（優先順）:
    //  1. ?server=<ホスト名> 指定があればそこへ（トンネル・テスト用の上書き、wss接続）
    //  2. デプロイ先（localhost/LAN以外）なら本番サーバー PROD_SERVER_HOST（fly.io）へ
    //     → これで固定URLが ?server 無しでも繋がる
    //  3. localhost/LAN ならローカルサーバー（同ホストの :2567）へ＝開発用
    const serverParam = new URLSearchParams(location.search).get("server");
    const host = location.hostname;
    const isLocalDev =
      host === "localhost" || host === "127.0.0.1" || /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    const endpoint = serverParam
      ? `wss://${serverParam}`
      : !isLocalDev && PROD_SERVER_HOST
      ? `wss://${PROD_SERVER_HOST}`
      : `${location.protocol === "https:" ? "wss" : "ws"}://${host}:2567`;
    const client = new Client(endpoint);
    const keyword = getKeyword();
    const profile = getProfile();
    const joinOpts = {
      ...getIdentity(),
      keyword,
      ...(profile.name ? { name: profile.name } : {}),
      ...(profile.charIdx >= 0 ? { charIdx: profile.charIdx } : {}),
    };
    let room: Room;
    try {
      room = await client.joinOrCreate("world", joinOpts);
    } catch (e) {
      // 認証不整合（サーバーデータ消去後・別端末で重複ログイン等）の時だけIDを作り直す。
      // サーバーダウン等の通信エラーでデータを捨てないこと！
      const msg = String((e as any)?.message ?? e);
      if (msg.includes("auth_mismatch")) {
        console.warn("auth mismatch — IDを作り直して再入室:", e);
        resetIdentity();
        room = await client.joinOrCreate("world", { ...joinOpts, ...getIdentity() });
      } else {
        throw e;
      }
    }
    this.room = room;

    // 引き継ぎコード表示（クリックでコピー）
    const codeBtn = this.add
      .text(this.scale.width - 10, 10, "ひきつぎコード", {
        fontSize: "13px",
        color: "#6b6257",
        backgroundColor: "#ffffffaa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(2000)
      .setInteractive({ useHandCursor: true });
    codeBtn.on("pointerdown", () => {
      const code = transferCode(getIdentity());
      const url = `${location.origin}/?code=${code}`;
      navigator.clipboard?.writeText(url).then(
        () => this.floatText("コピーしたよ！別の端末で開いてね", codeBtn.x - 80, 60, "#3a3530", 14),
        () => window.prompt("このURLを別の端末で開くと引き継げるよ", url)
      );
    });
    this.scale.on("resize", () => codeBtn.setPosition(this.scale.width - 10, 10));

    // あいことば表示＆変更ボタン
    const kwBtn = this.add
      .text(this.scale.width - 10, 36, `あいことば: ${keyword}`, {
        fontSize: "13px",
        color: "#6b6257",
        backgroundColor: "#ffffffaa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(2000)
      .setInteractive({ useHandCursor: true });
    kwBtn.on("pointerdown", () => {
      const next = window.prompt("あいことばを入れてね。\n友達と同じあいことばにすると、同じ世界で遊べるよ（最大4人）", keyword);
      if (next && next.trim() && next.trim() !== keyword) {
        setKeyword(next.trim());
        window.location.reload();
      }
    });
    this.scale.on("resize", () => kwBtn.setPosition(this.scale.width - 10, 36));
    const $ = getStateCallbacks(room);

    $(room.state).players.onAdd((player: any, sessionId: string) => {
      if (sessionId === room.sessionId) {
        this.myState = player;
        this.buildMap(MAPS[player.mapId]);
        this.spawnMe(player);
      } else {
        this.spawnRemote(sessionId, player);
        $(player).onChange(() => {
          const r = this.remotes.get(sessionId);
          if (!r) return;
          r.targetX = player.x;
          r.targetY = player.y;
          r.sprite.setFlipX(player.flip);
          this.refreshVisibility();
        });
      }
      this.updateHudText();
    });

    $(room.state).players.onRemove((_p: any, sessionId: string) => {
      const r = this.remotes.get(sessionId);
      if (r) {
        r.sprite.destroy();
        r.label.destroy();
        this.remotes.delete(sessionId);
      }
      this.updateHudText();
    });

    $(room.state).enemies.onAdd((enemy: any, enemyId: string) => {
      this.spawnEnemy(enemyId, enemy);
      $(enemy).onChange(() => {
        const e = this.enemies.get(enemyId);
        if (!e) return;
        e.targetX = enemy.x;
        e.targetY = enemy.y;
        e.sprite.setFlipX(!enemy.flip); // 素材が左向きなので反転
        this.drawEnemyHp(e);
        this.refreshVisibility();
      });
    });

    // ===== 戦闘イベント =====
    room.onMessage("hit", (m: { enemyId: string; dmg: number; by: string; x: number; y: number }) => {
      const e = this.enemies.get(m.enemyId);
      if (e && e.state.mapId === this.currentMapId) {
        this.floatText(`-${m.dmg}`, e.sprite.x, e.sprite.y - 30, "#c0392b", 18);
        const sx = e.sprite.scaleX;
        this.tweens.add({ targets: e.sprite, scaleX: sx * 1.25, scaleY: sx * 0.8, duration: 70, yoyo: true });
        sfx.hit();
      }
    });

    room.onMessage("exp", (m: { sessionId: string; amount: number }) => {
      if (m.sessionId === room.sessionId && this.me) {
        this.floatText(`+${m.amount} EXP`, this.me.x, this.me.y - 50, "#b8860b");
      } else {
        const r = this.remotes.get(m.sessionId);
        if (r && r.sprite.visible) this.floatText(`+${m.amount}`, r.sprite.x, r.sprite.y - 50, "#b8860b");
      }
    });

    room.onMessage("levelup", (m: { sessionId: string; level: number }) => {
      const target = m.sessionId === room.sessionId ? this.me : this.remotes.get(m.sessionId)?.sprite;
      if (!target || !(target as any).visible) return;
      const tx = (target as any).x;
      const ty = (target as any).y;
      // 金色のリング＋きらきら＋ファンファーレ
      const ring = this.add.circle(tx, ty, 20, 0xffd700, 0).setStrokeStyle(5, 0xffd700, 0.9).setDepth(400);
      this.tweens.add({ targets: ring, radius: 110, alpha: 0, duration: 700, ease: "Cubic.Out", onComplete: () => ring.destroy() });
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const star = this.add.text(tx, ty - 20, "✦", { fontSize: "18px", color: "#ffd700" }).setOrigin(0.5).setDepth(400);
        this.tweens.add({
          targets: star, x: tx + Math.cos(a) * 90, y: ty - 20 + Math.sin(a) * 70 - 40,
          alpha: 0, duration: 800, ease: "Cubic.Out", onComplete: () => star.destroy(),
        });
      }
      this.floatText(`⭐ LEVEL UP! Lv${m.level} ⭐`, tx, ty - 84, "#d4720a", 24);
      if (m.sessionId === room.sessionId) {
        this.cameras.main.flash(300, 255, 240, 160);
        this.banner(`⬆ LEVEL UP!! ⬆\nLv${m.level} になった！ スキルポイント+3\n（✨SPボタンで強化できるよ）`, "#fff8e7", "#b8860b");
        sfx.levelup();
      }
    });

    room.onMessage("playerHit", (m: { sessionId: string; dmg: number }) => {
      if (m.sessionId === room.sessionId && this.me) {
        this.floatText(`-${m.dmg}`, this.me.x, this.me.y - 40, "#c0392b");
        this.cameras.main.shake(120, 0.004);
        sfx.hurt();
        this.me.setTintFill(0xff6666);
        this.time.delayedCall(120, () => this.me?.setTint(this.heroVariant(this.myState.colorIdx).tint));
      }
    });

    room.onMessage("died", (m: { sessionId: string }) => {
      if (m.sessionId === room.sessionId) {
        this.deadOverlay = this.add
          .text(this.scale.width / 2, this.scale.height / 2, "たおれた…\nもくじ広場で ふっかつするよ", {
            fontSize: "26px",
            color: "#ffffff",
            backgroundColor: "#3a3530dd",
            padding: { x: 24, y: 16 },
            align: "center",
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(3000);
      }
      this.refreshVisibility();
    });

    room.onMessage("jobChosen", (m: { sessionId: string; job: string }) => {
      const job = JOBS[m.job];
      if (m.sessionId === room.sessionId) {
        this.closeJobOverlay();
        this.touch.setHealVisible(isHealer(m.job));
        if (this.me) this.floatText(`${job?.emoji} ${job?.name}に てんしょく！`, this.me.x, this.me.y - 80, "#7b3fa0", 20);
        if (this.myLabel) this.myLabel.setText(this.labelText(this.myState.name, m.job, true));
        this.myLabelJob = m.job;
      } else {
        const r = this.remotes.get(m.sessionId);
        if (r) {
          r.label.setText(this.labelText(r.state.name, m.job, false));
          if (r.sprite.visible) this.floatText(`${job?.emoji} てんしょく！`, r.sprite.x, r.sprite.y - 60, "#7b3fa0");
        }
      }
    });

    room.onMessage("healed", (m: { by: string; x: number; y: number; targets: { sessionId: string; amount: number }[] }) => {
      const healer = m.by === room.sessionId ? this.me : this.remotes.get(m.by)?.sprite;
      if (healer && (healer as any).visible !== false) {
        const circle = this.add.circle((healer as any).x, (healer as any).y, 30, 0x6bcb77, 0.25).setDepth(150);
        this.tweens.add({ targets: circle, radius: 140, alpha: 0, duration: 450, onComplete: () => circle.destroy() });
      }
      for (const t of m.targets) {
        const target = t.sessionId === room.sessionId ? this.me : this.remotes.get(t.sessionId)?.sprite;
        if (target) this.floatText(`+${t.amount}`, (target as any).x, (target as any).y - 40, "#2e7d32");
      }
    });

    // 技コピー: 発動演出（自分・他人どちらも）
    room.onMessage("sketchCast", (m: { by: string; kind: string; type: string; x: number; y: number; flip: boolean }) => {
      const def = SKETCHES[m.kind];
      if (!def) return;
      // 別マップの発動は描かない
      const caster = m.by === room.sessionId ? this.me : this.remotes.get(m.by)?.sprite;
      if (caster && (caster as any).visible === false) return;
      this.sketchVfx(def.type, m.x, m.y, m.flip);
    });

    // 技コピー: 新しいスケッチを覚えた
    room.onMessage("sketchLearned", (m: { sessionId: string; kind: string }) => {
      if (m.sessionId !== room.sessionId) return;
      const def = SKETCHES[m.kind];
      if (!def) return;
      this.banner(`✨ スケッチを おぼえた！\n${def.emoji}「${def.name}」`, "#f3e9ff", "#5a2d77");
      sfx.questClear();
    });

    // コイン獲得（自分の分だけ表示してクラッタを抑える）
    room.onMessage("coin", (m: { sessionId: string; amount: number }) => {
      if (m.sessionId !== room.sessionId || !this.me) return;
      this.floatText(`+${m.amount}🪙`, this.me.x + 14, this.me.y - 30, "#d4a017", 14);
    });

    // ポーション使用（回復演出）
    room.onMessage("potionUsed", (m: { sessionId: string; amount: number }) => {
      const who = m.sessionId === room.sessionId ? this.me : this.remotes.get(m.sessionId)?.sprite;
      if (!who || (who as any).visible === false) return;
      const circle = this.add.circle((who as any).x, (who as any).y, 24, 0x6bcb77, 0.3).setDepth(150);
      this.tweens.add({ targets: circle, radius: 90, alpha: 0, duration: 380, onComplete: () => circle.destroy() });
      this.floatText(`+${m.amount}`, (who as any).x, (who as any).y - 40, "#2e7d32");
      if (m.sessionId === room.sessionId) sfx.heal();
    });

    room.onMessage("questAccepted", (m: { sessionId: string; questId: string }) => {
      if (m.sessionId !== room.sessionId || !this.me) return;
      const q = QUESTS[m.questId];
      this.banner(`📜 クエストをうけた！\n「${q?.title ?? ""}」`, "#fff8e7", "#3a6b35");
      sfx.accept();
    });

    room.onMessage("questReady", (m: { sessionId: string; questId: string }) => {
      if (m.sessionId !== room.sessionId || !this.me) return;
      const q = QUESTS[m.questId];
      this.banner(`✅ 「${q?.title ?? ""}」たっせい！\nしおりの妖精に ほうこくしよう`, "#fff8e7", "#7b5226");
      sfx.questClear();
    });

    room.onMessage("questClear", (m: { sessionId: string; questId: string; rewardExp: number }) => {
      if (m.sessionId !== room.sessionId || !this.me) return;
      const q = QUESTS[m.questId];
      this.banner(`🎉 クエストクリア！\n「${q?.title ?? ""}」 +${m.rewardExp} EXP`, "#fff8e7", "#1e7d32");
      this.cameras.main.flash(250, 220, 255, 220);
      sfx.questClear();
    });

    room.onMessage("respawn", (m: { sessionId: string }) => {
      if (m.sessionId === room.sessionId) {
        this.deadOverlay?.destroy();
        this.deadOverlay = undefined;
      }
      this.refreshVisibility();
    });
  }

  // ============ スポーン ============

  private labelText(name: string, job: string, isMe: boolean) {
    const emoji = JOBS[job]?.emoji ?? "";
    return `${emoji}${name}${isMe ? "（じぶん）" : ""}`;
  }

  private spawnMe(player: any) {
    const v = this.heroVariant(player.colorIdx);
    this.me = this.physics.add.sprite(player.x, player.y, `hero_${v.sheet}_idle`);
    this.me.setTint(v.tint);
    this.me.setScale(1.85); // メイプル級の大きさ
    this.me.setCollideWorldBounds(true);
    // スプライトは48×64フレームのうち実体が縦18〜43行目（下21pxは透明）。
    // bodyの底＝足(43行目)に合わせて、地面・足場に足がぴったり乗るようにする。
    this.me.body!.setSize(22, 25);
    (this.me.body as Phaser.Physics.Arcade.Body).setOffset(13, 18);
    this.collider = this.physics.add.collider(this.me, this.platforms!);
    this.myLabel = this.makeLabel(this.labelText(player.name, player.job, true));
    this.myLabelJob = player.job;
    this.touch.setHealVisible(isHealer(player.job));
    this.cameras.main.startFollow(this.me, true, 0.12, 0.12);
  }

  private spawnRemote(sessionId: string, player: any) {
    const v = this.heroVariant(player.colorIdx);
    const sprite = this.add.sprite(player.x, player.y, `hero_${v.sheet}_idle`).setAlpha(0.95);
    sprite.setTint(v.tint);
    sprite.setScale(1.85);
    const label = this.makeLabel(this.labelText(player.name, player.job, false));
    this.remotes.set(sessionId, { sprite, label, state: player, targetX: player.x, targetY: player.y });
    this.refreshVisibility();
  }

  // ============ 転職UI ============

  private showJobOverlay(options: ReturnType<typeof availableJobs>) {
    if (this.jobOverlay || options.length === 0) return;
    const w = Math.min(this.scale.width - 32, 420);
    const cx = this.scale.width / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];

    const backdrop = this.add
      .rectangle(cx, this.scale.height / 2, this.scale.width, this.scale.height, 0x3a3530, 0.55)
      .setScrollFactor(0)
      .setDepth(4000)
      .setInteractive(); // 背面クリックを遮断
    objs.push(backdrop);

    const tier = options[0].tier;
    const titleText =
      tier === 1
        ? "✨ てんしょくのとき！ ✨\nすきな職業を えらんでね（あとから変えられないよ）"
        : `✨ ${tier}次転職！ ✨\nどっちの道に すすむ？（あとから変えられないよ）`;
    const title = this.add
      .text(cx, 56, titleText, {
        fontSize: "16px",
        color: "#fff8e7",
        align: "center",
        fontStyle: "bold",
        wordWrap: { width: this.scale.width - 24 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(4001);
    objs.push(title);

    options.forEach((job, i) => {
      const y = 130 + i * 86;
      const btn = this.add
        .text(cx, y, `${job.emoji} ${job.name}\n${job.desc}`, {
          fontSize: "14px",
          color: "#3a3530",
          backgroundColor: "#fff8e7",
          padding: { x: 14, y: 10 },
          wordWrap: { width: w - 28 },
          fixedWidth: w,
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(4001)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerover", () => btn.setBackgroundColor("#ffe9b8"));
      btn.on("pointerout", () => btn.setBackgroundColor("#fff8e7"));
      btn.on("pointerdown", () => this.room?.send("chooseJob", { job: job.id }));
      objs.push(btn);
    });

    this.jobOverlay = objs;
  }

  private closeJobOverlay() {
    if (!this.jobOverlay) return;
    for (const o of this.jobOverlay) o.destroy();
    this.jobOverlay = undefined;
  }

  private spawnEnemy(enemyId: string, enemy: any) {
    const sprite = this.add.sprite(enemy.x, enemy.y, ENEMY_TEXTURES[enemy.kind] ?? "enemy_makimaki");
    sprite.setScale(enemy.boss ? 2.0 : 1.3); // キャラ拡大に合わせて敵も大きく
    const kindName = ENEMY_KINDS[enemy.kind]?.name ?? "ラクガキ";
    const label = this.add
      .text(enemy.x, enemy.y - 26, `${kindName} Lv${enemy.level}`, {
        fontSize: "12px",
        color: "#3a3530",
        stroke: "#ffffff",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1);
    const hpBar = this.add.graphics();
    const entry: EnemyEntry = { sprite, label, hpBar, state: enemy, targetX: enemy.x, targetY: enemy.y };
    this.enemies.set(enemyId, entry);
    this.drawEnemyHp(entry);
    this.refreshVisibility();
  }

  private drawEnemyHp(e: EnemyEntry) {
    const w = e.state.boss ? 56 : 36;
    e.hpBar.clear();
    e.hpBar.fillStyle(0x000000, 0.25);
    e.hpBar.fillRect(-w / 2, 0, w, 5);
    e.hpBar.fillStyle(0x6bcb77, 1);
    e.hpBar.fillRect(-w / 2, 0, w * Math.max(0, e.state.hp / e.state.maxHp), 5);
  }

  private makeLabel(text: string) {
    return this.add
      .text(0, 0, text, { fontSize: "13px", color: "#3a3530", stroke: "#ffffff", strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setDepth(100);
  }

  /** 4人分のキャラバリエーション（男女×色味） */
  private heroVariant(colorIdx: number) {
    const variants = [
      { sheet: "f", tint: 0xffffff }, // 紫髪の女の子
      { sheet: "m", tint: 0xffffff }, // 紫髪の男の子
      { sheet: "f2", tint: 0xffffff }, // 赤毛の女の子
      { sheet: "m2", tint: 0xffffff }, // 金髪の男の子
    ];
    return variants[colorIdx % 4];
  }

  /** プレイヤーのアニメ適用（自分・他人共通） */
  private applyHeroAnim(sprite: Phaser.GameObjects.Sprite, colorIdx: number, anim: string) {
    const v = this.heroVariant(colorIdx);
    if (anim === "jump") {
      sprite.anims.stop();
      sprite.setTexture(`hero_${v.sheet}_jump`, 3); // 空中フレームで固定
    } else if (anim === "walk" || anim === "climb") {
      sprite.play(`anim_${v.sheet}_walk`, true);
    } else {
      sprite.play(`anim_${v.sheet}_idle`, true);
    }
  }

  private stopClimb() {
    if (!this.me) return;
    this.climbing = false;
    const body = this.me.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);
    body.checkCollision.none = false;
  }

  // ============ HUD ============

  private updateHudText() {
    if (!this.room || !this.myState) return;
    const count = this.room.state.players.size;
    const map = MAPS[this.currentMapId];
    const jobName = JOBS[this.myState.job]?.name ?? "みならい";
    this.hud.setText(`${map?.name ?? ""} ｜ ${jobName} Lv${this.myState.level} ｜ ${count}/4にん`);

    const q = QUESTS[this.myState.questId];
    const phase = this.myState.questPhase;
    let questText: string;
    if (!q) {
      questText = "📜 クエスト ぜんぶクリア！じゆうに たんけんしよう";
    } else if (phase === "idle") {
      questText = `📜 しおりの妖精から クエストをうけよう\n（つぎ:「${q.title}」）`;
    } else if (phase === "ready") {
      questText = `✅ 「${q.title}」たっせい！\nしおりの妖精に ほうこくしよう`;
    } else {
      questText = `📜 ${q.title}（${this.myState.questProgress}/${q.targetCount}）\n${q.text}`;
    }
    this.questPanel.setText(questText);

    // SPボタン（ポイントがある時だけ表示）
    if (this.spBtn) {
      const has = this.myState.sp > 0;
      this.spBtn.setVisible(has);
      if (has) this.spBtn.setText(`✨SP ${this.myState.sp}`);
    }

    // スケッチボタン（1つでも覚えていたら表示。装備中の技名を出す）
    if (this.sketchBtn) {
      const known = parseSketchBook(this.myState.sketchBook).length;
      this.sketchBtn.setVisible(known > 0);
      const eq = SKETCHES[this.myState.equippedSketch];
      this.sketchBtn.setText(eq ? `${eq.emoji}${eq.name}▼` : `📕スケッチ ${known}`);
    }

    // スマホのとくぎボタンは装備がある時だけ
    this.touch.setSketchVisible(!!SKETCHES[this.myState.equippedSketch]);
    // ポーションボタンは所持がある時だけ
    this.touch.setPotionVisible(this.myState.potions > 0);
  }

  private drawBars() {
    if (!this.myState) return;
    const g = this.bars;
    const x = 12, y = this.scale.height - 56, w = 220;
    g.clear();
    // HP
    g.fillStyle(0x000000, 0.2);
    g.fillRoundedRect(x, y, w, 16, 5);
    g.fillStyle(0xe05c5c, 1);
    g.fillRoundedRect(x, y, w * Math.max(0, this.myState.hp / this.myState.maxHp), 16, 5);
    // EXP
    g.fillStyle(0x000000, 0.2);
    g.fillRoundedRect(x, y + 22, w, 10, 4);
    g.fillStyle(0xd4a017, 1);
    g.fillRoundedRect(x, y + 22, w * Math.min(1, this.myState.exp / this.myState.expToNext), 10, 4);
    // 数値表示
    if (this.barText) {
      this.barText.setPosition(x + 6, y + 1);
      this.barText.setText(
        `HP ${this.myState.hp}/${this.myState.maxHp}   EXP ${this.myState.exp}/${this.myState.expToNext}   🪙${this.myState.coins} 🧪${this.myState.potions}`
      );
    }
    // ボタン配置: スケッチ＝上段、ショップ＝下段、SP＝スケッチの右（出てる時）
    this.sketchBtn?.setPosition(x + w + 12, y - 2);
    this.shopBtn?.setPosition(x + w + 12, y + 24);
    this.spBtn?.setPosition(x + w + 130, y - 2);
  }

  /** SP振り分けパネル */
  private toggleSpPanel() {
    if (this.spPanel) {
      for (const o of this.spPanel) o.destroy();
      this.spPanel = undefined;
      return;
    }
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const bgPanel = this.add
      .rectangle(cx, cy, Math.min(this.scale.width - 30, 340), 280, 0x3a3530, 0.92)
      .setScrollFactor(0)
      .setDepth(4500)
      .setInteractive();
    objs.push(bgPanel);
    const title = this.add
      .text(cx, cy - 118, "✨ スキルポイントを ふりわける", { fontSize: "16px", color: "#fff8e7", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(4501);
    objs.push(title);

    // 職業系統ごとの固有強化
    let j = JOBS[this.myState.job];
    while (j?.parent) j = JOBS[j.parent];
    const root = j?.id ?? "novice";
    const specDef: Record<string, () => string> = {
      pencil: () => `🗡 リーチ +5（いま:+${this.myState.statSpec * 5}）`,
      ink: () => `🎯 飛距離 +12（いま:+${this.myState.statSpec * 12}）`,
      crayon: () => `🛡 被ダメ -3%（いま:-${this.myState.statSpec * 3}%）`,
      palette: () => `💖 回復量 +1.2%（いま:+${(this.myState.statSpec * 1.2).toFixed(1)}%）`,
    };

    const rows: { stat: string; label: () => string }[] = [
      { stat: "atk", label: () => `⚔ こうげき +4%（いま:+${this.myState.statAtk * 4}%）` },
      { stat: "hp", label: () => `❤ さいだいHP +15（いま:+${this.myState.statHp * 15}）` },
      { stat: "spd", label: () => `👟 いどう +2%（いま:+${this.myState.statSpd * 2}%）` },
    ];
    if (specDef[root]) rows.push({ stat: "spec", label: specDef[root] });
    rows.forEach((r, i) => {
      const btn = this.add
        .text(cx, cy - 80 + i * 44, r.label(), {
          fontSize: "14px",
          color: "#3a3530",
          backgroundColor: "#fff8e7",
          padding: { x: 12, y: 8 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(4501)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () => {
        if (this.myState.sp <= 0) return;
        this.room?.send("spendSp", { stat: r.stat });
        sfx.spend();
        this.time.delayedCall(120, () => btn.setText(r.label()));
      });
      objs.push(btn);
    });

    const close = this.add
      .text(cx, cy + 114, "とじる", {
        fontSize: "14px",
        color: "#fff8e7",
        backgroundColor: "#6b6257",
        padding: { x: 16, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(4501)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => this.toggleSpPanel());
    objs.push(close);

    this.spPanel = objs;
  }

  /** スケッチブック（技コピー図鑑＝覚えた技から1つ装備する） */
  private toggleSketchBook() {
    if (this.sketchOverlay) {
      for (const o of this.sketchOverlay) o.destroy();
      this.sketchOverlay = undefined;
      return;
    }
    this.closeSpPanelIfOpen();
    const learned = parseSketchBook(this.myState.sketchBook);
    const cx = this.scale.width / 2;
    const top = 40;
    const w = Math.min(this.scale.width - 24, 440);
    const objs: Phaser.GameObjects.GameObject[] = [];

    const backdrop = this.add
      .rectangle(cx, this.scale.height / 2, this.scale.width, this.scale.height, 0x2a2438, 0.78)
      .setScrollFactor(0).setDepth(4500).setInteractive();
    objs.push(backdrop);

    // 職業系統ごとのコピーの味付けヒント
    let j = JOBS[this.myState.job];
    while (j?.parent) j = JOBS[j.parent];
    const root = j?.id ?? "novice";
    const flavor: Record<string, string> = {
      pencil: "✏️エンピツ系：とくぎの威力UP",
      ink: "🖋️インク系：とくぎの射程・範囲UP",
      crayon: "🖍️クレヨン系：とくぎ発動で自分にガード",
      palette: "🎨パレット系：とくぎで周囲も回復",
      novice: "転職するととくぎが系統別に変化するよ",
    };
    const learnedSet = new Set(learned);
    const all = Object.values(SKETCHES);
    const head = this.add
      .text(cx, top, `📕 スケッチ図鑑　${learnedSet.size}/${all.length}\n${flavor[root] ?? flavor.novice}`, {
        fontSize: "15px", color: "#fff8e7", align: "center", fontStyle: "bold",
        wordWrap: { width: w - 20 },
      })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(4501);
    objs.push(head);

    // 全スケッチを並べ、未収集は「？？？」＋入手元の敵名ヒント（コンプ欲）
    all.forEach((def, i) => {
      const y = top + 66 + i * 56;
      const got = learnedSet.has(def.kind);
      const isEq = got && this.myState.equippedSketch === def.kind;
      const enemyName = ENEMY_KINDS[def.kind]?.name ?? "なぞのラクガキ";
      const label = got
        ? `${isEq ? "▶ " : ""}${def.emoji} ${def.name}\n${def.desc}`
        : `❓ ？？？\n（${enemyName}を たおすと おぼえる）`;
      const btn = this.add
        .text(cx, y, label, {
          fontSize: "13px",
          color: got ? (isEq ? "#fffbe6" : "#3a3530") : "#7c7689",
          backgroundColor: got ? (isEq ? "#7b3fa0" : "#fff8e7") : "#d2ccdb",
          padding: { x: 12, y: 7 },
          wordWrap: { width: w - 40 },
          fixedWidth: w,
          align: "left",
        })
        .setOrigin(0.5, 0).setScrollFactor(0).setDepth(4501);
      if (got) {
        btn.setInteractive({ useHandCursor: true });
        btn.on("pointerdown", () => {
          this.room?.send("equipSketch", { kind: def.kind });
          sfx.accept();
          this.time.delayedCall(160, () => this.refreshSketchBook()); // サーバー反映を待って開き直す
        });
      }
      objs.push(btn);
    });

    const close = this.add
      .text(cx, this.scale.height - 44, "とじる", {
        fontSize: "14px", color: "#fff8e7", backgroundColor: "#6b6257", padding: { x: 18, y: 7 },
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(4501)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => this.toggleSketchBook());
    objs.push(close);

    this.sketchOverlay = objs;
  }

  /** 装備変更後にスケッチブックを開き直して反映 */
  private refreshSketchBook() {
    if (!this.sketchOverlay) return;
    this.toggleSketchBook(); // 閉じる
    this.toggleSketchBook(); // 開き直す
  }

  private closeSpPanelIfOpen() {
    if (this.spPanel) {
      for (const o of this.spPanel) o.destroy();
      this.spPanel = undefined;
    }
  }

  /** ショップ（ポーション購入） */
  private toggleShop() {
    if (this.shopOverlay) {
      for (const o of this.shopOverlay) o.destroy();
      this.shopOverlay = undefined;
      return;
    }
    this.closeSpPanelIfOpen();
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const backdrop = this.add
      .rectangle(cx, cy, this.scale.width, this.scale.height, 0x1f2a26, 0.8)
      .setScrollFactor(0).setDepth(4500).setInteractive();
    objs.push(backdrop);

    const title = this.add
      .text(cx, cy - 130, `🛒 えのぐ屋さん\nもってるコイン: 🪙${this.myState.coins}`, {
        fontSize: "16px", color: "#fff8e7", align: "center", fontStyle: "bold",
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(4501);
    objs.push(title);

    const COST = 40; // サーバーの POTION_COST と合わせる
    const canBuy = this.myState.coins >= COST;
    const buy = this.add
      .text(cx, cy - 40, `🧪 ポーション（HP40%かいふく）\nねだん: 🪙${COST}　もちもの: ${this.myState.potions}こ`, {
        fontSize: "14px",
        color: canBuy ? "#234d3f" : "#7a8a82",
        backgroundColor: canBuy ? "#d8f0e6" : "#c2ccc7",
        padding: { x: 14, y: 10 },
        align: "center",
        fixedWidth: Math.min(this.scale.width - 40, 360),
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(4501);
    if (canBuy) {
      buy.setInteractive({ useHandCursor: true });
      buy.on("pointerdown", () => {
        this.room?.send("buyPotion");
        sfx.spend();
        this.time.delayedCall(160, () => this.refreshShop());
      });
    }
    objs.push(buy);

    const hint = this.add
      .text(cx, cy + 40, "ポーションは Pキー / 🧪ボタン で使えるよ\n（コインは てきを たおすと もらえる）", {
        fontSize: "12px", color: "#cfe5da", align: "center",
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(4501);
    objs.push(hint);

    const close = this.add
      .text(cx, cy + 110, "とじる", {
        fontSize: "14px", color: "#fff8e7", backgroundColor: "#6b6257", padding: { x: 18, y: 7 },
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(4501)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => this.toggleShop());
    objs.push(close);

    this.shopOverlay = objs;
  }

  private refreshShop() {
    if (!this.shopOverlay) return;
    this.toggleShop(); // 閉じる
    this.toggleShop(); // 開き直す（コイン・所持数を反映）
  }

  /** 技コピーの発動演出（タイプ別） */
  private sketchVfx(type: string, x: number, y: number, flip: boolean) {
    const dir = flip ? -1 : 1;
    const D = 210;
    if (type === "dash") {
      const c = this.add.circle(x, y, 16, 0xffe08a, 0.9).setDepth(D);
      this.tweens.add({ targets: c, x: x + dir * 130, angle: 720, alpha: 0, duration: 280, onComplete: () => c.destroy() });
    } else if (type === "aoe") {
      const ring = this.add.circle(x, y, 20, 0x4a2d6b, 0.45).setDepth(D);
      this.tweens.add({ targets: ring, radius: 135, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
    } else if (type === "dot") {
      for (let i = 0; i < 8; i++) {
        const puff = this.add.circle(x + dir * (30 + Math.random() * 130), y - 20 + Math.random() * 40, 10 + Math.random() * 10, 0x8fbf6a, 0.6).setDepth(D);
        this.tweens.add({ targets: puff, alpha: 0, y: puff.y - 16, duration: 1400 + Math.random() * 500, onComplete: () => puff.destroy() });
      }
    } else if (type === "stun") {
      const press = this.add.rectangle(x + dir * 60, y, 90, 50, 0xffffff, 0.7).setDepth(D);
      this.tweens.add({ targets: press, scaleX: 1.4, alpha: 0, duration: 260, onComplete: () => press.destroy() });
      this.floatText("ドンッ！", x + dir * 70, y - 40, "#5a2d77", 16);
    } else if (type === "sweep") {
      const arc = this.add.ellipse(x + dir * 40, y, 60, 150, 0x222222, 0.5).setDepth(D);
      this.tweens.add({ targets: arc, scaleX: 2.6, alpha: 0, x: x + dir * 110, duration: 280, onComplete: () => arc.destroy() });
    } else if (type === "buff") {
      const bub = this.add.circle(x, y - 6, 30, 0x6fd0ff, 0.3).setStrokeStyle(3, 0x3aa0e0, 0.8).setDepth(D);
      this.tweens.add({ targets: bub, scale: 1.4, alpha: 0, duration: 900, onComplete: () => bub.destroy() });
      this.floatText("🛡シールド", x, y - 50, "#2a72b0", 15);
    } else if (type === "smash") {
      const impact = this.add.star(x + dir * 70, y, 8, 14, 40, 0xffcaa0, 0.9).setDepth(D);
      this.tweens.add({ targets: impact, scale: 2.2, alpha: 0, angle: 90, duration: 320, onComplete: () => impact.destroy() });
      this.cameras.main.shake(140, 0.006);
    }
  }

  /** 画面中央のお知らせバナー（クエスト受注・クリアなど） */
  private banner(text: string, color: string, bg: string) {
    const t = this.add
      .text(this.scale.width / 2, this.scale.height * 0.3, text, {
        fontSize: "19px",
        color,
        backgroundColor: bg + "ee",
        padding: { x: 20, y: 12 },
        align: "center",
        fontStyle: "bold",
        wordWrap: { width: this.scale.width - 40 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3500)
      .setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: "Back.Out" });
    this.time.delayedCall(2200, () =>
      this.tweens.add({ targets: t, alpha: 0, y: t.y - 24, duration: 350, onComplete: () => t.destroy() })
    );
  }

  private floatText(text: string, x: number, y: number, color: string, size = 16) {
    const t = this.add
      .text(x, y, text, { fontSize: `${size}px`, color, stroke: "#f5efe0", strokeThickness: 4, fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(500);
    this.tweens.add({ targets: t, y: y - 44, alpha: 0, duration: 900, ease: "Cubic.Out", onComplete: () => t.destroy() });
  }

  // ============ メインループ ============

  update(_time: number, delta: number) {
    // 他プレイヤー・敵の補間
    for (const r of this.remotes.values()) {
      r.sprite.x += (r.targetX - r.sprite.x) * 0.35;
      r.sprite.y += (r.targetY - r.sprite.y) * 0.35;
      r.label.setPosition(r.sprite.x, r.sprite.y - 66);
      this.applyHeroAnim(r.sprite, r.state.colorIdx, r.state.anim);
    }
    for (const e of this.enemies.values()) {
      e.sprite.x += (e.targetX - e.sprite.x) * 0.35;
      e.sprite.y += (e.targetY - e.sprite.y) * 0.35;
      const half = e.sprite.displayHeight / 2;
      e.label.setPosition(e.sprite.x, e.sprite.y - half - 8);
      e.hpBar.setPosition(e.sprite.x, e.sprite.y - half - 6);
    }

    if (!this.me || !this.room || !this.myState) return;

    // サーバー側でページ移動（扉・死亡リスポーン）が起きたら追従する
    if (this.myState.mapId !== this.currentMapId) {
      this.stopClimb();
      this.buildMap(MAPS[this.myState.mapId]);
      this.me.setPosition(this.myState.x, this.myState.y);
      (this.me.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.updateHudText();
    }

    this.drawBars();
    this.updateHudText();

    if (this.myState.dead) {
      this.me.setVelocityX(0);
      this.me.setAlpha(0.3);
      return;
    }
    this.me.setAlpha(1);

    // 転職可能になったら転職画面を出す（1次Lv10/2次Lv30/3次Lv60/4次Lv90）
    if (!this.jobOverlay) {
      const options = availableJobs(this.myState.job, this.myState.level);
      if (options.length > 0) this.showJobOverlay(options);
    }

    // ===== 入力 =====
    const body = this.me.body as Phaser.Physics.Arcade.Body;
    const speed = MOVE_SPEED * (1 + (this.myState.statSpd ?? 0) * 0.02); // SPの素早さ反映
    let vx = 0;
    if (this.cursors.left.isDown || this.keys.a.isDown) vx = -speed;
    else if (this.cursors.right.isDown || this.keys.d.isDown) vx = speed;
    if (this.touch.enabled && this.touch.moveX !== 0) vx = speed * this.touch.moveX;

    const upHeld = this.cursors.up.isDown || this.keys.w.isDown || this.touch.moveY < -0.45;
    const downHeld = this.cursors.down.isDown || this.keys.s.isDown || this.touch.moveY > 0.45;
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keys.w) ||
      Phaser.Input.Keyboard.JustDown(this.keys.space) ||
      this.touch.consumeJump();

    // ===== はしご =====
    const ladder = this.ladders.find(
      (l) => Math.abs(this.me!.x - l.x) < 18 && this.me!.y > l.y1 - 26 && this.me!.y < l.y2 + 10
    );
    if (!this.climbing && ladder) {
      // 上入力でつかまる。足場の上に立っている時は下入力でも降りられる
      const grabDown = downHeld && (!body.blocked.down || this.me.y < ladder.y1);
      if (upHeld || grabDown) {
        this.climbing = true;
        body.setAllowGravity(false);
        body.checkCollision.none = true; // ワンウェイ足場をすり抜けて昇降できるように
        this.me.setVelocity(0, 0);
        if (grabDown && body.blocked.down) this.me.y += 8;
      }
    }

    if (this.climbing) {
      if (!ladder) {
        this.stopClimb();
      } else {
        this.me.x += (ladder.x - this.me.x) * 0.4;
        this.me.setVelocityX(0);
        this.me.setVelocityY(upHeld ? -CLIMB_SPEED : downHeld ? CLIMB_SPEED : 0);
        if (jumpPressed) {
          this.stopClimb();
          this.me.setVelocityY(-320);
        } else if (upHeld && this.me.y <= ladder.y1 - 2) {
          this.stopClimb();
          this.me.setVelocityY(-260); // 上の足場へひと跳ね
        } else if (downHeld && this.me.y >= ladder.y2 - 18) {
          this.stopClimb();
        }
      }
    } else {
      this.me.setVelocityX(vx);
      if (vx !== 0) this.me.setFlipX(vx < 0);
      if (jumpPressed && body.blocked.down) {
        this.me.setVelocityY(JUMP_VELOCITY);
      }
    }

    // 攻撃（J / X / タッチボタン）
    const attackPressed =
      Phaser.Input.Keyboard.JustDown(this.keys.j) ||
      Phaser.Input.Keyboard.JustDown(this.keys.x) ||
      this.touch.consumeAttack();
    const now = this.time.now;
    if (attackPressed && now - this.lastAttackAt > ATTACK_COOLDOWN_MS * jobAtkCdMul(this.myState.job)) {
      this.lastAttackAt = now;
      this.room.send("attack");
      sfx.swing();
      const dir = this.me.flipX ? -1 : 1;
      if (JOBS[this.myState.job]?.range === "ranged") {
        // インクの弾
        const shot = this.add.circle(this.me.x + dir * 24, this.me.y - 4, 6, INK).setDepth(200);
        this.tweens.add({
          targets: shot,
          x: this.me.x + dir * RANGED_ATTACK_X,
          duration: 180,
          onComplete: () => shot.destroy(),
        });
      } else {
        const slash = this.add
          .image(this.me.x + dir * 34, this.me.y, "slash")
          .setFlipX(this.me.flipX)
          .setDepth(200);
        this.tweens.add({ targets: slash, alpha: 0, x: slash.x + dir * 14, duration: 160, onComplete: () => slash.destroy() });
      }
    }

    // 回復（パレットメイト: H / かいふくボタン）
    const healPressed = Phaser.Input.Keyboard.JustDown(this.keys.h) || this.touch.consumeHeal();
    if (healPressed && isHealer(this.myState.job) && now - this.lastHealAt > HEAL_COOLDOWN_MS) {
      this.lastHealAt = now;
      this.room.send("heal");
      sfx.heal();
    }

    // とくぎ＝技コピー発動（K / ✨とくぎボタン）。装備＆クールタイムを満たせば撃つ
    const sketchPressed = Phaser.Input.Keyboard.JustDown(this.keys.k) || this.touch.consumeSketch();
    const equipped = SKETCHES[this.myState.equippedSketch];
    if (sketchPressed && equipped && now - this.lastSketchAt > equipped.cooldownMs) {
      this.lastSketchAt = now;
      this.room.send("castSketch");
      sfx.swing();
    }

    // ポーション使用（P / 🧪ボタン）。所持があれば飲む（満タンならサーバー側で弾く）
    const potionPressed = Phaser.Input.Keyboard.JustDown(this.keys.p) || this.touch.consumePotion();
    if (potionPressed && this.myState.potions > 0 && now - this.lastPotionAt > 800) {
      this.lastPotionAt = now;
      this.room.send("usePotion");
    }

    // 扉（重なったら自動でページ移動。到着直後は一度ゾーンを出るまで発動しない）
    const inZone = this.doors.find((d) => d.zone.contains(this.me!.x, this.me!.y));
    if (!inZone) {
      this.doorArmed = true;
    } else if (this.doorArmed && now - this.lastDoorAt > DOOR_COOLDOWN_MS) {
      this.lastDoorAt = now;
      this.room.send("enterDoor", { doorId: inZone.def.id });
    }

    this.myLabel?.setPosition(this.me.x, this.me.y - 66);

    // NPCの吹き出し（近づくと話す。しおりの妖精は受注・報告窓口）
    for (const n of this.npcs) {
      const near = Math.abs(this.me.x - n.def.x) < 80 && Math.abs(this.me.y - n.def.y) < 110;
      if (near) {
        let text: string;
        if (n.def.id === "shiori") {
          const q = QUESTS[this.myState.questId];
          const phase = this.myState.questPhase;
          if (!q) {
            text = "クエストぜんぶクリア！すごい！\n新しい章ができたら また教えるね✨";
          } else if (phase === "idle") {
            text = `📜「${q.title}」\n${q.text}\n\n▶ ここをタップして うける！`;
          } else if (phase === "active") {
            text = `📜「${q.title}」進行中\n（${this.myState.questProgress}/${q.targetCount}）\nがんばって！`;
          } else {
            text = `✅「${q.title}」たっせい！\n\n▶ ここをタップして ほうこくする！`;
          }
        } else {
          const lines = n.def.lines;
          text = lines[Math.floor(this.time.now / 5000) % lines.length];
        }
        if (n.bubble.text !== text) n.bubble.setText(text);
        if (!n.bubble.visible) {
          n.bubble.setVisible(true);
          n.bubble.setPosition(n.def.x, n.def.y - n.sprite.displayHeight / 2 - 26);
        }
      } else if (!near && n.bubble.visible) {
        n.bubble.setVisible(false);
      }
    }

    // 自分のアニメ更新
    const animNow = this.climbing ? "climb" : !body.blocked.down ? "jump" : vx !== 0 ? "walk" : "idle";
    this.applyHeroAnim(this.me, this.myState.colorIdx, animNow);

    // 位置送信（20Hz・変化があった時だけ）
    this.sendAccum += delta;
    if (this.sendAccum >= SEND_INTERVAL_MS) {
      this.sendAccum = 0;
      const anim = animNow;
      const s = { x: Math.round(this.me.x * 10) / 10, y: Math.round(this.me.y * 10) / 10, flip: this.me.flipX, anim };
      const changed =
        Math.abs(s.x - this.lastSent.x) > 0.2 ||
        Math.abs(s.y - this.lastSent.y) > 0.2 ||
        s.flip !== this.lastSent.flip ||
        s.anim !== this.lastSent.anim;
      if (changed) {
        this.room.send("move", s);
        this.lastSent = s;
      }
    }
  }
}
