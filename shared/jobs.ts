// 職業定義（サーバー・クライアント共有）
// 世界観: 画材4ロール。みならい → 1次(Lv10) → 2次(Lv30)で2系統に分岐 → 3次(Lv60) → 4次(Lv90)。
// メイプル方式: 2次で分岐し、3次・4次はその系譜を深めていく。
// 技コピー（敵の技を写し取る）は次フェーズでこの上に乗せる。

export interface JobDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  tier: 1 | 2 | 3 | 4;
  parent?: string; // tier1はparentなし（=みならいから）
  atkMul: number;
  hpMul: number;
  /** 攻撃クールタイム倍率（小さいほど連打できる） */
  atkCdMul?: number;
  range: "melee" | "ranged";
  /** 回復役フラグ＋回復量（対象の最大HPに対する割合） */
  healRatio?: number;
}

/** tier→転職可能レベル（1日で全転職を味わえるテンポ重視の配分） */
export const ADVANCE_LEVELS = [0, 5, 20, 35, 50] as const;

export const JOBS: Record<string, JobDef> = {
  // ============ ✏️ エンピツ系（近接アタッカー） ============
  pencil: {
    id: "pencil", name: "エンピツ剣士", emoji: "✏️", tier: 1,
    desc: "鉛筆の剣でガンガン斬る近接アタッカー。攻撃力が高い！",
    atkMul: 1.3, hpMul: 1.0, range: "melee",
  },
  // ── 手数の系譜
  sharp: {
    id: "sharp", name: "シャーペン剣士", emoji: "⚡", tier: 2, parent: "pencil",
    desc: "カチカチ替え芯の早業！手数で押す speed型",
    atkMul: 1.35, hpMul: 1.0, atkCdMul: 0.75, range: "melee",
  },
  drafter: {
    id: "drafter", name: "ドラフター", emoji: "📐", tier: 3, parent: "sharp",
    desc: "製図の正確さで急所を突く。さらに速く、鋭く",
    atkMul: 1.55, hpMul: 1.05, atkCdMul: 0.65, range: "melee",
  },
  sensei: {
    id: "sensei", name: "線聖（センセイ）", emoji: "🌟", tier: 4, parent: "drafter",
    desc: "一本の線に宇宙を宿す伝説の剣士",
    atkMul: 1.75, hpMul: 1.1, atkCdMul: 0.55, range: "melee",
  },
  // ── 一撃の系譜
  charcoal: {
    id: "charcoal", name: "木炭剣士", emoji: "⬛", tier: 2, parent: "pencil",
    desc: "太い木炭で重い一撃を叩き込むパワー型",
    atkMul: 1.7, hpMul: 1.1, atkCdMul: 1.2, range: "melee",
  },
  dessin: {
    id: "dessin", name: "デッサンマスター", emoji: "🗿", tier: 3, parent: "charcoal",
    desc: "陰影を見切り、最も深い一撃を描く",
    atkMul: 2.0, hpMul: 1.15, atkCdMul: 1.25, range: "melee",
  },
  graphite: {
    id: "graphite", name: "グラファイトキング", emoji: "👑", tier: 4, parent: "dessin",
    desc: "黒鉛の王。その一振りはページを割る",
    atkMul: 2.4, hpMul: 1.2, atkCdMul: 1.3, range: "melee",
  },

  // ============ 🖍️ クレヨン系（タンク） ============
  crayon: {
    id: "crayon", name: "クレヨンガード", emoji: "🖍️", tier: 1,
    desc: "厚塗りの体で仲間を守るタンク。とにかく硬い！",
    atkMul: 0.9, hpMul: 1.45, range: "melee",
  },
  // ── 鉄壁の系譜
  pastel: {
    id: "pastel", name: "パステルガード", emoji: "🌈", tier: 2, parent: "crayon",
    desc: "やわらかく受け流す守りの達人。さらに硬く",
    atkMul: 0.95, hpMul: 1.75, range: "melee",
  },
  oilknight: {
    id: "oilknight", name: "オイルナイト", emoji: "🛡️", tier: 3, parent: "pastel",
    desc: "油絵の重厚な鎧をまとう重騎士",
    atkMul: 1.0, hpMul: 2.1, range: "melee",
  },
  impasto: {
    id: "impasto", name: "インパストキング", emoji: "👑", tier: 4, parent: "oilknight",
    desc: "厚塗りの極み。もはや絵の具の要塞",
    atkMul: 1.1, hpMul: 2.5, range: "melee",
  },
  // ── 攻守の系譜
  wax: {
    id: "wax", name: "ワックスブレイバー", emoji: "🕯️", tier: 2, parent: "crayon",
    desc: "硬さに火力もプラス。攻めるタンク",
    atkMul: 1.15, hpMul: 1.5, range: "melee",
  },
  melt: {
    id: "melt", name: "メルトファイター", emoji: "🔥", tier: 3, parent: "wax",
    desc: "熱で溶かして殴る。攻防一体の格闘家",
    atkMul: 1.4, hpMul: 1.6, range: "melee",
  },
  blaze: {
    id: "blaze", name: "クレヨンブレイズ", emoji: "🌋", tier: 4, parent: "melt",
    desc: "燃えさかる蝋の化身。触れるものを塗りつぶす",
    atkMul: 1.7, hpMul: 1.75, range: "melee",
  },

  // ============ 🖋️ インク系（遠距離） ============
  ink: {
    id: "ink", name: "インクシューター", emoji: "🖋️", tier: 1,
    desc: "インクの弾を遠くから飛ばす遠距離アタッカー。",
    atkMul: 0.85, hpMul: 0.9, range: "ranged",
  },
  // ── 連射の系譜
  fountain: {
    id: "fountain", name: "万年筆ガンナー", emoji: "🖊️", tier: 2, parent: "ink",
    desc: "インクが続く限り撃ち続ける連射型",
    atkMul: 0.95, hpMul: 0.9, atkCdMul: 0.7, range: "ranged",
  },
  ballpoint: {
    id: "ballpoint", name: "ボールペンスナイパー", emoji: "🎯", tier: 3, parent: "fountain",
    desc: "ノック式の精密射撃。外さない",
    atkMul: 1.1, hpMul: 0.95, atkCdMul: 0.6, range: "ranged",
  },
  fudegami: {
    id: "fudegami", name: "筆神（フデガミ）", emoji: "🖌️", tier: 4, parent: "ballpoint",
    desc: "筆先から無限の弾幕が生まれる伝説の射手",
    atkMul: 1.25, hpMul: 1.0, atkCdMul: 0.5, range: "ranged",
  },
  // ── 威力の系譜
  splash: {
    id: "splash", name: "墨スプラッシャー", emoji: "💧", tier: 2, parent: "ink",
    desc: "どばっと重い墨弾をぶつける威力型",
    atkMul: 1.25, hpMul: 0.95, atkCdMul: 1.15, range: "ranged",
  },
  sumie: {
    id: "sumie", name: "墨絵師", emoji: "🐉", tier: 3, parent: "splash",
    desc: "一筆で龍を描き放つ墨の使い手",
    atkMul: 1.55, hpMul: 1.0, atkCdMul: 1.2, range: "ranged",
  },
  suibokuryu: {
    id: "suibokuryu", name: "水墨龍（スイボクリュウ）", emoji: "🌊", tier: 4, parent: "sumie",
    desc: "墨の龍そのものと化した究極の砲台",
    atkMul: 1.9, hpMul: 1.05, atkCdMul: 1.25, range: "ranged",
  },

  // ============ 🎨 パレット系（サポート） ============
  palette: {
    id: "palette", name: "パレットメイト", emoji: "🎨", tier: 1,
    desc: "絵の具で仲間を回復するサポーター。パーティの生命線！",
    atkMul: 0.75, hpMul: 1.0, range: "melee", healRatio: 0.18,
  },
  // ── 癒やしの系譜
  watercolor: {
    id: "watercolor", name: "水彩ヒーラー", emoji: "💧", tier: 2, parent: "palette",
    desc: "透明な水彩で大きく癒やす回復特化",
    atkMul: 0.8, hpMul: 1.05, range: "melee", healRatio: 0.26,
  },
  fresco: {
    id: "fresco", name: "フレスコセイント", emoji: "⛪", tier: 3, parent: "watercolor",
    desc: "壁画に祈りを込める聖なる画家",
    atkMul: 0.85, hpMul: 1.1, range: "melee", healRatio: 0.34,
  },
  maestro: {
    id: "maestro", name: "レインボーマエストロ", emoji: "🌈", tier: 4, parent: "fresco",
    desc: "七色の光で仲間をよみがえらせる大画家",
    atkMul: 0.9, hpMul: 1.15, range: "melee", healRatio: 0.45,
  },
  // ── 戦うサポートの系譜
  acrylic: {
    id: "acrylic", name: "アクリルペインター", emoji: "🖌️", tier: 2, parent: "palette",
    desc: "回復もできるし殴れる。攻めるサポーター",
    atkMul: 1.05, hpMul: 1.05, range: "melee", healRatio: 0.2,
  },
  muralist: {
    id: "muralist", name: "ミューラリスト", emoji: "🧱", tier: 3, parent: "acrylic",
    desc: "壁画サイズの大筆で戦う画家",
    atkMul: 1.3, hpMul: 1.1, range: "melee", healRatio: 0.22,
  },
  masterpiece: {
    id: "masterpiece", name: "マスターピース", emoji: "🏆", tier: 4, parent: "muralist",
    desc: "存在そのものが傑作。攻も癒も超一流",
    atkMul: 1.55, hpMul: 1.15, range: "melee", healRatio: 0.26,
  },
};

