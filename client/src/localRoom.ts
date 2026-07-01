// ソロ（1人）プレイ用のローカルシミュレーション。
// GitHub Pages のような静的ホスティングでもサーバー無しで遊べるように、
// server/src/rooms/WorldRoom.ts のゲームロジックをブラウザ内へ移植したもの。
// GameScene からは colyseus.js の Room とほぼ同じ形（state / send / onMessage）で使える。
// セーブは localStorage（"pages_solo_save"）。マルチ通信のコードはそのまま残す。
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
} from "../../shared/maps";
import { QUESTS, FIRST_QUEST } from "../../shared/quests";
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
} from "../../shared/jobs";
import { SKETCHES, sketchJobMod, SHIELD_DMG_MUL, hasSketch, addSketch, type SketchDef } from "../../shared/sketches";

const ATTACK_RANGE_X = 80;
const ATTACK_BACK_X = 24;
const ATTACK_RANGE_Y = 60;
const TOUCH_RANGE_X = 34;
const TOUCH_RANGE_Y = 44;
const TOUCH_COOLDOWN_MS = 1000;
const ENEMY_RESPAWN_MS = 6000;
const PLAYER_RESPAWN_MS = 3000;
const REGEN_INTERVAL_MS = 1000;
const REGEN_AFTER_DAMAGE_MS = 5000;
const AUTOSAVE_INTERVAL_MS = 15000;
const POTION_COST = 40;
const POTION_HEAL_RATIO = 0.4;
const BOSS_SPECIAL_INTERVAL_MS = 6000;
const BOSS_WINDUP_MS = 950;
const BOSS_SLAM_RANGE_X = 250;
const BOSS_SLAM_RANGE_Y = 170;
const BOSS_CHARGE_DIST = 340;

const SOLO_ID = "solo";
const SAVE_KEY = "pages_solo_save";

type Cb = () => void;

/** colyseus の MapSchema っぽい入れ物（onAdd は登録時に既存分を再生する） */
class LocalMap<T = any> {
  private m = new Map<string, T>();
  private addCbs: ((v: T, k: string) => void)[] = [];
  private removeCbs: ((v: T, k: string) => void)[] = [];
  get size() { return this.m.size; }
  get(k: string) { return this.m.get(k); }
  has(k: string) { return this.m.has(k); }
  set(k: string, v: T) { this.m.set(k, v); this.addCbs.forEach((cb) => cb(v, k)); return this; }
  delete(k: string) { const v = this.m.get(k); const r = this.m.delete(k); if (r && v) this.removeCbs.forEach((cb) => cb(v, k)); return r; }
  forEach(cb: (v: T, k: string) => void) { this.m.forEach(cb); }
  values() { return this.m.values(); }
  onAdd(cb: (v: T, k: string) => void) { this.addCbs.push(cb); this.m.forEach((v, k) => cb(v, k)); }
  onRemove(cb: (v: T, k: string) => void) { this.removeCbs.push(cb); }
}

/** onChange を持つ素の状態オブジェクトを作る */
function stateful<T extends object>(obj: T): T & { onChange: (cb: Cb) => void; __emit: () => void } {
  const cbs: Cb[] = [];
  Object.defineProperty(obj, "onChange", { value: (cb: Cb) => cbs.push(cb), enumerable: false });
  Object.defineProperty(obj, "__emit", { value: () => cbs.forEach((cb) => cb()), enumerable: false });
  return obj as any;
}

interface EnemyMeta {
  def: any;
  dir: 1 | -1;
  respawnAt: number;
  touchCooldown: number;
  stunnedUntil: number;
  specialAt: number;
  windupUntil: number;
  specialPhase: "idle" | "windup";
  specialType: "slam" | "charge";
}

/** ソロプレイのゲーム本体。GameScene から Room 互換で使う。 */
export class LocalRoom {
  readonly sessionId = SOLO_ID;
  state = { players: new LocalMap<any>(), enemies: new LocalMap<any>() };

