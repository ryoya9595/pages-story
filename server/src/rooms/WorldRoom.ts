import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import {
  MAPS,
  enemyStats,
  playerMaxHp,
  playerAtk,
  expToNext,
  LEVEL_CAP,
  PARTY_BONUS,
  CONTRIB_WEIGHT,
  LEVEL_WEIGHT,
  type EnemySpawnDef,
} from "../../../shared/maps.js";
import { store } from "../store.js";
import { QUESTS, FIRST_QUEST } from "../../../shared/quests.js";
import {
  JOBS,
  RANGED_ATTACK_X,
  RANGED_ATTACK_Y,
  HEAL_RADIUS,
  HEAL_COOLDOWN_MS,
  jobAtkMul,
  jobHpMul,
  jobHealRatio,
  isHealer,
  availableJobs,
} from "../../../shared/jobs.js";
import {
  SKETCHES,
  sketchJobMod,
  SHIELD_DMG_MUL,
  hasSketch,
  addSketch,
  type SketchDef,
} from "../../../shared/sketches.js";

export class Player extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("boolean") flip = false;
  @type("string") anim = "idle";
  @type("number") colorIdx = 0;
  @type("string") name = "";
  @type("string") mapId = "hub";
  @type("number") level = 1;
  @type("number") exp = 0;
  @type("number") expToNext = expToNext(1);
  @type("number") hp = playerMaxHp(1);
  @type("number") maxHp = playerMaxHp(1);
  @type("boolean") dead = false;
  @type("string") questId = FIRST_QUEST;
  @type("number") questProgress = 0;
  @type("string") questPhase = "idle"; // idle=未受注 / active=進行中 / ready=報告待ち
  @type("string") job = "novice";
  // スキルポイント（レベルアップごとに+3。ステータスに振る）
  @type("number") sp = 0;
  @type("number") statAtk = 0;
  @type("number") statHp = 0;
  @type("number") statSpd = 0;
  @type("number") statSpec = 0; // 職業系統ごとの固有強化（リーチ/飛距離/防御/回復量）
  // 技コピー（スケッチ）: 覚えた図鑑（"makimaki,inkdama"形式）と装備中の1つ
  @type("string") sketchBook = "";
  @type("string") equippedSketch = "";
  // 経済: コイン（敵ドロップ）とポーション所持数
  @type("number") coins = 0;
  @type("number") potions = 0;
}

export class Enemy extends Schema {
  @type("string") kind = "makimaki";
  @type("string") mapId = "hub";
  @type("number") level = 1;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("boolean") flip = false;
  @type("number") hp = 1;
  @type("number") maxHp = 1;
  @type("boolean") dead = false;
  @type("boolean") boss = false;
}

export class WorldState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Enemy }) enemies = new MapSchema<Enemy>();
}

const ATTACK_RANGE_X = 80; // 前方リーチ
const ATTACK_BACK_X = 24; // 背面の許容
const ATTACK_RANGE_Y = 60;
const TOUCH_RANGE_X = 34;
const TOUCH_RANGE_Y = 44;
const TOUCH_COOLDOWN_MS = 1000;
const ENEMY_RESPAWN_MS = 6000;
const PLAYER_RESPAWN_MS = 3000;
const REGEN_INTERVAL_MS = 1000;
const REGEN_AFTER_DAMAGE_MS = 5000; // 被弾後この時間は回復しない
const AUTOSAVE_INTERVAL_MS = 15000;
const POTION_COST = 40; // ポーション1個の値段（コイン）
const POTION_HEAL_RATIO = 0.4; // ポーションの回復量（最大HP比）

interface EnemyMeta {
  def: EnemySpawnDef;
  dir: 1 | -1;
  respawnAt: number;
  touchCooldown: Map<string, number>;
  stunnedUntil: number; // けしゴムプレス等でスタン中はこの時刻まで動かない
  // ボス専用: 特殊攻撃（テレグラフ→発動）の状態機械
  specialAt: number; // 次に特殊攻撃を始める時刻
  windupUntil: number; // 構え（テレグラフ）の終了時刻
  specialPhase: "idle" | "windup";
  specialType: "slam" | "charge";
}

const BOSS_SPECIAL_INTERVAL_MS = 6000; // 特殊攻撃の間隔
const BOSS_WINDUP_MS = 950; // 構え（避ける猶予）
const BOSS_SLAM_RANGE_X = 250;
const BOSS_SLAM_RANGE_Y = 170;
const BOSS_CHARGE_DIST = 340;

