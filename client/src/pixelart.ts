import Phaser from "phaser";

// ドット絵をコードで生成するモジュール。
// rows: 1文字=1ピクセル。palette: 文字→色。'.'は透明。

function pixelTexture(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  palette: Record<string, number>,
  scale = 2
) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  g.generateTexture(key, rows[0].length * scale, rows.length * scale);
  g.destroy();
}

const darken = (color: number, f = 0.72) => {
  const c = Phaser.Display.Color.IntegerToRGB(color);
  return Phaser.Display.Color.GetColor(Math.round(c.r * f), Math.round(c.g * f), Math.round(c.b * f));
};

// ============ プレイヤー（2頭身チビキャラ・16×20）============
// メイプル風プロポーション: 頭が体の半分を占める

const HEAD = [
  "....HHHHHHHH....",
  "..HHHHHHHHHHHH..",
  ".HHHHHHHHHHHHHH.",
  ".HHKKKKKKKKKKHH.",
  ".HKKKKKKKKKKKKH.",
  ".HKKEKKKKKKEKKH.",
  ".HKKEKKKKKKEKKH.",
  ".HKKKKKKKKKKKKH.",
  "..KKKKKMMKKKKK..",
  "..KKKKKKKKKKKK..",
  "...KKKKKKKKKK...",
];
const BODY = [
  "....CCCCCCCC....",
  "...CCCCCCCCCC...",
  "..KCCCCCCCCCCK..",
  "..KCCCCCCCCCCK..",
  "...CCCCCCCCCC...",
  "...DDDD..DDDD...",
];
const LEGS: Record<string, string[]> = {
  idle: ["...DDD....DDD...", "...SSS....SSS...", "..SSSS....SSSS.."],
  walk1: ["..DDD......DDD..", "..SSS......SSS..", ".SSSS......SSSS."],
  walk2: ["....DDD..DDD....", "....SSS..SSS....", "...SSSS..SSSS..."],
  jump: ["..DDDD....DDDD..", "...SSS....SSS...", "................"],
};

export const PLAYER_FRAMES = ["idle", "walk1", "walk2", "jump"] as const;

export function makePlayerTextures(scene: Phaser.Scene, colors: number[]) {
  colors.forEach((cloth, idx) => {
    const palette = {
      H: 0x5b3a24, // 髪
      K: 0xffd9b3, // 肌
      E: 0x28221c, // 目
      M: 0xc06a52, // 口
      C: cloth, // 服（プレイヤーカラー）
      D: darken(cloth), // 服の影・ズボン
      S: 0x4a3b2f, // 靴
    };
    for (const frame of PLAYER_FRAMES) {
      pixelTexture(scene, `p${idx}_${frame}`, [...HEAD, ...BODY, ...LEGS[frame]], palette);
    }
  });
}

// ============ 敵（オリジナルデザイン・メイプルの空気感）============