  private handlers = new Map<string, (data: any) => void>();
  private enemyMeta = new Map<string, EnemyMeta>();
  private contrib = new Map<string, Map<string, number>>();
  private lastDamagedAt = 0;
  private healCooldown = 0;
  private lastRegenAt = 0;
  private sketchCooldown = 0;
  private shieldUntil = 0;
  private tickTimer: any;
  private saveTimer: any;
  private p: any; // ソロプレイヤー

  constructor(opts: { name?: string; charIdx?: number }) {
    this.spawnAllEnemies();
    this.addPlayer(opts);
    this.tickTimer = setInterval(() => this.tick(50), 50);
    this.saveTimer = setInterval(() => this.save(), AUTOSAVE_INTERVAL_MS);
  }

  // ---- Room 互換 API ----
  onMessage(type: string, cb: (data: any) => void) { this.handlers.set(type, cb); }
  send(type: string, data?: any) { this.route(type, data); }
  leave() { clearInterval(this.tickTimer); clearInterval(this.saveTimer); this.save(); }
  private broadcast(type: string, data: any) { const h = this.handlers.get(type); if (h) h(data); }

  private route(type: string, data: any) {
    const p = this.p;
    switch (type) {
      case "move": return this.onMove(data);
      case "attack": return this.handleAttack();
      case "chooseJob": return this.onChooseJob(data);
      case "heal": return this.onHeal();
      case "equipSketch": return this.onEquipSketch(data);
      case "castSketch": return this.handleCastSketch();
      case "buyPotion": return this.onBuyPotion();
      case "usePotion": return this.onUsePotion();
      case "enterDoor": return this.onEnterDoor(data);
      case "acceptQuest": return this.onAcceptQuest();
      case "claimQuest": return this.onClaimQuest();
      case "spendSp": return this.onSpendSp(data);
      case "devGrantExp": if (data?.amount) this.giveExp(p, Math.max(0, Math.min(100000, Number(data.amount) || 0))); return;
    }
  }

  // ---- 生成 ----
  private spawnAllEnemies() {
    for (const map of Object.values(MAPS)) {
      for (const def of map.enemies) {
        const stats = enemyStats(def.level, def.boss);
        const e = stateful({
          kind: def.kind, mapId: map.id, level: def.level, boss: !!def.boss,
          x: def.x, y: def.y, flip: false, hp: stats.maxHp, maxHp: stats.maxHp, dead: false,
        });
        this.state.enemies.set(def.id, e);
        this.enemyMeta.set(def.id, {
          def, dir: 1, respawnAt: 0, touchCooldown: 0, stunnedUntil: 0,
          specialAt: Date.now() + 4000, windupUntil: 0, specialPhase: "idle", specialType: "slam",
        });
      }
    }
  }

  private addPlayer(opts: { name?: string; charIdx?: number }) {
    const hub = MAPS.hub;
    const saved = this.load();
    const colorIdx = Number.isInteger(opts.charIdx) && opts.charIdx! >= 0 && opts.charIdx! <= 3 ? opts.charIdx! : saved?.colorIdx ?? 0;
    const p = stateful<any>({
      x: hub.spawnX, y: hub.spawnY, flip: false, anim: "idle", colorIdx,
      name: "", mapId: "hub", level: 1, exp: 0, expToNext: expToNext(1),
      hp: playerMaxHp(1), maxHp: playerMaxHp(1), dead: false,
      questId: FIRST_QUEST, questProgress: 0, questPhase: "idle", job: "novice",
      sp: 0, statAtk: 0, statHp: 0, statSpd: 0, statSpec: 0,
      sketchBook: "", equippedSketch: "", coins: 0, potions: 0,
    });
    if (saved) {
      p.name = opts.name?.slice(0, 12) || saved.name || "ぼうけんしゃ";
      p.level = Math.min(saved.level ?? 1, LEVEL_CAP);
      p.exp = saved.exp ?? 0;
      p.job = saved.job && JOBS[saved.job] ? saved.job : "novice";
      p.sp = saved.sp ?? 0;
      p.statAtk = saved.statAtk ?? 0; p.statHp = saved.statHp ?? 0; p.statSpd = saved.statSpd ?? 0; p.statSpec = saved.statSpec ?? 0;
      p.sketchBook = saved.sketchBook ?? ""; p.equippedSketch = saved.equippedSketch ?? "";
      p.coins = saved.coins ?? 0; p.potions = saved.potions ?? 0;
      p.expToNext = expToNext(p.level);
      p.maxHp = this.calcMaxHp(p); p.hp = p.maxHp;
      p.mapId = MAPS[saved.mapId] ? saved.mapId : "hub";
      p.x = saved.x ?? hub.spawnX; p.y = saved.y ?? hub.spawnY;
      p.questId = saved.questId ?? FIRST_QUEST;
      p.questProgress = saved.questProgress ?? 0;
      p.questPhase = saved.questPhase === "active" || saved.questPhase === "ready" ? saved.questPhase : "idle";
    } else {
      p.name = opts.name?.slice(0, 12) || "ぼうけんしゃ";
    }
    this.p = p;
    this.state.players.set(SOLO_ID, p);
  }

