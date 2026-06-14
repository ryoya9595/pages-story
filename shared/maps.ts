// サーバー・クライアント共有のマップ＆バランス定義
// 「ページ（部屋）単位の分割マップを扉で繋ぐ」方式。1ページ＝1つのMapDef。

export interface PlatformDef {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EnemySpawnDef {
  id: string;
  kind: string; // ENEMY_KINDS のキー
  level: number;
  x: number;
  y: number;
  patrolMin: number;
  patrolMax: number;
  boss?: boolean;
}

// 敵図鑑（デザインはオリジナル、空気感はメイプルリスペクト）
export const ENEMY_KINDS: Record<string, { name: string }> = {
  makimaki: { name: "マキマキ" }, // 鉛筆削りカスが殻のカタツムリ。最弱
  inkdama: { name: "インクだまり" }, // ぷるぷる跳ねる墨のしずく
  kinoko: { name: "ヌリカケキノコ" }, // 傘が塗りかけのキノコ
  rafbear: { name: "ラフベアー" }, // 描きかけで放置された巨大クマの下書き
  keshiboo: { name: "ケシブー" }, // 消しゴムのブタ
  fudemushi: { name: "フデムシ" }, // 筆の穂先の毛虫
  golem: { name: "エノグゴーレム" }, // 絵の具チューブのゴーレム
  // ↓第4-7章用の予約枠（名前だけ確保。今は既存種を流用、後でアート＋専用挙動を差し込む）
  hoshimushi: { name: "ホシムシ" }, // 4章: 星のカケラの虫（飛ぶ予定）
  nebusuke: { name: "ネブスケ" }, // 4章: 寝ぼけスライム
  kaminari: { name: "カミナリダマ" }, // 5章: 雷の玉
  namiko: { name: "ナミコゾウ" }, // 5章: 波の子
  nijicho: { name: "ニジチョウ" }, // 6章: 虹の蝶（飛ぶ予定）
  hikaridama: { name: "ヒカリダマ" }, // 6章: 光の玉
  kageboushi: { name: "カゲボウシ" }, // 7章: 消しゴムの影
  // ボス予約
  nemuriguma: { name: "ねむりぐま" }, // 4章ボス
  raiu_golem: { name: "らいうゴーレム" }, // 5章ボス
  irodori: { name: "いろどりの主" }, // 6章ボス
  rakugaki_daio: { name: "ラクガキ大王" }, // 7章ラスボス
};

export interface LadderDef {
  x: number;
  y1: number; // 上端
  y2: number; // 下端
}

export interface NpcDef {
  id: string;
  key: string; // テクスチャキー（npc_xxx）
  x: number;
  y: number;
  name: string;
  /** 近づくと話す台詞（しおり妖精はクエスト案内なので使わない） */
  lines: string[];
  float?: boolean; // ふわふわ浮く（妖精用）
}

export interface DoorDef {
  id: string;
  x: number;
  y: number;
  toMap: string;
  toX: number;
  toY: number;
  label: string;
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  spawnX: number;
  spawnY: number;
  platforms: PlatformDef[];
  enemies: EnemySpawnDef[];
  doors: DoorDef[];
  ladders: LadderDef[];
  npcs: NpcDef[];
}

export const WORLD_H = 720;
export const LEVEL_CAP = 100;

// ===== バランス式（プロト版。手触りを見て調整する） =====

export const enemyStats = (level: number, boss = false) => ({
  maxHp: Math.round((20 + level * 12) * (boss ? 3 : 1)),
  touchDmg: 2 + level * 3,
  exp: Math.round((6 + level * 8) * (boss ? 3 : 1)),
  speed: 40 + level * 2,
});

export const playerMaxHp = (level: number) => 50 + level * 10;
export const playerAtk = (level: number) => 4 + level * 2;
export const expToNext = (level: number) => Math.floor(20 * Math.pow(level, 1.5));

// パーティ人数ボーナス（index=分配対象人数）
export const PARTY_BONUS = [1, 1, 1.1, 1.15, 1.2];

// 経験値分配の重み: 貢献度50% + レベル比50%
export const CONTRIB_WEIGHT = 0.5;
export const LEVEL_WEIGHT = 0.5;

// ===== マップ定義 =====

// 各マップに置く道案内の妖精（しおりの妖精）。クエストの受注・報告窓口を常に近くに。
const guideFairy = (x = 300): NpcDef => ({
  id: "shiori", key: "npc_shiori", x, y: 604, name: "しおりの妖精", lines: [], float: true,
});

export const MAPS: Record<string, MapDef> = {
  hub: {
    id: "hub",
    name: "もくじ広場",
    width: 1600,
    height: WORLD_H,
    spawnX: 200,
    spawnY: 480,
    platforms: [
      { x: 800, y: 688, w: 1600, h: 64 },
      { x: 500, y: 520, w: 200, h: 26 },
      { x: 820, y: 420, w: 180, h: 26 },
      { x: 1150, y: 500, w: 220, h: 26 },
    ],
    enemies: [
      { id: "hub-1", kind: "makimaki", level: 1, x: 600, y: 636, patrolMin: 480, patrolMax: 740 },
      { id: "hub-2", kind: "makimaki", level: 1, x: 940, y: 636, patrolMin: 840, patrolMax: 1060 },
      { id: "hub-3", kind: "inkdama", level: 2, x: 1250, y: 636, patrolMin: 1160, patrolMax: 1390 },
      { id: "hub-4", kind: "keshiboo", level: 4, x: 500, y: 495, patrolMin: 420, patrolMax: 580 }, // 中段の足場
    ],
    doors: [
      { id: "to-forest", x: 1552, y: 612, toMap: "forest", toX: 140, toY: 612, label: "らくがきの森へ→" },
      { id: "to-sky", x: 60, y: 612, toMap: "sky", toX: 140, toY: 612, label: "←くものページへ" },
    ],
    ladders: [
      { x: 430, y1: 507, y2: 656 }, // 地面 → ケシブーの中段足場（ジャンプ120pxでは届かないので必須）
      { x: 830, y1: 407, y2: 656 }, // 地面 → 中段の足場
      { x: 1160, y1: 487, y2: 656 },
    ],
    npcs: [
      {
        id: "shiori",
        key: "npc_shiori",
        x: 300,
        y: 604,
        name: "しおりの妖精",
        lines: [], // クエスト案内（クライアント側で現在クエストを表示）
        float: true,
      },
      {
        id: "elder",
        key: "npc_elder",
        x: 1380,
        y: 601,
        name: "ページ長老",
        lines: [
          "ようこそ『描きかけの絵本の国』へ…",
          "この世界は まだ かきかけじゃ。白いページの先は だれも知らん…",
          "はしごは 上キーや スティックの上で のぼれるぞい",
          "つよい なかまと いっしょなら、森の おくにも いけるじゃろう",
          "らくがきの森の おくには おそろしい クマの ラフがおる…",
        ],
      },
    ],
  },
  forest: {
    id: "forest",
    name: "らくがきの森",
    width: 2200,
    height: WORLD_H,
    spawnX: 140,
    spawnY: 560,
    platforms: [
      { x: 1100, y: 688, w: 2200, h: 64 },
      { x: 480, y: 500, w: 220, h: 26 },
      { x: 900, y: 400, w: 200, h: 26 },
      { x: 1400, y: 480, w: 260, h: 26 },
      { x: 1900, y: 380, w: 200, h: 26 },
    ],
    enemies: [
      { id: "f-1", kind: "kinoko", level: 6, x: 520, y: 636, patrolMin: 380, patrolMax: 700 },
      { id: "f-2", kind: "kinoko", level: 6, x: 1000, y: 636, patrolMin: 860, patrolMax: 1200 },
      { id: "f-3", kind: "inkdama", level: 7, x: 1500, y: 636, patrolMin: 1360, patrolMax: 1700 },
      { id: "f-4", kind: "rafbear", level: 10, x: 2000, y: 630, patrolMin: 1860, patrolMax: 2120, boss: true },
    ],
    doors: [
      { id: "to-hub", x: 140, y: 612, toMap: "hub", toX: 1552, toY: 612, label: "←もくじ広場へ" },
      { id: "to-swamp", x: 2144, y: 612, toMap: "swamp", toX: 140, toY: 612, label: "インクのぬまへ→" },
      { id: "to-cave", x: 1100, y: 612, toMap: "cave", toX: 140, toY: 612, label: "インクのどうくつ↓" },
    ],
    ladders: [
      { x: 910, y1: 387, y2: 656 },
      { x: 1420, y1: 467, y2: 656 },
    ],
    npcs: [guideFairy()],
  },
  swamp: {
    id: "swamp",
    name: "インクのぬま",
    width: 2400,
    height: WORLD_H,
    spawnX: 140,
    spawnY: 560,
    platforms: [
      { x: 1200, y: 688, w: 2400, h: 64 },
      { x: 520, y: 500, w: 220, h: 26 },
      { x: 950, y: 410, w: 200, h: 26 },
      { x: 1450, y: 490, w: 260, h: 26 },
      { x: 1950, y: 400, w: 220, h: 26 },
    ],
    enemies: [
      { id: "s-1", kind: "fudemushi", level: 13, x: 520, y: 636, patrolMin: 380, patrolMax: 700 },
      { id: "s-2", kind: "fudemushi", level: 14, x: 1000, y: 636, patrolMin: 860, patrolMax: 1180 },
      { id: "s-3", kind: "inkdama", level: 16, x: 1500, y: 636, patrolMin: 1360, patrolMax: 1700 },
      { id: "s-4", kind: "golem", level: 20, x: 2050, y: 628, patrolMin: 1900, patrolMax: 2250, boss: true },
    ],
    doors: [
      { id: "to-forest", x: 140, y: 612, toMap: "forest", toX: 2144, toY: 612, label: "←らくがきの森へ" },
      { id: "to-blank", x: 2344, y: 612, toMap: "blank", toX: 140, toY: 612, label: "しろいページへ→" },
      { id: "to-beach", x: 1200, y: 612, toMap: "beach", toX: 140, toY: 612, label: "ゆうやけのうみべ↑" },
    ],
    ladders: [
      { x: 950, y1: 397, y2: 656 },
      { x: 1450, y1: 477, y2: 656 },
    ],
    npcs: [guideFairy()],
  },
  blank: {
    id: "blank",
    name: "しろいページ",
    width: 2600,
    height: WORLD_H,
    spawnX: 140,
    spawnY: 560,
    platforms: [
      { x: 1300, y: 688, w: 2600, h: 64 },
      { x: 500, y: 510, w: 220, h: 26 },
      { x: 900, y: 420, w: 200, h: 26 },
      { x: 1300, y: 330, w: 200, h: 26 },
      { x: 1750, y: 480, w: 260, h: 26 },
      { x: 2200, y: 390, w: 220, h: 26 },
    ],
    enemies: [
      { id: "b-1", kind: "makimaki", level: 26, x: 520, y: 636, patrolMin: 380, patrolMax: 700 },
      { id: "b-2", kind: "kinoko", level: 28, x: 950, y: 636, patrolMin: 820, patrolMax: 1120 },
      { id: "b-3", kind: "fudemushi", level: 31, x: 1450, y: 636, patrolMin: 1300, patrolMax: 1650 },
      { id: "b-4", kind: "inkdama", level: 33, x: 1900, y: 636, patrolMin: 1780, patrolMax: 2080 },
      { id: "b-5", kind: "rafbear", level: 38, x: 2350, y: 630, patrolMin: 2200, patrolMax: 2500, boss: true },
    ],
    doors: [
      { id: "to-swamp", x: 140, y: 612, toMap: "swamp", toX: 2344, toY: 612, label: "←インクのぬまへ" },
      { id: "to-peak", x: 1300, y: 612, toMap: "peak", toX: 140, toY: 612, label: "おえかきのやま↑" },
    ],
    ladders: [
      { x: 900, y1: 407, y2: 656 },
      { x: 1750, y1: 467, y2: 656 },
    ],
    npcs: [guideFairy()],
  },
  sky: {
    id: "sky", name: "くものページ", width: 2200, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1100, y: 688, w: 2200, h: 64 },
      { x: 450, y: 520, w: 200, h: 26 }, { x: 750, y: 410, w: 180, h: 26 },
      { x: 1100, y: 320, w: 200, h: 26 }, { x: 1450, y: 430, w: 200, h: 26 }, { x: 1800, y: 520, w: 220, h: 26 },
    ],
    enemies: [
      { id: "sk-1", kind: "kinoko", level: 8, x: 500, y: 636, patrolMin: 360, patrolMax: 660 },
      { id: "sk-2", kind: "makimaki", level: 9, x: 1000, y: 636, patrolMin: 860, patrolMax: 1200 },
      { id: "sk-3", kind: "inkdama", level: 11, x: 1600, y: 636, patrolMin: 1450, patrolMax: 1800 },
    ],
    doors: [{ id: "to-hub", x: 140, y: 612, toMap: "hub", toX: 60, toY: 612, label: "←もくじ広場へ" }],
    ladders: [{ x: 750, y1: 397, y2: 656 }, { x: 1450, y1: 417, y2: 656 }],
    npcs: [guideFairy()],
  },
  cave: {
    id: "cave", name: "インクのどうくつ", width: 2200, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1100, y: 688, w: 2200, h: 64 },
      { x: 500, y: 500, w: 220, h: 26 }, { x: 950, y: 400, w: 200, h: 26 }, { x: 1500, y: 480, w: 260, h: 26 },
    ],
    enemies: [
      { id: "c-1", kind: "fudemushi", level: 17, x: 520, y: 636, patrolMin: 380, patrolMax: 700 },
      { id: "c-2", kind: "keshiboo", level: 19, x: 1050, y: 636, patrolMin: 900, patrolMax: 1250 },
      { id: "c-3", kind: "golem", level: 22, x: 1850, y: 628, patrolMin: 1700, patrolMax: 2050, boss: true },
    ],
    doors: [{ id: "to-forest", x: 140, y: 612, toMap: "forest", toX: 1100, toY: 612, label: "←らくがきの森へ" }],
    ladders: [{ x: 950, y1: 387, y2: 656 }],
    npcs: [guideFairy()],
  },
  beach: {
    id: "beach", name: "ゆうやけのうみべ", width: 2200, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1100, y: 688, w: 2200, h: 64 },
      { x: 550, y: 510, w: 220, h: 26 }, { x: 1050, y: 420, w: 200, h: 26 }, { x: 1600, y: 500, w: 260, h: 26 },
    ],
    enemies: [
      { id: "be-1", kind: "keshiboo", level: 23, x: 520, y: 636, patrolMin: 380, patrolMax: 700 },
      { id: "be-2", kind: "makimaki", level: 25, x: 1050, y: 636, patrolMin: 900, patrolMax: 1250 },
      { id: "be-3", kind: "kinoko", level: 27, x: 1700, y: 636, patrolMin: 1550, patrolMax: 1900 },
    ],
    doors: [{ id: "to-swamp", x: 140, y: 612, toMap: "swamp", toX: 1200, toY: 612, label: "←インクのぬまへ" }],
    ladders: [{ x: 1050, y1: 407, y2: 656 }],
    npcs: [guideFairy()],
  },
  peak: {
    id: "peak", name: "おえかきのやま", width: 2400, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1200, y: 688, w: 2400, h: 64 },
      { x: 500, y: 520, w: 200, h: 26 }, { x: 900, y: 430, w: 200, h: 26 },
      { x: 1300, y: 340, w: 200, h: 26 }, { x: 1800, y: 460, w: 240, h: 26 },
    ],
    enemies: [
      { id: "p-1", kind: "fudemushi", level: 33, x: 520, y: 636, patrolMin: 380, patrolMax: 700 },
      { id: "p-2", kind: "inkdama", level: 35, x: 1000, y: 636, patrolMin: 860, patrolMax: 1180 },
      { id: "p-3", kind: "keshiboo", level: 37, x: 1500, y: 636, patrolMin: 1360, patrolMax: 1700 },
      { id: "p-4", kind: "golem", level: 40, x: 2100, y: 628, patrolMin: 1950, patrolMax: 2300, boss: true },
    ],
    doors: [
      { id: "to-blank", x: 140, y: 612, toMap: "blank", toX: 1300, toY: 612, label: "←しろいページへ" },
      { id: "to-moonpage", x: 2344, y: 612, toMap: "moonpage", toX: 140, toY: 612, label: "つきよのページ→" },
    ],
    ladders: [{ x: 900, y1: 417, y2: 656 }, { x: 1800, y1: 447, y2: 656 }],
    npcs: [guideFairy()],
  },

  // ============ 第4章 よるのものがたり（Lv40-55）============
  moonpage: {
    id: "moonpage", name: "つきよのページ", width: 2200, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1100, y: 688, w: 2200, h: 64 },
      { x: 500, y: 510, w: 220, h: 26 }, { x: 950, y: 410, w: 200, h: 26 }, { x: 1450, y: 490, w: 260, h: 26 }, { x: 1900, y: 400, w: 220, h: 26 },
    ],
    enemies: [
      { id: "mo-1", kind: "inkdama", level: 41, x: 520, y: 636, patrolMin: 380, patrolMax: 700 },
      { id: "mo-2", kind: "keshiboo", level: 42, x: 1000, y: 636, patrolMin: 860, patrolMax: 1180 },
      { id: "mo-3", kind: "kinoko", level: 44, x: 1500, y: 636, patrolMin: 1360, patrolMax: 1700 },
      { id: "mo-4", kind: "makimaki", level: 45, x: 1950, y: 636, patrolMin: 1820, patrolMax: 2100 },
    ],
    doors: [
      { id: "to-peak", x: 140, y: 612, toMap: "peak", toX: 2344, toY: 612, label: "←おえかきのやまへ" },
      { id: "to-dream", x: 2144, y: 612, toMap: "dream", toX: 140, toY: 612, label: "ゆめのなかへ→" },
    ],
    ladders: [{ x: 950, y1: 397, y2: 656 }, { x: 1450, y1: 477, y2: 656 }],
    npcs: [guideFairy()],
  },
  dream: {
    id: "dream", name: "ゆめのなか", width: 2300, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1150, y: 688, w: 2300, h: 64 },
      { x: 520, y: 500, w: 220, h: 26 }, { x: 980, y: 400, w: 200, h: 26 }, { x: 1500, y: 480, w: 260, h: 26 }, { x: 2000, y: 410, w: 220, h: 26 },
    ],
    enemies: [
      { id: "dr-1", kind: "kinoko", level: 46, x: 520, y: 636, patrolMin: 380, patrolMax: 720 },
      { id: "dr-2", kind: "inkdama", level: 48, x: 1050, y: 636, patrolMin: 900, patrolMax: 1250 },
      { id: "dr-3", kind: "keshiboo", level: 50, x: 1550, y: 636, patrolMin: 1400, patrolMax: 1760 },
      { id: "dr-4", kind: "fudemushi", level: 51, x: 2050, y: 636, patrolMin: 1900, patrolMax: 2200 },
    ],
    doors: [
      { id: "to-moonpage", x: 140, y: 612, toMap: "moonpage", toX: 2144, toY: 612, label: "←つきよのページへ" },
      { id: "to-lullaby", x: 2244, y: 612, toMap: "lullaby", toX: 140, toY: 612, label: "こもりうたの間へ→" },
    ],
    ladders: [{ x: 980, y1: 387, y2: 656 }, { x: 1500, y1: 467, y2: 656 }],
    npcs: [guideFairy()],
  },
  lullaby: {
    id: "lullaby", name: "こもりうたの間", width: 2000, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1000, y: 688, w: 2000, h: 64 },
      { x: 500, y: 500, w: 220, h: 26 }, { x: 950, y: 410, w: 200, h: 26 }, { x: 1450, y: 480, w: 240, h: 26 },
    ],
    enemies: [
      { id: "lu-1", kind: "keshiboo", level: 53, x: 520, y: 636, patrolMin: 380, patrolMax: 720 },
      { id: "lu-2", kind: "kinoko", level: 54, x: 1000, y: 636, patrolMin: 860, patrolMax: 1200 },
      { id: "lu-3", kind: "rafbear", level: 55, x: 1650, y: 630, patrolMin: 1480, patrolMax: 1880, boss: true },
    ],
    doors: [
      { id: "to-dream", x: 140, y: 612, toMap: "dream", toX: 2244, toY: 612, label: "←ゆめのなかへ" },
      { id: "to-storm", x: 1944, y: 612, toMap: "storm", toX: 140, toY: 612, label: "あらしのうみへ→" },
    ],
    ladders: [{ x: 950, y1: 397, y2: 656 }, { x: 1450, y1: 467, y2: 656 }],
    npcs: [guideFairy()],
  },

  // ============ 第5章 あらしのうみ（Lv55-70）============
  storm: {
    id: "storm", name: "あらしのうみ", width: 2300, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1150, y: 688, w: 2300, h: 64 },
      { x: 520, y: 510, w: 220, h: 26 }, { x: 980, y: 410, w: 200, h: 26 }, { x: 1500, y: 490, w: 260, h: 26 }, { x: 2000, y: 400, w: 220, h: 26 },
    ],
    enemies: [
      { id: "st-1", kind: "golem", level: 56, x: 520, y: 636, patrolMin: 380, patrolMax: 720 },
      { id: "st-2", kind: "fudemushi", level: 58, x: 1050, y: 636, patrolMin: 900, patrolMax: 1250 },
      { id: "st-3", kind: "inkdama", level: 60, x: 1550, y: 636, patrolMin: 1400, patrolMax: 1760 },
      { id: "st-4", kind: "kinoko", level: 62, x: 2050, y: 636, patrolMin: 1900, patrolMax: 2200 },
    ],
    doors: [
      { id: "to-lullaby", x: 140, y: 612, toMap: "lullaby", toX: 1944, toY: 612, label: "←こもりうたの間へ" },
      { id: "to-thunder", x: 2244, y: 612, toMap: "thunder", toX: 140, toY: 612, label: "かみなりだいちへ→" },
    ],
    ladders: [{ x: 980, y1: 397, y2: 656 }, { x: 1500, y1: 477, y2: 656 }],
    npcs: [guideFairy()],
  },
  thunder: {
    id: "thunder", name: "かみなりだいち", width: 2300, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1150, y: 688, w: 2300, h: 64 },
      { x: 500, y: 500, w: 220, h: 26 }, { x: 1000, y: 400, w: 200, h: 26 }, { x: 1500, y: 480, w: 260, h: 26 }, { x: 2000, y: 410, w: 220, h: 26 },
    ],
    enemies: [
      { id: "th-1", kind: "inkdama", level: 63, x: 520, y: 636, patrolMin: 380, patrolMax: 720 },
      { id: "th-2", kind: "golem", level: 65, x: 1050, y: 636, patrolMin: 900, patrolMax: 1250 },
      { id: "th-3", kind: "fudemushi", level: 66, x: 1550, y: 636, patrolMin: 1400, patrolMax: 1760 },
      { id: "th-4", kind: "keshiboo", level: 68, x: 2050, y: 636, patrolMin: 1900, patrolMax: 2200 },
    ],
    doors: [
      { id: "to-storm", x: 140, y: 612, toMap: "storm", toX: 2244, toY: 612, label: "←あらしのうみへ" },
      { id: "to-maelstrom", x: 2244, y: 612, toMap: "maelstrom", toX: 140, toY: 612, label: "うずまきの底へ→" },
    ],
    ladders: [{ x: 1000, y1: 387, y2: 656 }, { x: 1500, y1: 467, y2: 656 }],
    npcs: [guideFairy()],
  },
  maelstrom: {
    id: "maelstrom", name: "うずまきの底", width: 2000, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1000, y: 688, w: 2000, h: 64 },
      { x: 500, y: 500, w: 220, h: 26 }, { x: 950, y: 410, w: 200, h: 26 }, { x: 1450, y: 480, w: 240, h: 26 },
    ],
    enemies: [
      { id: "ma-1", kind: "golem", level: 68, x: 520, y: 636, patrolMin: 380, patrolMax: 720 },
      { id: "ma-2", kind: "fudemushi", level: 69, x: 1000, y: 636, patrolMin: 860, patrolMax: 1200 },
      { id: "ma-3", kind: "golem", level: 70, x: 1650, y: 628, patrolMin: 1480, patrolMax: 1880, boss: true },
    ],
    doors: [
      { id: "to-thunder", x: 140, y: 612, toMap: "thunder", toX: 2244, toY: 612, label: "←かみなりだいちへ" },
      { id: "to-rainbow", x: 1944, y: 612, toMap: "rainbow", toX: 140, toY: 612, label: "にじのかけはしへ→" },
    ],
    ladders: [{ x: 950, y1: 397, y2: 656 }, { x: 1450, y1: 467, y2: 656 }],
    npcs: [guideFairy()],
  },

  // ============ 第6章 にじのかなた（Lv70-85）============
  rainbow: {
    id: "rainbow", name: "にじのかけはし", width: 2400, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1200, y: 688, w: 2400, h: 64 },
      { x: 520, y: 510, w: 220, h: 26 }, { x: 1000, y: 410, w: 200, h: 26 }, { x: 1500, y: 490, w: 260, h: 26 }, { x: 2050, y: 400, w: 220, h: 26 },
    ],
    enemies: [
      { id: "ra-1", kind: "kinoko", level: 71, x: 520, y: 636, patrolMin: 380, patrolMax: 720 },
      { id: "ra-2", kind: "inkdama", level: 73, x: 1050, y: 636, patrolMin: 900, patrolMax: 1250 },
      { id: "ra-3", kind: "makimaki", level: 75, x: 1550, y: 636, patrolMin: 1400, patrolMax: 1760 },
      { id: "ra-4", kind: "fudemushi", level: 77, x: 2100, y: 636, patrolMin: 1950, patrolMax: 2300 },
    ],
    doors: [
      { id: "to-maelstrom", x: 140, y: 612, toMap: "maelstrom", toX: 1944, toY: 612, label: "←うずまきの底へ" },
      { id: "to-prism", x: 2344, y: 612, toMap: "prism", toX: 140, toY: 612, label: "ひかりのプリズムへ→" },
    ],
    ladders: [{ x: 1000, y1: 397, y2: 656 }, { x: 1500, y1: 477, y2: 656 }],
    npcs: [guideFairy()],
  },
  prism: {
    id: "prism", name: "ひかりのプリズム", width: 2300, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1150, y: 688, w: 2300, h: 64 },
      { x: 500, y: 500, w: 220, h: 26 }, { x: 1000, y: 400, w: 200, h: 26 }, { x: 1500, y: 480, w: 260, h: 26 }, { x: 2000, y: 410, w: 220, h: 26 },
    ],
    enemies: [
      { id: "pr-1", kind: "inkdama", level: 78, x: 520, y: 636, patrolMin: 380, patrolMax: 720 },
      { id: "pr-2", kind: "kinoko", level: 80, x: 1050, y: 636, patrolMin: 900, patrolMax: 1250 },
      { id: "pr-3", kind: "fudemushi", level: 82, x: 1550, y: 636, patrolMin: 1400, patrolMax: 1760 },
      { id: "pr-4", kind: "keshiboo", level: 84, x: 2050, y: 636, patrolMin: 1900, patrolMax: 2200 },
    ],
    doors: [
      { id: "to-rainbow", x: 140, y: 612, toMap: "rainbow", toX: 2344, toY: 612, label: "←にじのかけはしへ" },
      { id: "to-aurora", x: 2244, y: 612, toMap: "aurora", toX: 140, toY: 612, label: "おーろらの空へ→" },
    ],
    ladders: [{ x: 1000, y1: 387, y2: 656 }, { x: 1500, y1: 467, y2: 656 }],
    npcs: [guideFairy()],
  },
  aurora: {
    id: "aurora", name: "おーろらの空", width: 2000, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1000, y: 688, w: 2000, h: 64 },
      { x: 500, y: 500, w: 220, h: 26 }, { x: 950, y: 410, w: 200, h: 26 }, { x: 1450, y: 480, w: 240, h: 26 },
    ],
    enemies: [
      { id: "au-1", kind: "fudemushi", level: 84, x: 520, y: 636, patrolMin: 380, patrolMax: 720 },
      { id: "au-2", kind: "inkdama", level: 85, x: 1000, y: 636, patrolMin: 860, patrolMax: 1200 },
      { id: "au-3", kind: "rafbear", level: 86, x: 1650, y: 630, patrolMin: 1480, patrolMax: 1880, boss: true },
    ],
    doors: [
      { id: "to-prism", x: 140, y: 612, toMap: "prism", toX: 2244, toY: 612, label: "←ひかりのプリズムへ" },
      { id: "to-edge", x: 1944, y: 612, toMap: "edge", toX: 140, toY: 612, label: "せかいのふちへ→" },
    ],
    ladders: [{ x: 950, y1: 397, y2: 656 }, { x: 1450, y1: 467, y2: 656 }],
    npcs: [guideFairy()],
  },

  // ============ 第7章 さいごのページ（Lv85-100）============
  edge: {
    id: "edge", name: "せかいのふち", width: 2400, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1200, y: 688, w: 2400, h: 64 },
      { x: 520, y: 510, w: 220, h: 26 }, { x: 1000, y: 410, w: 200, h: 26 }, { x: 1500, y: 490, w: 260, h: 26 }, { x: 2050, y: 400, w: 220, h: 26 },
    ],
    enemies: [
      { id: "ed-1", kind: "keshiboo", level: 86, x: 520, y: 636, patrolMin: 380, patrolMax: 720 },
      { id: "ed-2", kind: "golem", level: 88, x: 1050, y: 636, patrolMin: 900, patrolMax: 1250 },
      { id: "ed-3", kind: "fudemushi", level: 90, x: 1550, y: 636, patrolMin: 1400, patrolMax: 1760 },
      { id: "ed-4", kind: "rafbear", level: 92, x: 2100, y: 636, patrolMin: 1950, patrolMax: 2300 },
    ],
    doors: [
      { id: "to-aurora", x: 140, y: 612, toMap: "aurora", toX: 1944, toY: 612, label: "←おーろらの空へ" },
      { id: "to-tobira", x: 2344, y: 612, toMap: "tobira", toX: 140, toY: 612, label: "かきかけのトビラへ→" },
    ],
    ladders: [{ x: 1000, y1: 397, y2: 656 }, { x: 1500, y1: 477, y2: 656 }],
    npcs: [guideFairy()],
  },
  tobira: {
    id: "tobira", name: "かきかけのトビラ", width: 2300, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1150, y: 688, w: 2300, h: 64 },
      { x: 500, y: 500, w: 220, h: 26 }, { x: 1000, y: 400, w: 200, h: 26 }, { x: 1500, y: 480, w: 260, h: 26 }, { x: 2000, y: 410, w: 220, h: 26 },
    ],
    enemies: [
      { id: "to-1", kind: "golem", level: 93, x: 520, y: 636, patrolMin: 380, patrolMax: 720 },
      { id: "to-2", kind: "fudemushi", level: 95, x: 1050, y: 636, patrolMin: 900, patrolMax: 1250 },
      { id: "to-3", kind: "keshiboo", level: 97, x: 1550, y: 636, patrolMin: 1400, patrolMax: 1760 },
      { id: "to-4", kind: "rafbear", level: 98, x: 2050, y: 636, patrolMin: 1900, patrolMax: 2200 },
    ],
    doors: [
      { id: "to-edge", x: 140, y: 612, toMap: "edge", toX: 2344, toY: 612, label: "←せかいのふちへ" },
      { id: "to-finale", x: 2244, y: 612, toMap: "finale", toX: 140, toY: 612, label: "さいごのいちまいへ→" },
    ],
    ladders: [{ x: 1000, y1: 387, y2: 656 }, { x: 1500, y1: 467, y2: 656 }],
    npcs: [guideFairy()],
  },
  finale: {
    id: "finale", name: "さいごのいちまい", width: 2200, height: WORLD_H, spawnX: 140, spawnY: 560,
    platforms: [
      { x: 1100, y: 688, w: 2200, h: 64 },
      { x: 520, y: 500, w: 220, h: 26 }, { x: 1000, y: 410, w: 200, h: 26 }, { x: 1550, y: 480, w: 240, h: 26 },
    ],
    enemies: [
      { id: "fi-1", kind: "rafbear", level: 98, x: 520, y: 636, patrolMin: 380, patrolMax: 760 },
      { id: "fi-2", kind: "golem", level: 99, x: 1050, y: 636, patrolMin: 900, patrolMax: 1300 },
      { id: "fi-3", kind: "rafbear", level: 100, x: 1750, y: 624, patrolMin: 1500, patrolMax: 2000, boss: true },
    ],
    doors: [
      { id: "to-tobira", x: 140, y: 612, toMap: "tobira", toX: 2244, toY: 612, label: "←かきかけのトビラへ" },
    ],
    ladders: [{ x: 1000, y1: 397, y2: 656 }, { x: 1550, y1: 467, y2: 656 }],
    npcs: [guideFairy()],
  },
};