export function makeEnemyTextures(scene: Phaser.Scene) {
  // マキマキ: 鉛筆の削りカスが殻になったカタツムリ（14×11）
  pixelTexture(scene, "enemy_makimaki", [
    "....RRRRRR....",
    "...RSSSSSSR...",
    "..RSSRRRRSSR..",
    "..RSRRSSRRSR..",
    "..RSRRSSRRSR..",
    "..RSSRRRRSSR..",
    "...RSSSSSSR...",
    ".PP.RRRRRR....",
    "PEPPPPPPPPPP..",
    "PPPPPPPPPPPPP.",
    ".PPPPPPPPPPPP.",
  ], {
    R: 0x9c6b3f, // 削りカスの線
    S: 0xe6c188, // 削りカス（木の部分）
    P: 0xf0d9a8, // からだ
    E: 0x33291f, // 目
  });

  // インクだまり: ぷるぷる跳ねる墨のしずく（12×9）
  pixelTexture(scene, "enemy_inkdama", [
    "....IIII....",
    "..IIIIIIII..",
    ".IILIIIIIII.",
    ".IWEIIWEIII.",
    "IIIIIIIIIIII",
    "IIIIIIIIIIII",
    ".IIIIIIIIII.",
    ".IIIIIIIIII.",
    "..IIIIIIII..",
  ], {
    I: 0x41406b, // 墨（青みインク）
    L: 0x6a69a3, // ハイライト
    W: 0xffffff, // 白目
    E: 0x16142c, // 瞳
  });

  // ヌリカケキノコ: 傘が半分塗りかけのキノコ（12×12）
  pixelTexture(scene, "enemy_kinoko", [
    "...RRROOO...",
    "..RRRRROOOO.",
    ".RRRRRROOOOO",
    "RRRRRRROOOOO",
    "RRWRRRROOGOO",
    ".RRRRRROOOO.",
    "..TTTTTTTT..",
    "..TETTTTET..",
    "..TTTTTTTT..",
    "..TTTTTTTT..",
    "...TTTTTT...",
    "..TTTTTTTT..",
  ], {
    R: 0xe05c5c, // 塗られた傘
    W: 0xffffff, // 傘の白い斑点
    O: 0xf1e7d0, // 塗りかけ（紙のまま）
    G: 0xb8ab8e, // 下書きの点
    T: 0xf7efdf, // 軸
    E: 0x33291f, // 目
  });

  // ラフベアー: 描きかけで放置された巨大クマの下書き（16×14）
  pixelTexture(scene, "enemy_rafbear", [
    ".GG..........GG.",
    ".GGGGGGGGGGGGGG.",
    ".GggggggggggggG.",
    ".GgEEgggggEEggG.",
    ".GggggggggggggG.",
    ".GgggGGGGgggggG.",
    ".GGGGGGGGGGGGGG.",
    "GGGGGGGGGGGGGGGG",
    "GGgggggggggggGGG",
    "GGgggggggggggGGG",
    "GGgggggggggggGGG",
    "GGGGGGGGGGGGGGGG",
    ".GGG..GGGG..GGG.",
    ".GGG..GGGG..GGG.",
  ], {
    G: 0x6f6a63, // 鉛筆の線（濃）
    g: 0xb9b3a8, // 下書きの薄い線
    E: 0xc0392b, // 怒った目
  });
}

export const ENEMY_TEXTURES: Record<string, string> = {
  makimaki: "enemy_makimaki",
  inkdama: "enemy_inkdama",
  kinoko: "enemy_kinoko",
  rafbear: "enemy_rafbear",
  keshiboo: "enemy_keshiboo",
  fudemushi: "enemy_fudemushi",
  golem: "enemy_golem",
};

// ============ 地形・背景 ============