export class WorldRoom extends Room<WorldState> {
  maxClients = 4;

  private enemyMeta = new Map<string, EnemyMeta>();
  /** enemyId -> (sessionId -> 与ダメージ累計) 経験値分配用 */
  private contrib = new Map<string, Map<string, number>>();
  /** sessionId -> playerId / secret（セーブ用） */
  private playerIds = new Map<string, string>();
  private secrets = new Map<string, string>();
  private lastDamagedAt = new Map<string, number>();
  private healCooldown = new Map<string, number>();
  private lastRegenAt = 0;
  /** スケッチ発動のクールタイム（sessionId -> 解放時刻） */
  private sketchCooldown = new Map<string, number>();
  /** 防御バフ中の終了時刻（sessionId -> 時刻）。えのぐシールド/クレヨン系発動で付く */
  private shieldUntil = new Map<string, number>();

  onCreate() {
    this.setState(new WorldState());
    this.spawnAllEnemies();

    this.onMessage("move", (client: Client, data: { x: number; y: number; flip: boolean; anim: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.dead) return;
      const map = MAPS[p.mapId];
      p.x = Math.max(0, Math.min(map.width, Number(data.x) || 0));
      p.y = Math.max(0, Math.min(map.height, Number(data.y) || 0));
      p.flip = !!data.flip;
      p.anim = typeof data.anim === "string" ? data.anim : "idle";
    });

    this.onMessage("attack", (client: Client) => this.handleAttack(client));

    // 転職（1次Lv10→2次Lv30→3次Lv60→4次Lv90。親職からの派生のみ・後戻り不可）
    this.onMessage("chooseJob", (client: Client, data: { job: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.dead) return;
      const target = JOBS[data?.job];
      if (!target) return;
      if (!availableJobs(p.job, p.level).some((j) => j.id === target.id)) return;
      p.job = target.id;
      p.maxHp = this.calcMaxHp(p);
      p.hp = p.maxHp; // 転職祝いの全回復
      this.savePlayer(client.sessionId, p);
      this.broadcast("jobChosen", { sessionId: client.sessionId, job: p.job });
      console.log(`[job] ${p.name} → ${target.name}（${target.tier}次）`);
    });

    // パレット系の回復（自分＋周囲の仲間）
    this.onMessage("heal", (client: Client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.dead || !isHealer(p.job)) return;
      const now = Date.now();
      if (now < (this.healCooldown.get(client.sessionId) || 0)) return;
      this.healCooldown.set(client.sessionId, now + HEAL_COOLDOWN_MS);

      const targets: { sessionId: string; amount: number }[] = [];
      this.state.players.forEach((ally, sessionId) => {
        if (ally.dead || ally.mapId !== p.mapId) return;
        if (Math.abs(ally.x - p.x) > HEAL_RADIUS || Math.abs(ally.y - p.y) > HEAL_RADIUS) return;
        // パレット系の固有強化: 回復量+1.2%/pt
        const ratio = jobHealRatio(p.job) + (this.rootJob(p.job) === "palette" ? p.statSpec * 0.012 : 0);
        const amount = Math.round(ally.maxHp * ratio);
        const healed = Math.min(ally.maxHp - ally.hp, amount);
        if (healed <= 0) return;
        ally.hp += healed;
        targets.push({ sessionId, amount: healed });
      });
      this.broadcast("healed", { by: client.sessionId, x: p.x, y: p.y, targets });
    });

    // ===== 技コピー（スケッチ） =====
    // 装備変更: 覚えているスケッチを1つアクティブにする
    this.onMessage("equipSketch", (client: Client, data: { kind: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const kind = data?.kind ?? "";
      if (kind !== "" && !hasSketch(p.sketchBook, kind)) return; // 覚えていないものは装備不可
      p.equippedSketch = kind;
      this.savePlayer(client.sessionId, p);
    });

    // 発動: 装備中スケッチを撃つ
    this.onMessage("castSketch", (client: Client) => this.handleCastSketch(client));

    // ===== ショップ（ポーション） =====
    this.onMessage("buyPotion", (client: Client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.coins < POTION_COST) return;
      p.coins -= POTION_COST;
      p.potions += 1;
      this.broadcast("bought", { sessionId: client.sessionId });
      this.savePlayer(client.sessionId, p);
    });

