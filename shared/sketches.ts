// 技コピー（スケッチ）定義 — サーバー・クライアント共有
// 世界観: 敵=ラクガキ。倒すとその種類の動きを「スケッチ」して覚える。
// 図鑑式＋装備: 一度倒した種類のスケッチを永続習得 → 1つ装備 → とくぎボタンで発動。
// 職業系統(rootJob)でコピー後の効果が変化する＝同じスケッチでも職で味が違う。

export type SketchType =
  | "dash" // 前方へ突進して多段ヒット
  | "aoe" // 自分中心の範囲爆発
  | "dot" // 前方に雲を出して継続ダメージ
  | "stun" // 前方の敵をノックバック＋スタン
  | "sweep" // 縦に広い薙ぎ払い
  | "buff" // 自分に防御バフ（攻撃しない）
  | "smash"; // 高威力の単発

export interface SketchDef {
  kind: string; // これを教えてくれる敵の種類（ENEMY_KINDS のキー）
  id: string;
  name: string;
  emoji: string;
  type: SketchType;
  desc: string;
  cooldownMs: number;
  dmgMul: number; // playerAtk への倍率（dot は1tickあたり）
  rangeX: number; // 前方リーチ（aoe は半径）
  rangeY: number; // 縦の当たり範囲
  durationMs?: number; // dot/stun/buff の持続
  ticks?: number; // dot のヒット回数
}

// 敵の種類 → スケッチ（技）
export const SKETCHES: Record<string, SketchDef> = {
  makimaki: {
    kind: "makimaki", id: "karaspin", name: "からスピン", emoji: "🌀", type: "dash",
    desc: "殻をまわして前方に突っこむ。多段ヒットの突進技！",
    cooldownMs: 4500, dmgMul: 1.7, rangeX: 130, rangeY: 52,
  },
  inkdama: {
    kind: "inkdama", id: "inksplash", name: "インクスプラッシュ", emoji: "💥", type: "aoe",
    desc: "墨をぶちまけて自分の周りを一気に攻撃する範囲技！",
    cooldownMs: 6000, dmgMul: 1.9, rangeX: 135, rangeY: 120,
  },
  kinoko: {
    kind: "kinoko", id: "spores", name: "ほうしクラウド", emoji: "🍄", type: "dot",
    desc: "前方に胞子の雲。しばらく当たり続けてジワジワ削る！",
    cooldownMs: 7000, dmgMul: 0.55, rangeX: 160, rangeY: 80, durationMs: 2000, ticks: 5,
  },
  keshiboo: {
    kind: "keshiboo", id: "eraser", name: "けしゴムプレス", emoji: "🧽", type: "stun",
    desc: "消しゴムで前の敵をドンッ！ノックバックさせて少しスタン。",
    cooldownMs: 8000, dmgMul: 1.1, rangeX: 115, rangeY: 60, durationMs: 1500,
  },
  fudemushi: {
    kind: "fudemushi", id: "brushwave", name: "ふでなぎ", emoji: "🖌️", type: "sweep",
    desc: "筆をふるって縦に広く薙ぎ払う。空中の敵にも届く！",
    cooldownMs: 6000, dmgMul: 1.5, rangeX: 175, rangeY: 130,
  },
  golem: {
    kind: "golem", id: "paintshield", name: "えのぐシールド", emoji: "🛡️", type: "buff",
    desc: "絵の具をまとって数秒 被ダメージ半減。守りのスケッチ。",
    cooldownMs: 12000, dmgMul: 0, rangeX: 0, rangeY: 0, durationMs: 4000,
  },
  rafbear: {
    kind: "rafbear", id: "roughsmash", name: "ラフスマッシュ", emoji: "🐻", type: "smash",
    desc: "クマの下書きの一撃を再現。前方に超高威力の一発！",
    cooldownMs: 9000, dmgMul: 3.2, rangeX: 130, rangeY: 84,
  },
};

/** 職業系統(rootJob)ごとのコピー後の味付け。castSketch時にサーバーが適用する。 */
export interface SketchJobMod {
  dmgMul: number; // 威力倍率
  rangeMul: number; // 射程・範囲倍率
  selfShieldMs: number; // 発動時に自分に付く防御バフ時間
  allyHealRatio: number; // 発動時に周囲の仲間を回復する割合（最大HP比）
}

export function sketchJobMod(rootJob: string): SketchJobMod {
  switch (rootJob) {
    case "pencil": // 近接アタッカー: 威力に寄せる
      return { dmgMul: 1.3, rangeMul: 1.0, selfShieldMs: 0, allyHealRatio: 0 };
    case "ink": // 遠距離: 射程・範囲を伸ばす
      return { dmgMul: 1.0, rangeMul: 1.6, selfShieldMs: 0, allyHealRatio: 0 };
    case "crayon": // タンク: 威力控えめだが発動時に自分へガード
      return { dmgMul: 0.9, rangeMul: 1.0, selfShieldMs: 2500, allyHealRatio: 0 };
    case "palette": // サポート: 攻撃しつつ周囲を少し回復
      return { dmgMul: 0.85, rangeMul: 1.05, selfShieldMs: 0, allyHealRatio: 0.08 };
    default: // みならい等
      return { dmgMul: 1.0, rangeMul: 1.0, selfShieldMs: 0, allyHealRatio: 0 };
  }
}

/** 防御バフ（シールド）中の被ダメージ倍率 */
export const SHIELD_DMG_MUL = 0.5;

/** スケッチ図鑑文字列のパース／シリアライズ（"makimaki,inkdama" 形式） */
export const parseSketchBook = (s: string): string[] => (s ? s.split(",").filter(Boolean) : []);
export const hasSketch = (book: string, kind: string) => parseSketchBook(book).includes(kind);
export function addSketch(book: string, kind: string): string {
  const list = parseSketchBook(book);
  if (list.includes(kind)) return book;
  list.push(kind);
  return list.join(",");
}