export function makeWorldTextures(scene: Phaser.Scene) {
  // 草の地面タイル（16×16）
  pixelTexture(scene, "tile_grass", [
    "GGGGGGGGGGGGGGGG",
    "GVGGGGVGGGGGVGGG",
    "GGGGVGGGGVGGGGGV",
    "VGGDVDGGVDDGGDVG",
    "DDDDdDDDDDDDdDDD",
    "DDdDDDDDdDDDDDDd",
    "DDDDDDdDDDDdDDDD",
    "DdDDDDDDDDDDDDdD",
    "DDDDdDDDdDDDDDDD",
    "DDDDDDDDDDDdDDDD",
    "DdDDDdDDDDDDDDdD",
    "DDDDDDDDdDDDDDDD",
    "DDdDDDDDDDDDdDDD",
    "DDDDDdDDDDDDDDDd",
    "DdDDDDDDdDDDDDDD",
    "DDDDDDDDDDDDdDDD",
  ], {
    G: 0x82c96f,
    V: 0x5fae52,
    D: 0xb08055,
    d: 0x93693f,
  });

  // 地面用の縦長タイル（16×32: 草4列＋土28列、縦リピートで縞が出ないように）
  {
    const rows: string[] = [
      "GGGGGGGGGGGGGGGG",
      "GVGGGGVGGGGGVGGG",
      "GGGGVGGGGVGGGGGV",
      "VGGDVDGGVDDGGDVG",
    ];
    for (let y = 0; y < 28; y++) {
      let row = "";
      for (let x = 0; x < 16; x++) {
        row += (x * 7 + y * 13) % 23 === 0 ? "d" : "D";
      }
      rows.push(row);
    }
    pixelTexture(scene, "tile_ground", rows, {
      G: 0x82c96f,
      V: 0x5fae52,
      D: 0xb08055,
      d: 0x93693f,
    });
  }

  // はしご（16×8 タイル・縦リピート）
  pixelTexture(scene, "ladder", [
    "...WW......WW...",
    "...WWWWWWWWWW...",
    "...WW......WW...",
    "...WW......WW...",
    "...WW......WW...",
    "...WWWWWWWWWW...",
    "...WW......WW...",
    "...WW......WW...",
  ], {
    W: 0x8a5f3a,
  });

  // 雲（18×7）
  pixelTexture(scene, "cloud", [
    "......WWWWW.......",
    "....WWWWWWWWW.....",
    "..WWWWWWWWWWWWW...",
    ".WWWWWWWWWWWWWWWW.",
    "WWWWWWWWWWWWWWWWWW",
    ".WWWWWWWWWWWWWWWW.",
    "..WWWWWWWWWWWW....",
  ], {
    W: 0xffffff,
  }, 3);
}

// ============ 主人公の色違い生成（髪などの紫系だけ色相回転） ============

function recolorHero(scene: Phaser.Scene, srcKey: string, newKey: string, hueShift: number) {
  if (scene.textures.exists(newKey) || !scene.textures.exists(srcKey)) return;
  const src = scene.textures.get(srcKey).getSourceImage() as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 16) continue; // 無彩色はそのまま
    let h = 0;
    if (max === r) h = (((g - b) / (max - min)) % 6 + 6) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    h = h * 60;
    if (h < 220 || h > 330) continue; // 紫〜青紫（髪・服の一部）だけ対象
    const nh = (h + hueShift + 360) % 360;
    const s = (max - min) / (max || 1);
    const v = max / 255;
    const c = v * s;
    const x = c * (1 - Math.abs(((nh / 60) % 2) - 1));
    const m0 = v - c;
    let rr = 0, gg = 0, bb = 0;
    if (nh < 60) { rr = c; gg = x; } else if (nh < 120) { rr = x; gg = c; }
    else if (nh < 180) { gg = c; bb = x; } else if (nh < 240) { gg = x; bb = c; }
    else if (nh < 300) { rr = x; bb = c; } else { rr = c; bb = x; }
    d[i] = Math.round((rr + m0) * 255);
    d[i + 1] = Math.round((gg + m0) * 255);
    d[i + 2] = Math.round((bb + m0) * 255);
  }
  ctx.putImageData(img, 0, 0);
  const tex = scene.textures.addCanvas(newKey, canvas);
  if (!tex) return;
  const cols = Math.floor(canvas.width / 48);
  const rowsN = Math.floor(canvas.height / 64);
  let f = 0;
  for (let y = 0; y < rowsN; y++) for (let x0 = 0; x0 < cols; x0++) tex.add(f++, 0, x0 * 48, y * 64, 48, 64);
}

/** 4キャラ分の色違いシートを用意（f2=赤毛, m2=金髪） */
export function ensureHeroVariantSheets(scene: Phaser.Scene, animsList: string[]) {
  for (const a of animsList) {
    recolorHero(scene, `hero_f_${a}`, `hero_f2_${a}`, 120); // 紫→赤系
    recolorHero(scene, `hero_m_${a}`, `hero_m2_${a}`, 150); // 紫→金系
  }
}