  // ---- セーブ（localStorage）----
  private save() {
    if (!this.p) return;
    const p = this.p;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        name: p.name, level: p.level, exp: p.exp, mapId: p.mapId, x: p.x, y: p.y,
        questId: p.questId, questProgress: p.questProgress, questPhase: p.questPhase, job: p.job,
        sp: p.sp, statAtk: p.statAtk, statHp: p.statHp, statSpd: p.statSpd, statSpec: p.statSpec,
        sketchBook: p.sketchBook, equippedSketch: p.equippedSketch, coins: p.coins, potions: p.potions, colorIdx: p.colorIdx,
      }));
    } catch {}
  }
  private load(): any | null {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  }

  // ---- ヘルパー ----
  private calcMaxHp(p: any) { return Math.round(playerMaxHp(p.level) * jobHpMul(p.job)) + p.statHp * 15; }
  private rootJob(job: string): string { let j: any = JOBS[job]; while (j?.parent) j = JOBS[j.parent]; return j?.id ?? "novice"; }

  // ---- メッセージ処理 ----
  private onMove(data: { x: number; y: number; flip: boolean; anim: string }) {
    const p = this.p; if (!p || p.dead) return;
    const map = MAPS[p.mapId];
    p.x = Math.max(0, Math.min(map.width, Number(data.x) || 0));
    p.y = Math.max(0, Math.min(map.height, Number(data.y) || 0));
    p.flip = !!data.flip;
    p.anim = typeof data.anim === "string" ? data.anim : "idle";
  }

  private handleAttack() {
    const p = this.p; if (!p || p.dead) return;
    const ranged = JOBS[p.job]?.range === "ranged";
    const root = this.rootJob(p.job);
    const specRange = root === "ink" ? p.statSpec * 12 : root === "pencil" ? p.statSpec * 5 : 0;
    const rangeX = (ranged ? RANGED_ATTACK_X : ATTACK_RANGE_X) + specRange;
    const rangeY = ranged ? RANGED_ATTACK_Y : ATTACK_RANGE_Y;
    let bestId: string | null = null, bestDist = Infinity;
    this.state.enemies.forEach((e, id) => {
      if (e.dead || e.mapId !== p.mapId) return;
      if (Math.abs(e.y - p.y) > rangeY) return;
      const dx = e.x - p.x;
      const forward = p.flip ? -dx : dx;
      if (forward < -ATTACK_BACK_X || forward > rangeX) return;
      const dist = Math.abs(dx);
      if (dist < bestDist) { bestDist = dist; bestId = id; }
    });
    if (!bestId) return;
    const enemy = this.state.enemies.get(bestId)!;
    const dmg = Math.max(1, Math.round(playerAtk(p.level) * jobAtkMul(p.job) * (1 + p.statAtk * 0.04)));
    enemy.hp = Math.max(0, enemy.hp - dmg);
    this.addContrib(bestId, dmg);
    this.broadcast("hit", { enemyId: bestId, dmg, by: SOLO_ID, x: enemy.x, y: enemy.y });
    if (enemy.hp <= 0) this.killEnemy(bestId, enemy);
  }

  private addContrib(id: string, dmg: number) {
    let c = this.contrib.get(id); if (!c) { c = new Map(); this.contrib.set(id, c); }
    c.set(SOLO_ID, (c.get(SOLO_ID) || 0) + dmg);
  }

  private killEnemy(enemyId: string, enemy: any) {
    enemy.dead = true;
    const meta = this.enemyMeta.get(enemyId)!;
    meta.respawnAt = Date.now() + ENEMY_RESPAWN_MS;
    const c = this.contrib.get(enemyId);
    if (c && c.size > 0) {
      const p = this.p;
      const baseExp = enemyStats(enemy.level, enemy.boss).exp;
      const bonus = PARTY_BONUS[1];
      const weight = CONTRIB_WEIGHT * 1 + LEVEL_WEIGHT * 1; // ソロは貢献度・レベル比とも100%
      const gain = Math.max(1, Math.round(baseExp * weight * bonus));
      this.giveExp(p, gain);
      this.progressQuest(p, enemy);
      this.learnSketch(p, enemy.kind);
      const coinDrop = Math.max(1, Math.round((2 + enemy.level * 0.7) * (enemy.boss ? 5 : 1)));
      p.coins += coinDrop;
      this.broadcast("coin", { sessionId: SOLO_ID, amount: coinDrop });
    }
    this.contrib.delete(enemyId);
  }

  private learnSketch(p: any, kind: string) {
    if (!SKETCHES[kind] || hasSketch(p.sketchBook, kind)) return;
    p.sketchBook = addSketch(p.sketchBook, kind);
    if (!p.equippedSketch) p.equippedSketch = kind;
    this.broadcast("sketchLearned", { sessionId: SOLO_ID, kind });
    this.save();
  }

  private onChooseJob(data: { job: string }) {
    const p = this.p; if (!p || p.dead) return;
    const target = JOBS[data?.job]; if (!target) return;
    if (!availableJobs(p.job, p.level).some((j) => j.id === target.id)) return;
    p.job = target.id; p.maxHp = this.calcMaxHp(p); p.hp = p.maxHp;
    this.broadcast("jobChosen", { sessionId: SOLO_ID, job: p.job });
    this.save();
  }

  private onHeal() {
    const p = this.p; if (!p || p.dead || !isHealer(p.job)) return;
    const now = Date.now();
    if (now < this.healCooldown) return;
    this.healCooldown = now + HEAL_COOLDOWN_MS;
    const ratio = jobHealRatio(p.job) + (this.rootJob(p.job) === "palette" ? p.statSpec * 0.012 : 0);
    const amount = Math.round(p.maxHp * ratio);
    const healed = Math.min(p.maxHp - p.hp, amount);
    const targets: any[] = [];
    if (healed > 0) { p.hp += healed; targets.push({ sessionId: SOLO_ID, amount: healed }); }
    this.broadcast("healed", { by: SOLO_ID, x: p.x, y: p.y, targets });
  }

  private onEquipSketch(data: { kind: string }) {
    const p = this.p; if (!p) return;
    const kind = data?.kind ?? "";
    if (kind !== "" && !hasSketch(p.sketchBook, kind)) return;
    p.equippedSketch = kind; this.save();
  }

  private handleCastSketch() {
    const p = this.p; if (!p || p.dead) return;
    const def = SKETCHES[p.equippedSketch];
    if (!def || !hasSketch(p.sketchBook, def.kind)) return;
    const now = Date.now();
    if (now < this.sketchCooldown) return;
    this.sketchCooldown = now + def.cooldownMs;
    const mod = sketchJobMod(this.rootJob(p.job));
    const dir: 1 | -1 = p.flip ? -1 : 1;
    if (mod.selfShieldMs > 0) this.shieldUntil = now + mod.selfShieldMs;
    if (mod.allyHealRatio > 0) p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * mod.allyHealRatio));
    this.broadcast("sketchCast", { by: SOLO_ID, kind: def.kind, type: def.type, x: p.x, y: p.y, flip: p.flip });
    if (def.type === "buff") return;
    const dmg = Math.max(1, Math.round(playerAtk(p.level) * def.dmgMul * (1 + p.statAtk * 0.04) * mod.dmgMul));
    const rangeX = def.rangeX * mod.rangeMul;
    const rangeY = def.rangeY * mod.rangeMul;
    const stunMs = def.type === "stun" ? def.durationMs || 0 : 0;
    if (def.type === "dot" && def.ticks && def.durationMs) {
      const interval = def.durationMs / def.ticks;
      for (let i = 0; i < def.ticks; i++) {
        setTimeout(() => { if (this.p && !this.p.dead) this.sketchHitArea(def, dir, rangeX, rangeY, dmg, 0); }, Math.round(interval * i));
      }
      return;
    }
    this.sketchHitArea(def, dir, rangeX, rangeY, dmg, stunMs);
  }

  private sketchHitArea(def: SketchDef, dir: 1 | -1, rangeX: number, rangeY: number, dmg: number, stunMs: number) {
    const p = this.p; const now = Date.now();
    this.state.enemies.forEach((e, id) => {
      if (e.dead || e.mapId !== p.mapId) return;
      let inRange: boolean;
      if (def.type === "aoe") inRange = Math.abs(e.x - p.x) <= rangeX && Math.abs(e.y - p.y) <= rangeY;
      else { const forward = dir * (e.x - p.x); inRange = forward >= -20 && forward <= rangeX && Math.abs(e.y - p.y) <= rangeY; }
      if (!inRange) return;
      e.hp = Math.max(0, e.hp - dmg);
      this.addContrib(id, dmg);
      this.broadcast("hit", { enemyId: id, dmg, by: SOLO_ID, x: e.x, y: e.y });
      if (stunMs > 0) { const meta = this.enemyMeta.get(id); if (meta) { meta.stunnedUntil = now + stunMs; e.x = Math.max(0, Math.min(MAPS[e.mapId].width, e.x + dir * 40)); } }
      if (e.hp <= 0) this.killEnemy(id, e);
    });
  }

  private onBuyPotion() {
    const p = this.p; if (!p || p.coins < POTION_COST) return;
    p.coins -= POTION_COST; p.potions += 1;
    this.broadcast("bought", { sessionId: SOLO_ID }); this.save();
  }
  private onUsePotion() {
    const p = this.p; if (!p || p.dead || p.potions <= 0 || p.hp >= p.maxHp) return;
    p.potions -= 1;
    const healed = Math.min(p.maxHp - p.hp, Math.round(p.maxHp * POTION_HEAL_RATIO));
    p.hp += healed;
    this.broadcast("potionUsed", { sessionId: SOLO_ID, amount: healed }); this.save();
  }

  private onEnterDoor(data: { doorId: string }) {
    const p = this.p; if (!p || p.dead) return;
    const door = MAPS[p.mapId]?.doors.find((d) => d.id === data?.doorId);
    if (!door) return;
    if (Math.abs(p.x - door.x) > 90 || Math.abs(p.y - door.y) > 120) return;
    p.mapId = door.toMap; p.x = door.toX; p.y = door.toY;
  }

  private onAcceptQuest() {
    const p = this.p; if (!p || p.dead) return;
    if (p.questPhase !== "idle" || !QUESTS[p.questId]) return;
    p.questPhase = "active"; p.questProgress = 0;
    this.broadcast("questAccepted", { sessionId: SOLO_ID, questId: p.questId }); this.save();
  }
  private onClaimQuest() {
    const p = this.p; if (!p || p.dead) return;
    const quest = QUESTS[p.questId];
    if (p.questPhase !== "ready" || !quest) return;
    this.broadcast("questClear", { sessionId: SOLO_ID, questId: quest.id, rewardExp: quest.rewardExp });
    this.giveExp(p, quest.rewardExp);
    p.questId = quest.next ?? ""; p.questPhase = "idle"; p.questProgress = 0; this.save();
  }

  private onSpendSp(data: { stat: string }) {
    const p = this.p; if (!p || p.sp <= 0) return;
    if (data?.stat === "atk" && p.statAtk < 60) p.statAtk++;
    else if (data?.stat === "hp" && p.statHp < 60) { p.statHp++; p.maxHp = this.calcMaxHp(p); p.hp = Math.min(p.hp + 15, p.maxHp); }
    else if (data?.stat === "spd" && p.statSpd < 25) p.statSpd++;
    else if (data?.stat === "spec" && p.job !== "novice" && p.statSpec < 30) p.statSpec++;
    else return;
    p.sp--; this.save();
  }

  private progressQuest(p: any, enemy: any) {
    const quest = QUESTS[p.questId];
    if (!quest || p.questPhase !== "active") return;
    if (enemy.mapId !== quest.targetMap) return;
    if (quest.targetBoss && !enemy.boss) return;
    p.questProgress++;
    if (p.questProgress < quest.targetCount) return;
    p.questPhase = "ready";
    this.broadcast("questReady", { sessionId: SOLO_ID, questId: quest.id });
  }

  private giveExp(p: any, gain: number) {
    if (p.level >= LEVEL_CAP) return;
    p.exp += gain;
    this.broadcast("exp", { sessionId: SOLO_ID, amount: gain });
    while (p.exp >= p.expToNext && p.level < LEVEL_CAP) {
      p.exp -= p.expToNext; p.level++; p.expToNext = expToNext(p.level); p.sp += 3;
      p.maxHp = this.calcMaxHp(p); p.hp = p.maxHp;
      this.broadcast("levelup", { sessionId: SOLO_ID, level: p.level });
    }
  }

  private killPlayer(p: any) {
    p.dead = true; p.anim = "idle";
    this.broadcast("died", { sessionId: SOLO_ID });
    setTimeout(() => {
      const hub = MAPS.hub;
      p.mapId = "hub"; p.x = hub.spawnX; p.y = hub.spawnY; p.hp = p.maxHp; p.dead = false;
      this.broadcast("respawn", { sessionId: SOLO_ID });
    }, PLAYER_RESPAWN_MS);
  }

  // ---- シミュレーション ----
  private tick(dtMs: number) {
    const now = Date.now();
    const dt = dtMs / 1000;
    const p = this.p;

    this.state.enemies.forEach((e, id) => {
      const meta = this.enemyMeta.get(id)!;
      if (e.dead) {
        if (now >= meta.respawnAt) {
          const stats = enemyStats(e.level, e.boss);
          e.hp = stats.maxHp; e.x = meta.def.x; e.y = meta.def.y; e.dead = false;
        }
        return;
      }
      const stunned = now < meta.stunnedUntil;
      if (e.boss && !stunned) {
        const hasPlayer = !p.dead && p.mapId === e.mapId;
        if (meta.specialPhase === "idle" && now >= meta.specialAt && hasPlayer) {
          meta.specialPhase = "windup"; meta.windupUntil = now + BOSS_WINDUP_MS;
          meta.specialType = meta.specialType === "slam" ? "charge" : "slam";
          this.broadcast("bossWarn", { enemyId: id, type: meta.specialType, x: e.x, y: e.y });
        } else if (meta.specialPhase === "windup" && now >= meta.windupUntil) {
          this.executeBossSpecial(id, e, meta, now); meta.specialPhase = "idle"; meta.specialAt = now + BOSS_SPECIAL_INTERVAL_MS;
        }
      }
      const bossWindup = e.boss && meta.specialPhase === "windup";
      const stats = enemyStats(e.level, e.boss);
      if (!stunned && !bossWindup) {
        e.x += meta.dir * stats.speed * dt;
        if (e.x >= meta.def.patrolMax) meta.dir = -1;
        if (e.x <= meta.def.patrolMin) meta.dir = 1;
        e.flip = meta.dir < 0;
      }
      if (stunned) return;
      // タッチダメージ（ソロ = プレイヤー1人）
      if (!p.dead && p.mapId === e.mapId && Math.abs(p.x - e.x) <= TOUCH_RANGE_X && Math.abs(p.y - e.y) <= TOUCH_RANGE_Y && now >= meta.touchCooldown) {
        meta.touchCooldown = now + TOUCH_COOLDOWN_MS;
        let dmgTaken = stats.touchDmg;
        if (this.rootJob(p.job) === "crayon") dmgTaken = Math.max(1, Math.round(dmgTaken * (1 - p.statSpec * 0.03)));
        if (now < this.shieldUntil) dmgTaken = Math.max(1, Math.round(dmgTaken * SHIELD_DMG_MUL));
        p.hp = Math.max(0, p.hp - dmgTaken);
        this.lastDamagedAt = now;
        this.broadcast("playerHit", { sessionId: SOLO_ID, dmg: dmgTaken });
        if (p.hp <= 0) this.killPlayer(p);
      }
    });

    // 自然回復
    if (now - this.lastRegenAt >= REGEN_INTERVAL_MS) {
      this.lastRegenAt = now;
      if (!p.dead && p.hp < p.maxHp && now - this.lastDamagedAt >= REGEN_AFTER_DAMAGE_MS) {
        p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(p.maxHp * 0.04)));
      }
    }

    // GameScene に変化を通知（敵の onChange を毎tick発火）
    this.state.enemies.forEach((e) => (e as any).__emit());
  }

  private executeBossSpecial(id: string, e: any, meta: EnemyMeta, now: number) {
    const p = this.p;
    const stats = enemyStats(e.level, e.boss);
    const dmg = Math.round(stats.touchDmg * 2.2);
    const map = MAPS[e.mapId];
    if (meta.specialType === "slam") {
      if (!p.dead && p.mapId === e.mapId && Math.abs(p.x - e.x) <= BOSS_SLAM_RANGE_X && Math.abs(p.y - e.y) <= BOSS_SLAM_RANGE_Y) {
        p.x = Math.max(0, Math.min(map.width, p.x + (p.x < e.x ? -60 : 60)));
        this.applyBossDamage(p, dmg, now);
      }
      this.broadcast("bossAttack", { enemyId: id, type: "slam", x: e.x, y: e.y, range: BOSS_SLAM_RANGE_X });
    } else {
      const dir = !p.dead && p.mapId === e.mapId && p.x < e.x ? -1 : 1;
      const x0 = e.x;
      const x1 = Math.max(0, Math.min(map.width, e.x + dir * BOSS_CHARGE_DIST));
      e.x = x1; e.flip = dir < 0;
      const lo = Math.min(x0, x1) - 40, hi = Math.max(x0, x1) + 40;
      if (!p.dead && p.mapId === e.mapId && p.x >= lo && p.x <= hi && Math.abs(p.y - e.y) <= 80) {
        p.x = Math.max(0, Math.min(map.width, p.x + dir * 50));
        this.applyBossDamage(p, dmg, now);
      }
      this.broadcast("bossAttack", { enemyId: id, type: "charge", x0, x1, y: e.y });
    }
  }

  private applyBossDamage(p: any, dmg: number, now: number) {
    let d = dmg;
    if (this.rootJob(p.job) === "crayon") d = Math.max(1, Math.round(d * (1 - p.statSpec * 0.03)));
    if (now < this.shieldUntil) d = Math.max(1, Math.round(d * SHIELD_DMG_MUL));
    p.hp = Math.max(0, p.hp - d);
    this.lastDamagedAt = now;
    this.broadcast("playerHit", { sessionId: SOLO_ID, dmg: d });
    if (p.hp <= 0) this.killPlayer(p);
  }
}
