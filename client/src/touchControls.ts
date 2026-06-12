import Phaser from "phaser";

/**
 * スマホ用バーチャルパッド
 * - 画面左側: タッチした場所にジョイスティック出現（横移動）
 * - 画面右下: ジャンプボタン
 * タッチ非対応端末では何も表示しない。
 */
export class TouchControls {
  readonly enabled: boolean;
  moveX = 0;
  moveY = 0; // はしご昇降用（-1=上, 1=下）

  private scene: Phaser.Scene;
  private jumpQueued = false;
  private stickPointerId: number | null = null;
  private origin = new Phaser.Math.Vector2();
  private base?: Phaser.GameObjects.Arc;
  private knob?: Phaser.GameObjects.Arc;
  private jumpBtn?: Phaser.GameObjects.Arc;
  private jumpLabel?: Phaser.GameObjects.Text;
  private attackQueued = false;
  private attackBtn?: Phaser.GameObjects.Arc;
  private attackLabel?: Phaser.GameObjects.Text;
  private healQueued = false;
  private healBtn?: Phaser.GameObjects.Arc;
  private healLabel?: Phaser.GameObjects.Text;

  private static readonly RADIUS = 60;
  private static readonly DEADZONE = 0.18;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.enabled = scene.sys.game.device.input.touch;
    if (!this.enabled) return;

    scene.input.addPointer(2);

    this.base = scene.add
      .circle(0, 0, TouchControls.RADIUS, 0x3a3530, 0.12)
      .setStrokeStyle(3, 0x3a3530, 0.35)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.knob = scene.add
      .circle(0, 0, 26, 0x3a3530, 0.35)
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);

    this.jumpBtn = scene.add
      .circle(0, 0, 52, 0x3a3530, 0.22)
      .setStrokeStyle(4, 0x3a3530, 0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      // 当たり判定はローカル座標の中心に置く（左上に置くと右半分が反応しない）
      .setInteractive(new Phaser.Geom.Circle(52, 52, 62), Phaser.Geom.Circle.Contains);
    this.jumpLabel = scene.add
      .text(0, 0, "とぶ", { fontSize: "24px", color: "#3a3530", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);
    this.jumpBtn.on("pointerdown", () => {
      this.jumpQueued = true;
    });

    this.attackBtn = scene.add
      .circle(0, 0, 46, 0xc0392b, 0.2)
      .setStrokeStyle(4, 0xc0392b, 0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive(new Phaser.Geom.Circle(46, 46, 56), Phaser.Geom.Circle.Contains);
    this.attackLabel = scene.add
      .text(0, 0, "⚔こうげき", { fontSize: "19px", color: "#8e2820", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);
    this.attackBtn.on("pointerdown", () => {
      this.attackQueued = true;
    });

    // 回復ボタン（パレットメイト専用。setHealVisibleで表示制御）
    this.healBtn = scene.add
      .circle(0, 0, 46, 0x6bcb77, 0.25)
      .setStrokeStyle(4, 0x2e7d32, 0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive()
      .setVisible(false);
    this.healLabel = scene.add
      .text(0, 0, "かいふく", { fontSize: "16px", color: "#2e7d32", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);
    this.healBtn.on("pointerdown", () => {
      this.healQueued = true;
    });

    this.layout();
    scene.scale.on("resize", () => this.layout());

    scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // 右下のボタン付近は無視（ボタン自身が処理する）
      if (this.jumpBtn && Phaser.Math.Distance.Between(pointer.x, pointer.y, this.jumpBtn.x, this.jumpBtn.y) < 90) {
        return;
      }
      if (this.attackBtn && Phaser.Math.Distance.Between(pointer.x, pointer.y, this.attackBtn.x, this.attackBtn.y) < 84) {
        return;
      }
      if (this.stickPointerId !== null) return;
      if (pointer.x > this.scene.scale.width * 0.6) return;

      this.stickPointerId = pointer.id;
      this.origin.set(pointer.x, pointer.y);
      this.base!.setPosition(pointer.x, pointer.y).setVisible(true);
      this.knob!.setPosition(pointer.x, pointer.y).setVisible(true);
    });

    scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.stickPointerId) return;
      const dx = Phaser.Math.Clamp(pointer.x - this.origin.x, -TouchControls.RADIUS, TouchControls.RADIUS);
      const dy = Phaser.Math.Clamp(pointer.y - this.origin.y, -TouchControls.RADIUS, TouchControls.RADIUS);
      const vx = dx / TouchControls.RADIUS;
      const vy = dy / TouchControls.RADIUS;
      this.moveX = Math.abs(vx) < TouchControls.DEADZONE ? 0 : vx;
      this.moveY = Math.abs(vy) < TouchControls.DEADZONE ? 0 : vy;
      this.knob!.setPosition(this.origin.x + dx, this.origin.y + dy);
    });

    const release = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.stickPointerId) return;
      this.stickPointerId = null;
      this.moveX = 0;
      this.moveY = 0;
      this.base!.setVisible(false);
      this.knob!.setVisible(false);
    };
    scene.input.on("pointerup", release);
    scene.input.on("pointerupoutside", release);
  }

  private layout() {
    if (!this.jumpBtn) return;
    const { width, height } = this.scene.scale;
    // 親指の届く右下に、ブラウザバーから離して大きめに配置
    this.jumpBtn.setPosition(width - 80, height - 150);
    this.jumpLabel!.setPosition(width - 80, height - 150);
    this.attackBtn?.setPosition(width - 196, height - 110);
    this.attackLabel?.setPosition(width - 196, height - 110);
    this.healBtn?.setPosition(width - 90, height - 312);
    this.healLabel?.setPosition(width - 90, height - 312);
  }

  setHealVisible(visible: boolean) {
    this.healBtn?.setVisible(visible && this.enabled);
    this.healLabel?.setVisible(visible && this.enabled);
  }

  /** ジャンプ入力を1回分消費する */
  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  /** 攻撃入力を1回分消費する */
  consumeAttack(): boolean {
    const a = this.attackQueued;
    this.attackQueued = false;
    return a;
  }

  /** 回復入力を1回分消費する */
  consumeHeal(): boolean {
    const h = this.healQueued;
    this.healQueued = false;
    return h;
  }
}
