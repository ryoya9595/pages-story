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
    npcs: [],
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
    npcs: [],
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
    npcs: [],
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
    npcs: [],
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
    npcs: [],
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
    npcs: [],
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
    doors: [{ id: "to-blank", x: 140, y: 612, toMap: "blank", toX: 1300, toY: 612, label: "←しろいページへ" }],
    ladders: [{ x: 900, y1: 417, y2: 656 }, { x: 1800, y1: 447, y2: 656 }],
    npcs: [],
  },
};