    this.onMessage("usePotion", (client: Client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.dead || p.potions <= 0 || p.hp >= p.maxHp) return; // 満タンでは無駄遣いさせない
      p.potions -= 1;
      const healed = Math.min(p.maxHp - p.hp, Math.round(p.maxHp * POTION_HEAL_RATIO));
      p.hp += healed;
      this.broadcast("potionUsed", { sessionId: client.sessionId, amount: healed });
      this.savePlayer(client.sessionId, p);
    });

    // 開発用チート（ALLOW_DEV=1 のときだけ有効。バランステスト用）
    if (process.env.ALLOW_DEV) {
      this.onMessage("devGrantExp", (client: Client, data: { amount: number }) => {
        const p = this.state.players.get(client.sessionId);
        if (!p) return;
        this.giveExp(client.sessionId, p, Math.max(0, Math.min(100000, Number(data?.amount) || 0)));
      });
    }

    this.onMessage("enterDoor", (client: Client, data: { doorId: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.dead) return;
      const door = MAPS[p.mapId]?.doors.find((d) => d.id === data?.doorId);
      if (!door) return;
      if (Math.abs(p.x - door.x) > 90 || Math.abs(p.y - door.y) > 120) return; // 扉の近くにいる時だけ
      p.mapId = door.toMap;
      p.x = door.toX;
      p.y = door.toY;
    });

    // クエスト受注（しおりの妖精に話しかけて受ける）
    this.onMessage("acceptQuest", (client: Client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.dead) return;
      if (p.questPhase !== "idle" || !QUESTS[p.questId]) return;
      p.questPhase = "active";
      p.questProgress = 0;
      this.broadcast("questAccepted", { sessionId: client.sessionId, questId: p.questId });
      this.savePlayer(client.sessionId, p);
    });

    // クエスト報告（達成後にしおりの妖精へ → 報酬）
    this.onMessage("claimQuest", (client: Client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.dead) return;
      const quest = QUESTS[p.questId];
      if (p.questPhase !== "ready" || !quest) return;
      this.broadcast("questClear", { sessionId: client.sessionId, questId: quest.id, rewardExp: quest.rewardExp });
      this.giveExp(client.sessionId, p, quest.rewardExp);
      p.questId = quest.next ?? "";
      p.questPhase = "idle";
      p.questProgress = 0;
      this.savePlayer(client.sessionId, p);
    });

    // スキルポイント振り分け（レベルアップで+3）
    this.onMessage("spendSp", (client: Client, data: { stat: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.sp <= 0) return;
      if (data?.stat === "atk" && p.statAtk < 60) {
        p.statAtk++;
      } else if (data?.stat === "hp" && p.statHp < 60) {
        p.statHp++;
        p.maxHp = this.calcMaxHp(p);
        p.hp = Math.min(p.hp + 15, p.maxHp);
      } else if (data?.stat === "spd" && p.statSpd < 25) {
        p.statSpd++;
      } else if (data?.stat === "spec" && p.job !== "novice" && p.statSpec < 30) {
        p.statSpec++;
      } else {
        return;
      }
      p.sp--;
      this.savePlayer(client.sessionId, p);
    });

    this.setSimulationInterval((dt) => this.tick(dt), 50); // 20tick/秒
    this.clock.setInterval(() => this.saveAll(), AUTOSAVE_INTERVAL_MS);
  }

  private spawnAllEnemies() {
    for (const map of Object.values(MAPS)) {
      for (const def of map.enemies) {
        const stats = enemyStats(def.level, def.boss);
        const e = new Enemy();
        e.kind = def.kind;
        e.mapId = map.id;
        e.level = def.level;
        e.boss = !!def.boss;
        e.x = def.x;
        e.y = def.y;
        e.hp = stats.maxHp;
        e.maxHp = stats.maxHp;
        this.state.enemies.set(def.id, e);
        this.enemyMeta.set(def.id, {
          def, dir: 1, respawnAt: 0, touchCooldown: new Map(), stunnedUntil: 0,
          specialAt: Date.now() + 4000, windupUntil: 0, specialPhase: "idle", specialType: "slam",
        });
      }
    }
  }

  private handleAttack(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead) return;

    // 向いている方向の近い敵1体にヒット（遠距離職はリーチが長い）
    const ranged = JOBS[p.job]?.range === "ranged";
    // 職業固有強化: 近接系=リーチ+5/pt、遠距離系=飛距離+12/pt
    const root = this.rootJob(p.job);
    const specRange = root === "ink" ? p.statSpec * 12 : root === "pencil" ? p.statSpec * 5 : 0;
    const rangeX = (ranged ? RANGED_ATTACK_X : ATTACK_RANGE_X) + specRange;
    const rangeY = ranged ? RANGED_ATTACK_Y : ATTACK_RANGE_Y;
    let bestId: string | null = null;
    let bestDist = Infinity;
    this.state.enemies.forEach((e, id) => {
      if (e.dead || e.mapId !== p.mapId) return;
      if (Math.abs(e.y - p.y) > rangeY) return;
      const dx = e.x - p.x;
      const forward = p.flip ? -dx : dx;
      if (forward < -ATTACK_BACK_X || forward > rangeX) return;
      const dist = Math.abs(dx);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    });
    if (!bestId) return;

    const enemy = this.state.enemies.get(bestId)!;
    const dmg = Math.max(1, Math.round(playerAtk(p.level) * jobAtkMul(p.job) * (1 + p.statAtk * 0.04)));
    enemy.hp = Math.max(0, enemy.hp - dmg);

    let c = this.contrib.get(bestId);
    if (!c) {
      c = new Map();
      this.contrib.set(bestId, c);
    }
    c.set(client.sessionId, (c.get(client.sessionId) || 0) + dmg);

    this.broadcast("hit", { enemyId: bestId, dmg, by: client.sessionId, x: enemy.x, y: enemy.y });

    if (enemy.hp <= 0) this.killEnemy(bestId, enemy);
  }

  private killEnemy(enemyId: string, enemy: Enemy) {
    enemy.dead = true;
    const meta = this.enemyMeta.get(enemyId)!;
    meta.respawnAt = Date.now() + ENEMY_RESPAWN_MS;
    meta.touchCooldown.clear();

    // ===== 経験値分配: 貢献度50% + レベル比50% + 人数ボーナス =====
    // 1ダメージでも与えていれば分配対象（メイプルの寄生文化の再現）
    const contributors = [...(this.contrib.get(enemyId) || new Map()).entries()]
      .map(([sessionId, dmg]) => ({ sessionId, dmg, player: this.state.players.get(sessionId) }))
      .filter((c): c is { sessionId: string; dmg: number; player: Player } => !!c.player);

    if (contributors.length > 0) {
      const baseExp = enemyStats(enemy.level, enemy.boss).exp;
      const totalDmg = contributors.reduce((s, c) => s + c.dmg, 0);
      const sumLevels = contributors.reduce((s, c) => s + c.player.level, 0);
      const bonus = PARTY_BONUS[Math.min(contributors.length, PARTY_BONUS.length - 1)];

      // コインドロップ（貢献者全員に。ボスは大盤振る舞い）
      const coinDrop = Math.max(1, Math.round((2 + enemy.level * 0.7) * (enemy.boss ? 5 : 1)));
      for (const c of contributors) {
        const weight = CONTRIB_WEIGHT * (c.dmg / totalDmg) + LEVEL_WEIGHT * (c.player.level / sumLevels);
        const gain = Math.max(1, Math.round(baseExp * weight * bonus));
        this.giveExp(c.sessionId, c.player, gain);
        this.progressQuest(c.sessionId, c.player, enemy);
        this.learnSketch(c.sessionId, c.player, enemy.kind);
        c.player.coins += coinDrop;
        this.broadcast("coin", { sessionId: c.sessionId, amount: coinDrop });
      }
    }
    this.contrib.delete(enemyId);
  }

  /** その敵の種類のスケッチを初めて倒したら覚える（図鑑式） */
  private learnSketch(sessionId: string, p: Player, kind: string) {
    if (!SKETCHES[kind] || hasSketch(p.sketchBook, kind)) return;
    p.sketchBook = addSketch(p.sketchBook, kind);
    // 1つも装備していなければ自動で装備（初めて覚えた技をすぐ使えるように）
    if (!p.equippedSketch) p.equippedSketch = kind;
    this.broadcast("sketchLearned", { sessionId, kind });
    this.savePlayer(sessionId, p);
  }

  private handleCastSketch(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead) return;
    const def = SKETCHES[p.equippedSketch];
    if (!def || !hasSketch(p.sketchBook, def.kind)) return;
    const now = Date.now();
    if (now < (this.sketchCooldown.get(client.sessionId) || 0)) return;
    this.sketchCooldown.set(client.sessionId, now + def.cooldownMs);

    const mod = sketchJobMod(this.rootJob(p.job));
    const dir: 1 | -1 = p.flip ? -1 : 1;

    // 職業系統のオマケ: クレヨン=自己ガード / パレット=周囲回復
    if (mod.selfShieldMs > 0) this.shieldUntil.set(client.sessionId, now + mod.selfShieldMs);
    if (mod.allyHealRatio > 0) {
      this.state.players.forEach((ally) => {
        if (ally.dead || ally.mapId !== p.mapId) return;
        if (Math.abs(ally.x - p.x) > HEAL_RADIUS || Math.abs(ally.y - p.y) > HEAL_RADIUS) return;
        ally.hp = Math.min(ally.maxHp, ally.hp + Math.round(ally.maxHp * mod.allyHealRatio));
      });
    }

    // 演出用ブロードキャスト
    this.broadcast("sketchCast", { by: client.sessionId, kind: def.kind, type: def.type, x: p.x, y: p.y, flip: p.flip });

    if (def.type === "buff") return; // えのぐシールドは攻撃しない（mod適用は上で完結、自分にもシールド）

    const dmg = Math.max(1, Math.round(playerAtk(p.level) * def.dmgMul * (1 + p.statAtk * 0.04) * mod.dmgMul));
    const rangeX = def.rangeX * mod.rangeMul;
    const rangeY = def.rangeY * mod.rangeMul;
    const stunMs = def.type === "stun" ? def.durationMs || 0 : 0;

    if (def.type === "dot" && def.ticks && def.durationMs) {
      // 胞子の雲: 一定間隔で複数回ヒット
      const interval = def.durationMs / def.ticks;
      for (let i = 0; i < def.ticks; i++) {
        this.clock.setTimeout(() => {
          const pl = this.state.players.get(client.sessionId);
          if (!pl || pl.dead) return;
          this.sketchHitArea(client.sessionId, pl, def, dir, rangeX, rangeY, dmg, 0);
        }, Math.round(interval * i));
      }
      return;
    }

    this.sketchHitArea(client.sessionId, p, def, dir, rangeX, rangeY, dmg, stunMs);
  }

  /** スケッチの当たり判定＆ダメージ適用（aoeは自分中心、他は前方ボックス） */
  private sketchHitArea(
    sessionId: string, p: Player, def: SketchDef, dir: 1 | -1,
    rangeX: number, rangeY: number, dmg: number, stunMs: number
  ) {
    const now = Date.now();
    this.state.enemies.forEach((e, id) => {
      if (e.dead || e.mapId !== p.mapId) return;
      let inRange: boolean;
      if (def.type === "aoe") {
        inRange = Math.abs(e.x - p.x) <= rangeX && Math.abs(e.y - p.y) <= rangeY;
      } else {
        const forward = dir * (e.x - p.x);
        inRange = forward >= -20 && forward <= rangeX && Math.abs(e.y - p.y) <= rangeY;
      }
      if (!inRange) return;

      e.hp = Math.max(0, e.hp - dmg);
      let c = this.contrib.get(id);
      if (!c) { c = new Map(); this.contrib.set(id, c); }
      c.set(sessionId, (c.get(sessionId) || 0) + dmg);
      this.broadcast("hit", { enemyId: id, dmg, by: sessionId, x: e.x, y: e.y });

      if (stunMs > 0) {
        const meta = this.enemyMeta.get(id);
        if (meta) {
          meta.stunnedUntil = now + stunMs;
          e.x = Math.max(0, Math.min(MAPS[e.mapId].width, e.x + dir * 40)); // ノックバック
        }
      }
      if (e.hp <= 0) this.killEnemy(id, e);
    });
  }

  /** 討伐がクエスト対象ならカウントを進め、達成なら報酬＆次のクエストへ */
  private progressQuest(sessionId: string, p: Player, enemy: Enemy) {
    const quest = QUESTS[p.questId];
    if (!quest) return; // 全クエスト完了済み
    if (p.questPhase !== "active") return; // 受注していないと進まない
    if (enemy.mapId !== quest.targetMap) return;
    if (quest.targetBoss && !enemy.boss) return;

    p.questProgress++;
    if (p.questProgress < quest.targetCount) return;

    // 達成 → しおりの妖精に報告すると報酬（クリア処理はclaimQuestで）
    p.questPhase = "ready";
    this.broadcast("questReady", { sessionId, questId: quest.id });
  }

  private giveExp(sessionId: string, p: Player, gain: number) {
    if (p.level >= LEVEL_CAP) return;
    p.exp += gain;
    this.broadcast("exp", { sessionId, amount: gain });
    while (p.exp >= p.expToNext && p.level < LEVEL_CAP) {
      p.exp -= p.expToNext;
      p.level++;
      p.expToNext = expToNext(p.level);
      p.sp += 3; // スキルポイント獲得
      p.maxHp = this.calcMaxHp(p);
      p.hp = p.maxHp; // レベルアップで全回復
      this.broadcast("levelup", { sessionId, level: p.level });
    }
  }

  /** 最大HP = 基礎×職業倍率＋SP振り分け分 */
  private calcMaxHp(p: Player) {
    return Math.round(playerMaxHp(p.level) * jobHpMul(p.job)) + p.statHp * 15;
  }

  /** 職業の系統（1次職のid）を返す */
  private rootJob(job: string): string {
    let j = JOBS[job];
    while (j?.parent) j = JOBS[j.parent];
    return j?.id ?? "novice";
  }

  private tick(dtMs: number) {
    const now = Date.now();
    const dt = dtMs / 1000;

    this.state.enemies.forEach((e, id) => {
      const meta = this.enemyMeta.get(id)!;

      if (e.dead) {
        if (now >= meta.respawnAt) {
          const stats = enemyStats(e.level, e.boss);
          e.hp = stats.maxHp;
          e.x = meta.def.x;
          e.y = meta.def.y;
          e.dead = false;
        }
        return;
      }

      // スタン中（けしゴムプレス等）は動かず・触れてもダメージを出さない
      const stunned = now < meta.stunnedUntil;

      // ボス特殊攻撃: テレグラフ(構え)→発動。構え中は移動を止めて避ける猶予を作る
      if (e.boss && !stunned) {
        if (meta.specialPhase === "idle" && now >= meta.specialAt) {
          meta.specialPhase = "windup";
          meta.windupUntil = now + BOSS_WINDUP_MS;
          meta.specialType = meta.specialType === "slam" ? "charge" : "slam"; // 交互
          this.broadcast("bossWarn", { enemyId: id, type: meta.specialType, x: e.x, y: e.y });
        } else if (meta.specialPhase === "windup" && now >= meta.windupUntil) {
          this.executeBossSpecial(id, e, meta, now);
          meta.specialPhase = "idle";
          meta.specialAt = now + BOSS_SPECIAL_INTERVAL_MS;
        }
      }
      const bossWindup = e.boss && meta.specialPhase === "windup";

      // パトロール移動（スタン中・ボスの構え中は止まる）
      const stats = enemyStats(e.level, e.boss);
      if (!stunned && !bossWindup) {
        e.x += meta.dir * stats.speed * dt;
        if (e.x >= meta.def.patrolMax) meta.dir = -1;
        if (e.x <= meta.def.patrolMin) meta.dir = 1;
        e.flip = meta.dir < 0;
      }

      // 触れたプレイヤーにダメージ（タッチダメージ。スタン中は無し）
      if (stunned) return;
      this.state.players.forEach((p, sessionId) => {
        if (p.dead || p.mapId !== e.mapId) return;
        if (Math.abs(p.x - e.x) > TOUCH_RANGE_X || Math.abs(p.y - e.y) > TOUCH_RANGE_Y) return;
        const cd = meta.touchCooldown.get(sessionId) || 0;
        if (now < cd) return;
        meta.touchCooldown.set(sessionId, now + TOUCH_COOLDOWN_MS);

        // クレヨン系の固有強化: 被ダメージ-3%/pt（最大-90%）
        let dmgTaken = stats.touchDmg;
        if (this.rootJob(p.job) === "crayon") {
          dmgTaken = Math.max(1, Math.round(dmgTaken * (1 - p.statSpec * 0.03)));
        }
        // スケッチの防御バフ（えのぐシールド／クレヨン系の発動ガード）中は半減
        if (now < (this.shieldUntil.get(sessionId) || 0)) {
          dmgTaken = Math.max(1, Math.round(dmgTaken * SHIELD_DMG_MUL));
        }
        p.hp = Math.max(0, p.hp - dmgTaken);
        this.lastDamagedAt.set(sessionId, now);
        this.broadcast("playerHit", { sessionId, dmg: dmgTaken });
        if (p.hp <= 0) this.killPlayer(sessionId, p);
      });
    });

    // 自然回復（被弾後5秒経過で 最大HPの4%/秒）
    if (now - this.lastRegenAt >= REGEN_INTERVAL_MS) {
      this.lastRegenAt = now;
      this.state.players.forEach((p, sessionId) => {
        if (p.dead || p.hp >= p.maxHp) return;
        if (now - (this.lastDamagedAt.get(sessionId) || 0) < REGEN_AFTER_DAMAGE_MS) return;
        p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(p.maxHp * 0.04)));
      });
    }
  }

  /** ボスの特殊攻撃を発動（構え終了時に呼ばれる） */
  private executeBossSpecial(id: string, e: Enemy, meta: EnemyMeta, now: number) {
    const stats = enemyStats(e.level, e.boss);
    const dmg = Math.round(stats.touchDmg * 2.2); // 通常タッチの2.2倍の痛恨の一撃
    const map = MAPS[e.mapId];

    if (meta.specialType === "slam") {
      // 範囲スタンプ: ボス周囲の全員に大ダメージ＋ノックバック
      this.state.players.forEach((p, sid) => {
        if (p.dead || p.mapId !== e.mapId) return;
        if (Math.abs(p.x - e.x) > BOSS_SLAM_RANGE_X || Math.abs(p.y - e.y) > BOSS_SLAM_RANGE_Y) return;
        const kx = p.x < e.x ? -60 : 60;
        p.x = Math.max(0, Math.min(map.width, p.x + kx));
        this.applyBossDamage(sid, p, dmg, now);
      });
      this.broadcast("bossAttack", { enemyId: id, type: "slam", x: e.x, y: e.y, range: BOSS_SLAM_RANGE_X });
    } else {
      // 突進: 一番近いプレイヤーへ大きく踏み込み、通り道の全員を薙ぐ
      let target: Player | undefined;
      let best = Infinity;
      this.state.players.forEach((p) => {
        if (p.dead || p.mapId !== e.mapId) return;
        const d = Math.abs(p.x - e.x);
        if (d < best) { best = d; target = p; }
      });
      const dir = target && target.x < e.x ? -1 : 1;
      const x0 = e.x;
      const x1 = Math.max(0, Math.min(map.width, e.x + dir * BOSS_CHARGE_DIST));
      e.x = x1;
      e.flip = dir < 0;
      const lo = Math.min(x0, x1) - 40;
      const hi = Math.max(x0, x1) + 40;
      this.state.players.forEach((p, sid) => {
        if (p.dead || p.mapId !== e.mapId) return;
        if (p.x < lo || p.x > hi || Math.abs(p.y - e.y) > 80) return;
        p.x = Math.max(0, Math.min(map.width, p.x + dir * 50));
        this.applyBossDamage(sid, p, dmg, now);
      });
      this.broadcast("bossAttack", { enemyId: id, type: "charge", x0, x1, y: e.y });
    }
  }

  /** ボス攻撃の被ダメージ適用（クレヨンの防御・スケッチのシールドも効く） */
  private applyBossDamage(sessionId: string, p: Player, dmg: number, now: number) {
    let d = dmg;
    if (this.rootJob(p.job) === "crayon") d = Math.max(1, Math.round(d * (1 - p.statSpec * 0.03)));
    if (now < (this.shieldUntil.get(sessionId) || 0)) d = Math.max(1, Math.round(d * SHIELD_DMG_MUL));
    p.hp = Math.max(0, p.hp - d);
    this.lastDamagedAt.set(sessionId, now);
    this.broadcast("playerHit", { sessionId, dmg: d });
    if (p.hp <= 0) this.killPlayer(sessionId, p);
  }

  private killPlayer(sessionId: string, p: Player) {
    p.dead = true;
    p.anim = "idle";
    this.broadcast("died", { sessionId });
    // 3秒後にもくじ広場で復活（経験値ロストなし・カジュアル設計）
    this.clock.setTimeout(() => {
      if (!this.state.players.has(sessionId)) return;
      const hub = MAPS.hub;
      p.mapId = "hub";
      p.x = hub.spawnX;
      p.y = hub.spawnY;
      p.hp = p.maxHp;
      p.dead = false;
      this.broadcast("respawn", { sessionId });
    }, PLAYER_RESPAWN_MS);
  }

  onJoin(client: Client, options?: { playerId?: string; secret?: string; name?: string }) {
    const playerId = options?.playerId;
    const secret = options?.secret;
    if (!playerId || !secret) throw new Error("auth_required");

    const existing = store.get(playerId);
    if (existing && existing.secret !== secret) throw new Error("auth_mismatch");
    if ([...this.playerIds.values()].includes(playerId)) throw new Error("already_online");

    // キャラ選択（タイトル画面で選んだ見た目）。指定がなければ空いている番号
    let colorIdx: number;
    const chosen = Number((options as any)?.charIdx);
    if (Number.isInteger(chosen) && chosen >= 0 && chosen <= 3) {
      colorIdx = chosen;
    } else {
      const usedColors = new Set([...this.state.players.values()].map((pl) => pl.colorIdx));
      colorIdx = 0;
      while (usedColors.has(colorIdx)) colorIdx++;
    }

    const hub = MAPS.hub;
    const p = new Player();
    p.colorIdx = colorIdx;

    if (existing) {
      // セーブデータから復元（HPはログイン時全回復）
      p.name = options?.name?.slice(0, 12) || existing.name;
      p.level = Math.min(existing.level, LEVEL_CAP);
      p.exp = existing.exp;
      p.job = existing.job && JOBS[existing.job] ? existing.job : "novice";
      p.sp = existing.sp ?? 0;
      p.statAtk = existing.statAtk ?? 0;
      p.statHp = existing.statHp ?? 0;
      p.statSpd = existing.statSpd ?? 0;
      p.statSpec = (existing as any).statSpec ?? 0;
      p.sketchBook = (existing as any).sketchBook ?? "";
      p.equippedSketch = (existing as any).equippedSketch ?? "";
      p.coins = (existing as any).coins ?? 0;
      p.potions = (existing as any).potions ?? 0;
      p.expToNext = expToNext(p.level);
      p.maxHp = this.calcMaxHp(p);
      p.hp = p.maxHp;
      p.mapId = MAPS[existing.mapId] ? existing.mapId : "hub";
      p.x = existing.x;
      p.y = existing.y;
      p.questId = existing.questId ?? FIRST_QUEST;
      p.questProgress = existing.questProgress ?? 0;
      p.questPhase = existing.questPhase === "active" || existing.questPhase === "ready" ? existing.questPhase : "idle";
    } else {
      p.name = options?.name?.slice(0, 12) || `ぼうけんしゃ${colorIdx + 1}`;
      p.x = hub.spawnX + colorIdx * 60;
      p.y = hub.spawnY;
    }

    this.state.players.set(client.sessionId, p);
    this.playerIds.set(client.sessionId, playerId);
    this.secrets.set(client.sessionId, secret);
    this.savePlayer(client.sessionId, p);
    console.log(
      `[join] ${p.name} Lv${p.level} (${client.sessionId}) ${existing ? "復元" : "新規"} (${this.clients.length}/4)`
    );
  }

  private savePlayer(sessionId: string, p: Player) {
    const playerId = this.playerIds.get(sessionId);
    const secret = this.secrets.get(sessionId);
    if (!playerId || !secret) return;
    store.upsert({
      playerId,
      secret,
      name: p.name,
      level: p.level,
      exp: p.exp,
      mapId: p.mapId,
      x: p.x,
      y: p.y,
      questId: p.questId,
      questProgress: p.questProgress,
      questPhase: p.questPhase,
      job: p.job,
      sp: p.sp,
      statAtk: p.statAtk,
      statHp: p.statHp,
      statSpd: p.statSpd,
      statSpec: p.statSpec,
      sketchBook: p.sketchBook,
      equippedSketch: p.equippedSketch,
      coins: p.coins,
      potions: p.potions,
      colorIdx: p.colorIdx,
      updatedAt: Date.now(),
    });
  }

  private saveAll() {
    this.state.players.forEach((p, sessionId) => this.savePlayer(sessionId, p));
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) this.savePlayer(client.sessionId, p);
    console.log(`[leave] ${p?.name} (${client.sessionId})`);
    this.state.players.delete(client.sessionId);
    this.playerIds.delete(client.sessionId);
    this.secrets.delete(client.sessionId);
    this.lastDamagedAt.delete(client.sessionId);
    this.sketchCooldown.delete(client.sessionId);
    this.shieldUntil.delete(client.sessionId);
    store.flush();
  }

  onDispose() {
    this.saveAll();
    store.flush();
  }
}