export const JOB_UNLOCK_LEVEL = ADVANCE_LEVELS[1];

// 遠距離攻撃のリーチ
export const RANGED_ATTACK_X = 260;
export const RANGED_ATTACK_Y = 44;

// 回復の共通パラメータ
export const HEAL_RADIUS = 180;
export const HEAL_COOLDOWN_MS = 5000;

export const jobAtkMul = (job: string) => JOBS[job]?.atkMul ?? 1;
export const jobHpMul = (job: string) => JOBS[job]?.hpMul ?? 1;
export const jobAtkCdMul = (job: string) => JOBS[job]?.atkCdMul ?? 1;
export const isHealer = (job: string) => (JOBS[job]?.healRatio ?? 0) > 0;
export const jobHealRatio = (job: string) => JOBS[job]?.healRatio ?? 0;

/** 今の職業とレベルで選べる転職先一覧 */
export function availableJobs(currentJob: string, level: number): JobDef[] {
  if (currentJob === "novice") {
    return level >= ADVANCE_LEVELS[1] ? Object.values(JOBS).filter((j) => j.tier === 1) : [];
  }
  const cur = JOBS[currentJob];
  if (!cur || cur.tier >= 4) return [];
  const nextTier = (cur.tier + 1) as 2 | 3 | 4;
  if (level < ADVANCE_LEVELS[nextTier]) return [];
  return Object.values(JOBS).filter((j) => j.parent === currentJob);
}
